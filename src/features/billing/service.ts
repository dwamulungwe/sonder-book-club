import { createHash } from "node:crypto";

import {
  BillingInterval,
  InvoiceStatus,
  MembershipStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  SubscriptionStatus,
} from "@prisma/client";

import {
  notifyInvoiceCreated,
  notifyPaymentConfirmed,
  notifyPaymentFailed,
  notifyPaymentRecorded,
  notifySubscriptionWaived,
} from "@/features/notifications/service";
import { db } from "@/lib/db";
import {
  assertValidMinorUnitAmount,
  formatMinorUnits,
  normalizeCurrencyCode,
} from "@/features/billing/currency";

const INVOICE_DUE_DAYS = 14;

const CURRENT_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  SubscriptionStatus.PENDING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.PAUSED,
  SubscriptionStatus.WAIVED,
] as const;

export const INVOICE_PAYABLE_STATUSES: readonly InvoiceStatus[] = [
  InvoiceStatus.OPEN,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
] as const;

const PAYMENT_CONFIRMABLE_STATUSES: readonly PaymentStatus[] = [
  PaymentStatus.PENDING,
] as const;
const PAYMENT_CONFIRMED_STATUSES: readonly PaymentStatus[] = [
  PaymentStatus.CONFIRMED,
  PaymentStatus.PAID,
] as const;

type Tx = Prisma.TransactionClient;

export class BillingError extends Error {}

export const BILLING_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 20_000,
};
const BILLING_TRANSACTION_RETRY_COUNT = 2;

const BILLING_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  deletedAt: true,
  notificationPreference: true,
} satisfies Prisma.UserSelect;

const BILLING_RECIPIENT_SELECT = {
  id: true,
  email: true,
  name: true,
  notificationPreference: true,
} satisfies Prisma.UserSelect;

export type MembershipPlanInput = {
  planId?: string;
  name: string;
  description?: string | null;
  amountMinor: bigint;
  currency: string;
  billingInterval: BillingInterval;
  intervalCount: number;
  isActive: boolean;
  isDefault: boolean;
  createdById: string;
};

export type RecordPaymentInput = {
  membershipId: string;
  invoiceId?: string | null;
  amountMinor?: bigint | null;
  currency?: string | null;
  method: PaymentMethod;
  externalReference?: string | null;
  notes?: string | null;
  paidAt?: Date | null;
  recordedById: string;
  idempotencyKey?: string | null;
};

function isRetryableBillingTransactionError(error: unknown) {
  if (error instanceof BillingError) {
    return false;
  }

  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code === "P2034") {
    return true;
  }

  const details = `${error.message} ${JSON.stringify(error.meta ?? {})}`
    .toLowerCase();

  return (
    details.includes("deadlock") ||
    details.includes("could not serialize") ||
    details.includes("serialization failure")
  );
}

export async function runBillingTransaction<T>(
  operation: (tx: Tx) => Promise<T>,
  retryCount = BILLING_TRANSACTION_RETRY_COUNT,
) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await db.$transaction(operation, BILLING_TRANSACTION_OPTIONS);
    } catch (error) {
      if (
        attempt >= retryCount ||
        !isRetryableBillingTransactionError(error)
      ) {
        throw error;
      }
    }
  }
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addBillingPeriod(
  start: Date,
  interval: BillingInterval,
  intervalCount: number,
) {
  const end = new Date(start);

  if (interval === BillingInterval.MONTHLY) {
    end.setMonth(end.getMonth() + intervalCount);
  } else if (interval === BillingInterval.QUARTERLY) {
    end.setMonth(end.getMonth() + intervalCount * 3);
  } else if (interval === BillingInterval.ANNUAL) {
    end.setFullYear(end.getFullYear() + intervalCount);
  } else {
    end.setDate(end.getDate() + 1);
  }

  return end;
}

function dateKey(date: Date | null | undefined) {
  if (!date) {
    return "none";
  }

  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function stableDigest(
  ...parts: Array<string | number | bigint | Date | null | undefined>
) {
  return createHash("sha256")
    .update(
      parts
        .map((part) =>
          part instanceof Date ? part.toISOString() : String(part ?? "none"),
        )
        .join("|"),
    )
    .digest("hex")
    .slice(0, 12)
    .toUpperCase();
}

export function generateInvoiceNumber(input: {
  membershipId: string;
  subscriptionId?: string | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}) {
  const period = dateKey(input.periodStart);
  return `INV-${period}-${stableDigest(
    input.membershipId,
    input.subscriptionId,
    input.periodStart,
    input.periodEnd,
  )}`;
}

export function generatePaymentInternalReference(input: {
  membershipId: string;
  invoiceId?: string | null;
  amountMinor: bigint;
  idempotencyKey?: string | null;
  paidAt?: Date | null;
  createdAt?: Date | null;
}) {
  const referenceDate = dateKey(input.paidAt ?? input.createdAt ?? new Date());
  return `PAY-${referenceDate}-${stableDigest(
    input.membershipId,
    input.invoiceId,
    input.amountMinor,
    input.idempotencyKey,
    input.paidAt,
    input.createdAt,
  )}`;
}

function scopedPaymentIdempotencyKey(input: {
  membershipId: string;
  invoiceId?: string | null;
  idempotencyKey?: string | null;
}) {
  const rawKey = input.idempotencyKey?.trim();

  if (!rawKey) {
    return null;
  }

  // The browser contributes only a submission nonce. Sonder derives the trust
  // boundary from server-validated membership and invoice identifiers.
  return `manual:${stableDigest(
    input.membershipId,
    input.invoiceId ?? "standalone",
    rawKey,
  )}`;
}

function assertPositiveMinorAmount(amountMinor: bigint | number) {
  const validAmount = assertValidMinorUnitAmount(amountMinor);

  if (validAmount <= 0) {
    throw new BillingError("Amount must be greater than zero.");
  }

  return validAmount;
}

function assertSupportedOfflineMethod(method: PaymentMethod) {
  if (method === PaymentMethod.CARD) {
    throw new BillingError("Card payments are not enabled in this build.");
  }

  return method;
}

function invoiceBalance(input: {
  amountDueMinor: bigint;
  amountPaidMinor: bigint;
}) {
  return input.amountDueMinor - input.amountPaidMinor;
}

export function calculateInvoiceBalance(input: {
  amountDueMinor: bigint;
  amountPaidMinor: bigint;
}) {
  const balance = invoiceBalance(input);
  return balance > 0 ? balance : BigInt(0);
}

export function calculateMemberBillingStatus(input: {
  subscriptionStatus?: SubscriptionStatus | null;
  openInvoiceCount: number;
  overdueInvoiceCount: number;
}) {
  if (input.overdueInvoiceCount > 0) {
    return SubscriptionStatus.PAST_DUE;
  }

  if (input.subscriptionStatus) {
    return input.subscriptionStatus;
  }

  return input.openInvoiceCount > 0
    ? SubscriptionStatus.PENDING
    : SubscriptionStatus.CANCELLED;
}

function isConfirmedPaymentStatus(status: PaymentStatus) {
  return PAYMENT_CONFIRMED_STATUSES.includes(status);
}

async function getMembershipForBilling(tx: Tx, membershipId: string) {
  const membership = await tx.membership.findUnique({
    where: {
      id: membershipId,
    },
    include: {
      user: {
        select: BILLING_USER_SELECT,
      },
    },
  });

  if (!membership || membership.user.deletedAt) {
    throw new BillingError("Member not found.");
  }

  if (membership.status !== MembershipStatus.ACTIVE) {
    throw new BillingError("Only active members can receive billing changes.");
  }

  return membership;
}

export async function createOrUpdateMembershipPlan(input: MembershipPlanInput) {
  const amountMinor = assertPositiveMinorAmount(input.amountMinor);
  const currency = normalizeCurrencyCode(input.currency);

  if (input.isDefault && !input.isActive) {
    throw new BillingError("Only active plans can be the default plan.");
  }

  return runBillingTransaction(
    async (tx) => {
      if (input.isDefault) {
        await tx.membershipPlan.updateMany({
          where: {
            ...(input.planId ? { id: { not: input.planId } } : {}),
            isDefault: true,
          },
          data: {
            isDefault: false,
          },
        });
      }

      if (input.planId) {
        return tx.membershipPlan.update({
          where: {
            id: input.planId,
          },
          data: {
            name: input.name,
            description: input.description || null,
            amountMinor,
            currency,
            billingInterval: input.billingInterval,
            intervalCount: input.intervalCount,
            isActive: input.isActive,
            isDefault: input.isDefault,
          },
        });
      }

      return tx.membershipPlan.create({
        data: {
          name: input.name,
          description: input.description || null,
          amountMinor,
          currency,
          billingInterval: input.billingInterval,
          intervalCount: input.intervalCount,
          isActive: input.isActive,
          isDefault: input.isDefault,
          createdById: input.createdById,
        },
      });
    },
  );
}

export async function assignPlanToMembership(input: {
  membershipId: string;
  planId: string;
  assignedById: string;
  startedAt?: Date;
}) {
  const now = input.startedAt ?? new Date();

  return runBillingTransaction(
    async (tx) => {
      await getMembershipForBilling(tx, input.membershipId);

      const plan = await tx.membershipPlan.findUnique({
        where: {
          id: input.planId,
        },
      });

      if (!plan || !plan.isActive) {
        throw new BillingError("Only active plans can be assigned.");
      }

      const current = await tx.memberSubscription.findFirst({
        where: {
          membershipId: input.membershipId,
          status: {
            in: [...CURRENT_SUBSCRIPTION_STATUSES],
          },
        },
      });

      if (
        current?.planId === plan.id &&
        current.status === SubscriptionStatus.ACTIVE
      ) {
        return current;
      }

      await tx.memberSubscription.updateMany({
        where: {
          membershipId: input.membershipId,
          status: {
            in: [...CURRENT_SUBSCRIPTION_STATUSES],
          },
        },
        data: {
          status: SubscriptionStatus.CANCELLED,
          cancelledAt: now,
          nextBillingAt: null,
        },
      });

      const currentPeriodEnd = addBillingPeriod(
        now,
        plan.billingInterval,
        plan.intervalCount,
      );

      return tx.memberSubscription.create({
        data: {
          membershipId: input.membershipId,
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          startedAt: now,
          currentPeriodStart: now,
          currentPeriodEnd,
          nextBillingAt:
            plan.billingInterval === BillingInterval.ONE_TIME
              ? null
              : currentPeriodEnd,
        },
      });
    },
  );
}

async function createInvoiceForSubscriptionPeriodInTx(
  tx: Tx,
  input: {
    subscriptionId: string;
    createdById?: string | null;
  },
) {
  const subscription = await tx.memberSubscription.findUnique({
    where: {
      id: input.subscriptionId,
    },
    include: {
      plan: true,
      membership: {
        include: {
          user: {
            select: BILLING_USER_SELECT,
          },
        },
      },
    },
  });

  if (!subscription || subscription.membership.user.deletedAt) {
    throw new BillingError("Subscription not found.");
  }

  if (subscription.membership.status !== MembershipStatus.ACTIVE) {
    throw new BillingError("Only active members can receive invoices.");
  }

  if (
    subscription.status !== SubscriptionStatus.ACTIVE &&
    subscription.status !== SubscriptionStatus.PAST_DUE
  ) {
    throw new BillingError("Only active or past-due subscriptions can be invoiced.");
  }

  const invoiceNumber = generateInvoiceNumber({
    membershipId: subscription.membershipId,
    subscriptionId: subscription.id,
    periodStart: subscription.currentPeriodStart,
    periodEnd: subscription.currentPeriodEnd,
  });
  const existing = await tx.membershipInvoice.findUnique({
    where: {
      invoiceNumber,
    },
  });

  if (existing) {
    return existing;
  }

  const amountDueMinor = assertPositiveMinorAmount(subscription.plan.amountMinor);
  const currency = normalizeCurrencyCode(subscription.plan.currency);
  const invoice = await tx.membershipInvoice.create({
    data: {
      membershipId: subscription.membershipId,
      subscriptionId: subscription.id,
      invoiceNumber,
      status: InvoiceStatus.OPEN,
      description: `${subscription.plan.name} dues`,
      amountDueMinor,
      amountPaidMinor: BigInt(0),
      currency,
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd,
      dueAt: addDays(subscription.currentPeriodStart, INVOICE_DUE_DAYS),
      createdById: input.createdById,
    },
  });

  await notifyInvoiceCreated(tx, {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    recipient: subscription.membership.user,
    amountFormatted: formatMinorUnits(invoice.amountDueMinor, invoice.currency),
  });

  return invoice;
}

export async function createInvoiceForSubscriptionPeriod(input: {
  subscriptionId: string;
  createdById?: string | null;
}) {
  return runBillingTransaction((tx) =>
    createInvoiceForSubscriptionPeriodInTx(tx, input),
  );
}

export async function createInvoiceForMembershipCurrentPeriod(input: {
  membershipId: string;
  createdById: string;
}) {
  return runBillingTransaction(
    async (tx) => {
      await getMembershipForBilling(tx, input.membershipId);

      const subscription = await tx.memberSubscription.findFirst({
        where: {
          membershipId: input.membershipId,
          status: {
            in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE],
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      if (!subscription) {
        throw new BillingError("Assign an active plan before creating an invoice.");
      }

      return createInvoiceForSubscriptionPeriodInTx(tx, {
        subscriptionId: subscription.id,
        createdById: input.createdById,
      });
    },
  );
}

export async function recordPayment(input: RecordPaymentInput) {
  const method = assertSupportedOfflineMethod(input.method);
  const paidAt = input.paidAt ?? new Date();
  const idempotencyKey = scopedPaymentIdempotencyKey(input);

  return runBillingTransaction(
    async (tx) => {
      if (idempotencyKey) {
        const existing = await tx.membershipPayment.findUnique({
          where: {
            idempotencyKey,
          },
        });

        if (existing) {
          return existing;
        }
      }

      const membership = await getMembershipForBilling(tx, input.membershipId);
      let invoice:
        | Awaited<ReturnType<typeof tx.membershipInvoice.findUnique>>
        | null = null;

      if (input.invoiceId) {
        invoice = await tx.membershipInvoice.findUnique({
          where: {
            id: input.invoiceId,
          },
        });

        if (!invoice || invoice.membershipId !== input.membershipId) {
          throw new BillingError("Invoice not found for that member.");
        }

        if (!INVOICE_PAYABLE_STATUSES.includes(invoice.status)) {
          throw new BillingError("Only open, partial, or overdue invoices can be paid.");
        }
      }

      const currency = normalizeCurrencyCode(
        invoice?.currency ?? input.currency ?? "ZMW",
      );
      const balance = invoice ? calculateInvoiceBalance(invoice) : null;

      if (balance != null && balance <= 0) {
        throw new BillingError("That invoice is already fully paid.");
      }

      const amountMinor =
        input.amountMinor == null
          ? balance
          : assertPositiveMinorAmount(input.amountMinor);

      if (amountMinor == null) {
        throw new BillingError("Standalone payments require an amount.");
      }

      assertPositiveMinorAmount(amountMinor);

      if (balance != null && amountMinor > balance) {
        throw new BillingError("Payment amount cannot exceed invoice balance.");
      }

      const now = new Date();
      const payment = await tx.membershipPayment.create({
        data: {
          membershipId: input.membershipId,
          invoiceId: invoice?.id,
          amountMinor,
          currency,
          status: PaymentStatus.PENDING,
          method,
          externalReference: input.externalReference || null,
          internalReference: generatePaymentInternalReference({
            membershipId: input.membershipId,
            invoiceId: invoice?.id,
            amountMinor,
            idempotencyKey: input.idempotencyKey,
            paidAt,
            createdAt: now,
          }),
          dueAt: invoice?.dueAt ?? null,
          paidAt,
          periodStart: invoice?.periodStart ?? null,
          periodEnd: invoice?.periodEnd ?? null,
          notes: input.notes || null,
          recordedById: input.recordedById,
          idempotencyKey,
        },
      });

      await notifyPaymentRecorded(tx, {
        paymentId: payment.id,
        recipient: membership.user,
        amountFormatted: formatMinorUnits(payment.amountMinor, payment.currency),
        invoiceNumber: invoice?.invoiceNumber ?? null,
        paymentReference: payment.internalReference,
      });

      return payment;
    },
  );
}

export async function confirmPayment(input: {
  paymentId: string;
  confirmedById: string;
}) {
  const now = new Date();

  return runBillingTransaction(
    async (tx) => {
      const payment = await tx.membershipPayment.findUnique({
        where: {
          id: input.paymentId,
        },
        include: {
          invoice: true,
          membership: {
            include: {
              user: {
                select: BILLING_RECIPIENT_SELECT,
              },
            },
          },
        },
      });

      if (!payment) {
        throw new BillingError("Payment not found.");
      }

      if (isConfirmedPaymentStatus(payment.status)) {
        return payment;
      }

      if (!PAYMENT_CONFIRMABLE_STATUSES.includes(payment.status)) {
        throw new BillingError("Only pending payments can be confirmed.");
      }

      assertPositiveMinorAmount(payment.amountMinor);

      if (payment.invoice) {
        if (payment.invoice.membershipId !== payment.membershipId) {
          throw new BillingError("Payment and invoice belong to different members.");
        }

        if (payment.invoice.currency !== payment.currency) {
          throw new BillingError("Payment currency does not match invoice currency.");
        }

        if (payment.invoice.status === InvoiceStatus.VOID) {
          throw new BillingError("Voided invoices cannot receive payments.");
        }

        const balance = calculateInvoiceBalance(payment.invoice);

        if (balance <= 0) {
          throw new BillingError("That invoice is already fully paid.");
        }

        if (payment.amountMinor > balance) {
          throw new BillingError("Payment amount cannot exceed invoice balance.");
        }
      }

      const updatedPayment = await tx.membershipPayment.updateMany({
        where: {
          id: payment.id,
          status: PaymentStatus.PENDING,
        },
        data: {
          status: PaymentStatus.CONFIRMED,
          confirmedAt: now,
          confirmedById: input.confirmedById,
          paidAt: payment.paidAt ?? now,
        },
      });

      if (updatedPayment.count !== 1) {
        const latest = await tx.membershipPayment.findUnique({
          where: {
            id: payment.id,
          },
        });

        if (latest && isConfirmedPaymentStatus(latest.status)) {
          return latest;
        }

        throw new BillingError("That payment was already changed. Refresh and try again.");
      }

      if (payment.invoiceId) {
        const allocated = await tx.$executeRaw`
          UPDATE "membership_invoices"
          SET
            "amountPaidMinor" = "amountPaidMinor" + ${payment.amountMinor},
            "status" = CASE
              WHEN "amountPaidMinor" + ${payment.amountMinor} = "amountDueMinor"
                THEN 'PAID'::"InvoiceStatus"
              ELSE 'PARTIALLY_PAID'::"InvoiceStatus"
            END,
            "paidAt" = CASE
              WHEN "amountPaidMinor" + ${payment.amountMinor} = "amountDueMinor"
                THEN ${now}
              ELSE "paidAt"
            END,
            "updatedAt" = ${now}
          WHERE "id" = ${payment.invoiceId}
            AND "membershipId" = ${payment.membershipId}
            AND "currency" = ${payment.currency}
            AND "status" IN ('OPEN'::"InvoiceStatus", 'PARTIALLY_PAID'::"InvoiceStatus", 'OVERDUE'::"InvoiceStatus")
            AND "amountPaidMinor" < "amountDueMinor"
            AND "amountPaidMinor" + ${payment.amountMinor} <= "amountDueMinor"
        `;

        if (Number(allocated) !== 1) {
          throw new BillingError(
            "Payment could not be allocated without exceeding the invoice balance.",
          );
        }
      }

      await notifyPaymentConfirmed(tx, {
        paymentId: payment.id,
        recipient: payment.membership.user,
        actorId: input.confirmedById,
        amountFormatted: formatMinorUnits(payment.amountMinor, payment.currency),
        invoiceNumber: payment.invoice?.invoiceNumber ?? null,
        paymentReference: payment.internalReference,
      });

      const confirmedPayment = await tx.membershipPayment.findUniqueOrThrow({
        where: {
          id: payment.id,
        },
        include: {
          invoice: true,
        },
      });

      return confirmedPayment;
    },
  );
}

export async function markPaymentFailed(input: {
  paymentId: string;
  actorId: string;
}) {
  return runBillingTransaction(
    async (tx) => {
      const payment = await tx.membershipPayment.findUnique({
        where: {
          id: input.paymentId,
        },
        include: {
          membership: {
            include: {
              user: {
                select: BILLING_RECIPIENT_SELECT,
              },
            },
          },
          invoice: true,
        },
      });

      if (!payment) {
        throw new BillingError("Payment not found.");
      }

      if (payment.status !== PaymentStatus.PENDING) {
        throw new BillingError("Only pending payments can be marked failed.");
      }

      const updated = await tx.membershipPayment.update({
        where: {
          id: payment.id,
        },
        data: {
          status: PaymentStatus.FAILED,
        },
      });

      await notifyPaymentFailed(tx, {
        paymentId: payment.id,
        recipient: payment.membership.user,
        actorId: input.actorId,
        amountFormatted: formatMinorUnits(payment.amountMinor, payment.currency),
        invoiceNumber: payment.invoice?.invoiceNumber ?? null,
      });

      return updated;
    },
  );
}

export async function voidInvoice(input: {
  invoiceId: string;
  voidedById: string;
}) {
  const now = new Date();

  const updated = await db.membershipInvoice.updateMany({
    where: {
      id: input.invoiceId,
      amountPaidMinor: BigInt(0),
      status: {
        in: [InvoiceStatus.DRAFT, InvoiceStatus.OPEN, InvoiceStatus.OVERDUE],
      },
    },
    data: {
      status: InvoiceStatus.VOID,
      voidedAt: now,
    },
  });

  if (updated.count !== 1) {
    throw new BillingError(
      "Only unpaid draft, open, or overdue invoices can be voided.",
    );
  }
}

export async function updateSubscriptionState(input: {
  subscriptionId: string;
  action: "pause" | "cancel" | "waive";
  reason?: string | null;
  actorId: string;
}) {
  const now = new Date();

  return runBillingTransaction(
    async (tx) => {
      const subscription = await tx.memberSubscription.findUnique({
        where: {
          id: input.subscriptionId,
        },
        include: {
          membership: {
            include: {
              user: {
                select: BILLING_RECIPIENT_SELECT,
              },
            },
          },
          plan: true,
        },
      });

      if (!subscription) {
        throw new BillingError("Subscription not found.");
      }

      if (subscription.status === SubscriptionStatus.CANCELLED) {
        return subscription;
      }

      if (input.action === "waive" && !input.reason?.trim()) {
        throw new BillingError("A waiver reason is required.");
      }

      const data =
        input.action === "pause"
          ? {
              status: SubscriptionStatus.PAUSED,
              pausedAt: now,
              nextBillingAt: null,
            }
          : input.action === "cancel"
            ? {
                status: SubscriptionStatus.CANCELLED,
                cancelledAt: now,
                nextBillingAt: null,
              }
            : {
                status: SubscriptionStatus.WAIVED,
                waiverReason: input.reason?.trim() ?? null,
                nextBillingAt: null,
              };

      const updated = await tx.memberSubscription.update({
        where: {
          id: subscription.id,
        },
        data,
      });

      if (input.action === "waive") {
        await notifySubscriptionWaived(tx, {
          subscriptionId: subscription.id,
          recipient: subscription.membership.user,
          actorId: input.actorId,
          planName: subscription.plan.name,
        });
      }

      return updated;
    },
  );
}
