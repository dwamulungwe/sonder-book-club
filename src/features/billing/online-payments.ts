import {
  InvoiceStatus,
  MembershipStatus,
  OnlinePaymentAttemptStatus,
  OnlinePaymentProvider,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ProviderWebhookEventStatus,
  SystemRole,
} from "@prisma/client";

import {
  formatMinorUnits,
  normalizeCurrencyCode,
} from "@/features/billing/currency";
import {
  getPaymentProvider,
  type PaymentProvider,
  type PaymentProviderVerification,
  type PaymentWebhookInput,
  type PaymentWebhookResult,
  type ProviderPaymentStatus,
} from "@/features/billing/payment-provider";
import {
  checkoutIdempotencyKeyForNonce,
  generateTrustedSonderTransactionReference,
} from "@/features/billing/online-payment-references";
import {
  BillingError,
  calculateInvoiceBalance,
  generatePaymentInternalReference,
  INVOICE_PAYABLE_STATUSES,
  runBillingTransaction,
} from "@/features/billing/service";
import {
  notifyOnlinePaymentReviewRequired,
  notifyPaymentConfirmed,
} from "@/features/notifications/service";
import { db } from "@/lib/db";
import { canManageBilling } from "@/lib/permissions";

const ACTIVE_ATTEMPT_STATUSES: readonly OnlinePaymentAttemptStatus[] = [
  OnlinePaymentAttemptStatus.CREATED,
  OnlinePaymentAttemptStatus.CHECKOUT_READY,
  OnlinePaymentAttemptStatus.PROCESSING,
  OnlinePaymentAttemptStatus.VERIFIED,
] as const;

const TERMINAL_ATTEMPT_STATUSES: readonly OnlinePaymentAttemptStatus[] = [
  OnlinePaymentAttemptStatus.SETTLED,
  OnlinePaymentAttemptStatus.FAILED,
  OnlinePaymentAttemptStatus.CANCELLED,
  OnlinePaymentAttemptStatus.EXPIRED,
  OnlinePaymentAttemptStatus.REVIEW_REQUIRED,
] as const;

const STATUS_CHECK_COOLDOWN_MS = 60_000;
const STALE_PROCESSING_AFTER_MS = 30 * 60_000;
const CHECKOUT_PREPARATION_STALE_MS = 2 * 60_000;
const ONLINE_PAYMENT_ADMIN_LIMIT = 25;

type Tx = Prisma.TransactionClient;

type MembershipForCheckout = Prisma.MembershipGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        email: true;
        name: true;
        deletedAt: true;
        profile: {
          select: {
            phoneNumber: true;
          };
        };
        notificationPreference: true;
      };
    };
  };
}>;

type InvoiceForCheckout =
  Prisma.MembershipInvoiceGetPayload<Prisma.MembershipInvoiceDefaultArgs>;

type OnlinePaymentAttemptWithInvoice = Prisma.OnlinePaymentAttemptGetPayload<{
  include: {
    invoice: true;
    membership: {
      include: {
        user: {
          select: {
            id: true;
            email: true;
            name: true;
            notificationPreference: true;
          };
        };
      };
    };
    settledPayment: true;
  };
}>;

export class OnlinePaymentTemporaryError extends BillingError {}

export function onlinePaymentProviderStatus(provider = getPaymentProvider()) {
  return {
    name: provider.name,
    isConfigured: provider.isConfigured,
    configurationError: provider.configurationError ?? null,
  };
}

function isProviderConfigured(provider: PaymentProvider) {
  return provider.isConfigured && provider.name === "flutterwave";
}

function assertProviderConfigured(provider: PaymentProvider) {
  if (!isProviderConfigured(provider)) {
    throw new BillingError("Online payments are currently unavailable.");
  }
}

function applicationBaseUrl() {
  const raw = process.env.SONDER_APP_BASE_URL?.trim();

  if (!raw) {
    throw new BillingError("Online payments are currently unavailable.");
  }

  return new URL(raw).origin;
}

function paymentReturnUrl(sonderReference: string) {
  const url = new URL("/membership/billing/payment-return", applicationBaseUrl());
  url.searchParams.set("tx_ref", sonderReference);
  return url.toString();
}

function isTerminalAttemptStatus(status: OnlinePaymentAttemptStatus) {
  return TERMINAL_ATTEMPT_STATUSES.includes(status);
}

function isAttemptCheckOnCooldown(attempt: {
  lastStatusCheckedAt: Date | null;
}) {
  return Boolean(
    attempt.lastStatusCheckedAt &&
      Date.now() - attempt.lastStatusCheckedAt.getTime() <
        STATUS_CHECK_COOLDOWN_MS,
  );
}

function providerFailureStatus(providerStatus: string | null | undefined) {
  const normalized = providerStatus?.toLowerCase();

  if (normalized === "cancelled" || normalized === "canceled") {
    return OnlinePaymentAttemptStatus.CANCELLED;
  }

  if (normalized === "expired") {
    return OnlinePaymentAttemptStatus.EXPIRED;
  }

  return OnlinePaymentAttemptStatus.FAILED;
}

function reviewReasonMessage(reason: string | null | undefined) {
  switch (reason) {
    case "invoice_already_paid":
      return "The invoice was already fully paid before Flutterwave confirmed the transaction.";
    case "invoice_balance_changed":
      return "The verified provider amount no longer matches the current invoice balance.";
    case "provider_reference_mismatch":
      return "Flutterwave returned a transaction reference that does not match Sonder's trusted reference.";
    case "provider_amount_mismatch":
      return "Flutterwave returned an amount that does not match the trusted payment attempt.";
    case "provider_currency_mismatch":
      return "Flutterwave returned a currency that does not match the trusted payment attempt.";
    case "provider_transaction_already_settled":
      return "Flutterwave transaction has already been linked to another settled payment.";
    case "invoice_not_payable":
      return "The invoice is no longer payable.";
    default:
      return "The payment needs administrative reconciliation before Sonder can allocate it.";
  }
}

function attemptStatusMessage(status: OnlinePaymentAttemptStatus) {
  if (status === OnlinePaymentAttemptStatus.SETTLED) {
    return "successful and settled";
  }

  if (status === OnlinePaymentAttemptStatus.REVIEW_REQUIRED) {
    return "requires administrative review";
  }

  if (
    status === OnlinePaymentAttemptStatus.FAILED ||
    status === OnlinePaymentAttemptStatus.EXPIRED
  ) {
    return "failed";
  }

  if (status === OnlinePaymentAttemptStatus.CANCELLED) {
    return "cancelled";
  }

  return "processing";
}

function safeStatusMetadata(
  verification: PaymentProviderVerification,
): Prisma.InputJsonValue {
  return {
    providerStatus: verification.providerStatus ?? null,
    method: verification.method ?? null,
    checkedAt: new Date().toISOString(),
  };
}

function isCheckoutPreparationStale(attempt: {
  status: OnlinePaymentAttemptStatus;
  lastStatusCheckedAt: Date | null;
}) {
  return Boolean(
    attempt.status === OnlinePaymentAttemptStatus.PROCESSING &&
      attempt.lastStatusCheckedAt &&
      Date.now() - attempt.lastStatusCheckedAt.getTime() >
        CHECKOUT_PREPARATION_STALE_MS,
  );
}

async function getActiveMemberForCheckout(
  tx: Tx,
  userId: string,
): Promise<MembershipForCheckout> {
  const membership = await tx.membership.findUnique({
    where: {
      userId,
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          deletedAt: true,
          profile: {
            select: {
              phoneNumber: true,
            },
          },
          notificationPreference: true,
        },
      },
    },
  });

  if (
    !membership ||
    membership.status !== MembershipStatus.ACTIVE ||
    membership.role === SystemRole.GUEST ||
    membership.user.deletedAt
  ) {
    throw new BillingError("Only active members can pay online.");
  }

  return membership;
}

async function getPayableInvoice(
  tx: Tx,
  input: {
    invoiceId: string;
    membershipId: string;
  },
): Promise<InvoiceForCheckout> {
  const invoice = await tx.membershipInvoice.findUnique({
    where: {
      id: input.invoiceId,
    },
  });

  if (!invoice || invoice.membershipId !== input.membershipId) {
    throw new BillingError("Invoice not found for this member.");
  }

  if (invoice.status === InvoiceStatus.VOID) {
    throw new BillingError("Voided invoices cannot be paid online.");
  }

  if (!INVOICE_PAYABLE_STATUSES.includes(invoice.status)) {
    throw new BillingError("Only open invoices can be paid online.");
  }

  const balance = calculateInvoiceBalance(invoice);

  if (balance <= 0) {
    throw new BillingError("That invoice is already fully paid.");
  }

  normalizeCurrencyCode(invoice.currency);

  return invoice;
}

async function createProcessingAttempt(input: {
  userId: string;
  invoiceId: string;
  checkoutNonce?: string | null;
}) {
  for (const retry of [false, true]) {
    try {
      return await createProcessingAttemptOnce(input);
    } catch (error) {
      if (
        !retry &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }

      throw error;
    }
  }

  throw new BillingError("Online checkout is already being prepared. Refresh and try again shortly.");
}

async function createProcessingAttemptOnce(input: {
  userId: string;
  invoiceId: string;
  checkoutNonce?: string | null;
}) {
  const checkoutIdempotencyKey = checkoutIdempotencyKeyForNonce(input);

  return runBillingTransaction(async (tx) => {
    const membership = await getActiveMemberForCheckout(tx, input.userId);
    const invoice = await getPayableInvoice(tx, {
      invoiceId: input.invoiceId,
      membershipId: membership.id,
    });
    const attemptInclude = {
      invoice: true,
      membership: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              notificationPreference: true,
            },
          },
        },
      },
      settledPayment: true,
    } satisfies Prisma.OnlinePaymentAttemptInclude;

    if (checkoutIdempotencyKey) {
      const nonceAttempt = await tx.onlinePaymentAttempt.findUnique({
        where: {
          checkoutIdempotencyKey,
        },
        include: attemptInclude,
      });

      if (nonceAttempt) {
        if (
          nonceAttempt.invoiceId !== invoice.id ||
          nonceAttempt.membershipId !== membership.id
        ) {
          throw new BillingError("Online checkout could not be started. Refresh and try again.");
        }

        if (
          nonceAttempt.status === OnlinePaymentAttemptStatus.CHECKOUT_READY &&
          nonceAttempt.checkoutUrl
        ) {
          return {
            attempt: nonceAttempt,
            membership,
            invoice,
            shouldCreateCheckout: false,
          };
        }

        throw new BillingError("Online checkout is already being prepared. Refresh and try again shortly.");
      }
    }

    const activeAttempt = await tx.onlinePaymentAttempt.findFirst({
      where: {
        provider: OnlinePaymentProvider.FLUTTERWAVE,
        invoiceId: invoice.id,
        status: {
          in: [...ACTIVE_ATTEMPT_STATUSES],
        },
      },
      include: attemptInclude,
      orderBy: {
        createdAt: "desc",
      },
    });

    if (activeAttempt) {
      if (
        activeAttempt.status === OnlinePaymentAttemptStatus.CHECKOUT_READY &&
        activeAttempt.checkoutUrl
      ) {
        return {
          attempt: activeAttempt,
          membership,
          invoice,
          shouldCreateCheckout: false,
        };
      }

      if (isCheckoutPreparationStale(activeAttempt)) {
        await tx.onlinePaymentAttempt.update({
          where: {
            id: activeAttempt.id,
          },
          data: {
            status: OnlinePaymentAttemptStatus.FAILED,
            failureReason: "checkout_preparation_timed_out",
            lastStatusCheckedAt: new Date(),
          },
        });
      } else if (activeAttempt.status === OnlinePaymentAttemptStatus.CREATED) {
        const now = new Date();
        const claimed = await tx.onlinePaymentAttempt.updateMany({
          where: {
            id: activeAttempt.id,
            status: OnlinePaymentAttemptStatus.CREATED,
          },
          data: {
            status: OnlinePaymentAttemptStatus.PROCESSING,
            checkoutIdempotencyKey:
              activeAttempt.checkoutIdempotencyKey ?? checkoutIdempotencyKey,
            failureReason: null,
            lastStatusCheckedAt: now,
          },
        });

        if (claimed.count !== 1) {
          throw new BillingError("Online checkout is already being prepared. Refresh and try again shortly.");
        }

        const attempt = await tx.onlinePaymentAttempt.findUniqueOrThrow({
          where: {
            id: activeAttempt.id,
          },
          include: attemptInclude,
        });

        return {
          attempt,
          membership,
          invoice,
          shouldCreateCheckout: true,
        };
      } else {
        throw new BillingError("Online checkout is already being prepared. Refresh and try again shortly.");
      }
    }

    const now = new Date();
    const amountMinor = calculateInvoiceBalance(invoice);
    const attempt = await tx.onlinePaymentAttempt.create({
      data: {
        provider: OnlinePaymentProvider.FLUTTERWAVE,
        sonderReference: generateTrustedSonderTransactionReference(),
        membershipId: membership.id,
        invoiceId: invoice.id,
        amountMinor,
        currency: normalizeCurrencyCode(invoice.currency),
        status: OnlinePaymentAttemptStatus.PROCESSING,
        checkoutIdempotencyKey,
        lastStatusCheckedAt: now,
      },
      include: attemptInclude,
    });

    return {
      attempt,
      membership,
      invoice,
      shouldCreateCheckout: true,
    };
  });
}

export async function createOnlineCheckoutForMember(input: {
  userId: string;
  invoiceId: string;
  checkoutNonce?: string | null;
}) {
  const provider = getPaymentProvider();
  assertProviderConfigured(provider);

  const { attempt, membership, invoice, shouldCreateCheckout } =
    await createProcessingAttempt(input);

  if (!shouldCreateCheckout && attempt.checkoutUrl) {
    return {
      attemptId: attempt.id,
      sonderReference: attempt.sonderReference,
      checkoutUrl: attempt.checkoutUrl,
      reused: true,
    };
  }

  const result = await provider.createCheckout({
    invoiceId: invoice.id,
    sonderTransactionReference: attempt.sonderReference,
    amountMinor: attempt.amountMinor,
    currency: attempt.currency,
    returnUrl: paymentReturnUrl(attempt.sonderReference),
    customer: {
      email: membership.user.email,
      name: membership.user.name,
      phoneNumber: membership.user.profile?.phoneNumber ?? null,
    },
    description: `Sonder membership invoice ${invoice.invoiceNumber}`,
    metadata: {
      sonder_reference: attempt.sonderReference,
      invoice_number: invoice.invoiceNumber,
    },
  });

  if (result.status !== "ok") {
    await db.onlinePaymentAttempt.updateMany({
      where: {
        id: attempt.id,
        status: OnlinePaymentAttemptStatus.PROCESSING,
      },
      data: {
        status: OnlinePaymentAttemptStatus.FAILED,
        failureReason:
          result.status === "failed"
            ? result.error
            : "provider_configuration_disabled",
        lastStatusCheckedAt: new Date(),
      },
    });

    throw new BillingError("Online checkout could not be created. Please try again later.");
  }

  const updated = await runBillingTransaction(async (tx) => {
    const stored = await tx.onlinePaymentAttempt.updateMany({
      where: {
        id: attempt.id,
        status: OnlinePaymentAttemptStatus.PROCESSING,
      },
      data: {
        status: OnlinePaymentAttemptStatus.CHECKOUT_READY,
        checkoutUrl: result.data.checkoutUrl,
        providerCheckoutId:
          result.data.providerTransactionToken ?? result.data.providerCheckoutId,
        checkoutExpiresAt: result.data.checkoutExpiresAt ?? null,
        providerReference: result.data.providerReference ?? null,
        providerTransactionId: result.data.providerTransactionId ?? null,
        failureReason: null,
        lastStatusCheckedAt: new Date(),
      },
    });

    const current = await tx.onlinePaymentAttempt.findUniqueOrThrow({
      where: {
        id: attempt.id,
      },
    });

    if (stored.count !== 1) {
      if (
        current.status === OnlinePaymentAttemptStatus.CHECKOUT_READY &&
        current.checkoutUrl
      ) {
        return current;
      }

      throw new BillingError("Online checkout changed while it was being prepared. Refresh and try again.");
    }

    return current;
  });

  return {
    attemptId: updated.id,
    sonderReference: updated.sonderReference,
    checkoutUrl: result.data.checkoutUrl,
    reused: false,
  };
}

function providerAttemptStatus(
  status: ProviderPaymentStatus | undefined,
  providerStatus: string | null | undefined,
) {
  if (status === "confirmed") {
    return OnlinePaymentAttemptStatus.VERIFIED;
  }

  if (status === "failed") {
    return providerFailureStatus(providerStatus);
  }

  return OnlinePaymentAttemptStatus.PROCESSING;
}

async function updateAttemptFromNonSuccessfulVerification(input: {
  attemptId: string;
  verification: PaymentProviderVerification;
  webhookEventId?: string | null;
}) {
  const status = providerAttemptStatus(
    input.verification.status,
    input.verification.providerStatus,
  );
  const now = new Date();

  await runBillingTransaction(async (tx) => {
    const updated = await tx.onlinePaymentAttempt.updateMany({
      where: {
        id: input.attemptId,
        status: {
          not: OnlinePaymentAttemptStatus.SETTLED,
        },
      },
      data: {
        status,
        providerTransactionId: input.verification.providerTransactionId,
        providerReference: input.verification.providerReference ?? null,
        providerStatus: input.verification.providerStatus ?? null,
        failureReason:
          status === OnlinePaymentAttemptStatus.PROCESSING
            ? null
            : `provider_status_${input.verification.providerStatus ?? "failed"}`,
        lastStatusCheckedAt: now,
        sanitizedStatus: safeStatusMetadata(input.verification),
      },
    });

    if (input.webhookEventId) {
      await tx.providerWebhookEvent.update({
        where: {
          id: input.webhookEventId,
        },
        data: {
          attemptId: input.attemptId,
          status:
            updated.count === 1
              ? ProviderWebhookEventStatus.PROCESSED
              : ProviderWebhookEventStatus.IGNORED,
          processedAt: now,
          failureReason:
            updated.count === 1 ? null : "attempt_already_settled",
        },
      });
    }
  });
}

async function markAttemptForReview(
  tx: Tx,
  input: {
    attempt: OnlinePaymentAttemptWithInvoice;
    verification: PaymentProviderVerification;
    reason: string;
    webhookEventId?: string | null;
  },
) {
  const now = new Date();
  const attempt = await tx.onlinePaymentAttempt.update({
    where: {
      id: input.attempt.id,
    },
    data: {
      status: OnlinePaymentAttemptStatus.REVIEW_REQUIRED,
      providerTransactionId: input.verification.providerTransactionId,
      providerReference: input.verification.providerReference ?? null,
      providerStatus: input.verification.providerStatus ?? null,
      verifiedAt: input.attempt.verifiedAt ?? now,
      reviewReason: input.reason,
      lastStatusCheckedAt: now,
      sanitizedStatus: safeStatusMetadata(input.verification),
    },
  });

  if (input.webhookEventId) {
    await tx.providerWebhookEvent.update({
      where: {
        id: input.webhookEventId,
      },
      data: {
        attemptId: input.attempt.id,
        status: ProviderWebhookEventStatus.PROCESSED,
        processedAt: now,
        failureReason: null,
      },
    });
  }

  await notifyOnlinePaymentReviewRequired(tx, {
    attemptId: attempt.id,
    invoiceId: attempt.invoiceId,
    sonderReference: attempt.sonderReference,
    reason: input.reason,
  });

  return attempt;
}

function onlinePaymentIdempotencyKey(input: {
  provider: OnlinePaymentProvider;
  providerTransactionId: string;
}) {
  return `online:${input.provider.toLowerCase()}:${input.providerTransactionId}`;
}

async function settleVerifiedOnlinePayment(input: {
  attemptId: string;
  verification: PaymentProviderVerification;
  webhookEventId?: string | null;
}) {
  const now = new Date();

  return runBillingTransaction(async (tx) => {
    const attempt = await tx.onlinePaymentAttempt.findUnique({
      where: {
        id: input.attemptId,
      },
      include: {
        invoice: true,
        membership: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                notificationPreference: true,
              },
            },
          },
        },
        settledPayment: true,
      },
    });

    if (!attempt) {
      throw new BillingError("Online payment attempt was not found.");
    }

    if (attempt.status === OnlinePaymentAttemptStatus.SETTLED) {
      if (input.webhookEventId) {
        await tx.providerWebhookEvent.update({
          where: {
            id: input.webhookEventId,
          },
          data: {
            attemptId: attempt.id,
            status: ProviderWebhookEventStatus.PROCESSED,
            processedAt: now,
            failureReason: null,
          },
        });
      }

      return attempt.settledPayment;
    }

    if (attempt.status === OnlinePaymentAttemptStatus.REVIEW_REQUIRED) {
      if (input.webhookEventId) {
        await tx.providerWebhookEvent.update({
          where: {
            id: input.webhookEventId,
          },
          data: {
            attemptId: attempt.id,
            status: ProviderWebhookEventStatus.IGNORED,
            processedAt: now,
            failureReason: "attempt_requires_review",
          },
        });
      }

      return attempt;
    }

    const verification = input.verification;

    if (!verification.confirmed) {
      throw new BillingError("Provider transaction is not confirmed.");
    }

    if (
      verification.sonderTransactionReference !== attempt.sonderReference ||
      (attempt.providerTransactionId !== null &&
        verification.providerTransactionId !== attempt.providerTransactionId)
    ) {
      return markAttemptForReview(tx, {
        attempt,
        verification,
        reason: "provider_reference_mismatch",
        webhookEventId: input.webhookEventId,
      });
    }

    if (verification.amountMinor !== attempt.amountMinor) {
      return markAttemptForReview(tx, {
        attempt,
        verification,
        reason: "provider_amount_mismatch",
        webhookEventId: input.webhookEventId,
      });
    }

    if (verification.currency !== attempt.currency) {
      return markAttemptForReview(tx, {
        attempt,
        verification,
        reason: "provider_currency_mismatch",
        webhookEventId: input.webhookEventId,
      });
    }

    const transactionAlreadySeen = await tx.onlinePaymentAttempt.findFirst({
      where: {
        provider: attempt.provider,
        providerTransactionId: verification.providerTransactionId,
        id: {
          not: attempt.id,
        },
      },
    });

    if (transactionAlreadySeen) {
      return markAttemptForReview(tx, {
        attempt,
        verification,
        reason: "provider_transaction_already_settled",
        webhookEventId: input.webhookEventId,
      });
    }

    if (
      attempt.invoice.membershipId !== attempt.membershipId ||
      attempt.invoice.currency !== attempt.currency ||
      attempt.invoice.status === InvoiceStatus.VOID ||
      !INVOICE_PAYABLE_STATUSES.includes(attempt.invoice.status)
    ) {
      return markAttemptForReview(tx, {
        attempt,
        verification,
        reason: "invoice_not_payable",
        webhookEventId: input.webhookEventId,
      });
    }

    const balance = calculateInvoiceBalance(attempt.invoice);

    if (balance <= 0) {
      return markAttemptForReview(tx, {
        attempt,
        verification,
        reason: "invoice_already_paid",
        webhookEventId: input.webhookEventId,
      });
    }

    if (verification.amountMinor !== balance) {
      return markAttemptForReview(tx, {
        attempt,
        verification,
        reason: "invoice_balance_changed",
        webhookEventId: input.webhookEventId,
      });
    }

    const idempotencyKey = onlinePaymentIdempotencyKey({
      provider: attempt.provider,
      providerTransactionId: verification.providerTransactionId,
    });
    const existingPayment = await tx.membershipPayment.findUnique({
      where: {
        idempotencyKey,
      },
    });

    if (existingPayment) {
      const settledAttempt = await tx.onlinePaymentAttempt.update({
        where: {
          id: attempt.id,
        },
        data: {
          status: OnlinePaymentAttemptStatus.SETTLED,
          providerTransactionId: verification.providerTransactionId,
          providerReference: verification.providerReference ?? null,
          providerStatus: verification.providerStatus ?? null,
          verifiedAt: attempt.verifiedAt ?? now,
          settledAt: attempt.settledAt ?? now,
          settledPaymentId: existingPayment.id,
          reviewReason: null,
          failureReason: null,
          lastStatusCheckedAt: now,
          sanitizedStatus: safeStatusMetadata(verification),
        },
      });

      if (input.webhookEventId) {
        await tx.providerWebhookEvent.update({
          where: {
            id: input.webhookEventId,
          },
          data: {
            attemptId: settledAttempt.id,
            status: ProviderWebhookEventStatus.PROCESSED,
            processedAt: now,
            failureReason: null,
          },
        });
      }

      return existingPayment;
    }

    const payment = await tx.membershipPayment.create({
      data: {
        membershipId: attempt.membershipId,
        invoiceId: attempt.invoiceId,
        amountMinor: verification.amountMinor,
        currency: attempt.currency,
        status: PaymentStatus.CONFIRMED,
        method: verification.method ?? PaymentMethod.OTHER,
        externalReference:
          verification.providerReference ??
          verification.providerTransactionId,
        internalReference: generatePaymentInternalReference({
          membershipId: attempt.membershipId,
          invoiceId: attempt.invoiceId,
          amountMinor: verification.amountMinor,
          idempotencyKey,
          paidAt: now,
          createdAt: now,
        }),
        paidAt: now,
        confirmedAt: now,
        dueAt: attempt.invoice.dueAt,
        periodStart: attempt.invoice.periodStart,
        periodEnd: attempt.invoice.periodEnd,
        notes: "Confirmed by Flutterwave server-side verification.",
        idempotencyKey,
      },
    });

    const allocated = await tx.$executeRaw`
      UPDATE "membership_invoices"
      SET
        "amountPaidMinor" = "amountPaidMinor" + ${verification.amountMinor},
        "status" = CASE
          WHEN "amountPaidMinor" + ${verification.amountMinor} = "amountDueMinor"
            THEN 'PAID'::"InvoiceStatus"
          ELSE 'PARTIALLY_PAID'::"InvoiceStatus"
        END,
        "paidAt" = CASE
          WHEN "amountPaidMinor" + ${verification.amountMinor} = "amountDueMinor"
            THEN ${now}
          ELSE "paidAt"
        END,
        "updatedAt" = ${now}
      WHERE "id" = ${attempt.invoiceId}
        AND "membershipId" = ${attempt.membershipId}
        AND "currency" = ${attempt.currency}
        AND "status" IN ('OPEN'::"InvoiceStatus", 'PARTIALLY_PAID'::"InvoiceStatus", 'OVERDUE'::"InvoiceStatus")
        AND "amountPaidMinor" < "amountDueMinor"
        AND "amountPaidMinor" + ${verification.amountMinor} = "amountDueMinor"
    `;

    if (Number(allocated) !== 1) {
      throw new BillingError("Verified online payment could not be allocated exactly once.");
    }

    const settledAttempt = await tx.onlinePaymentAttempt.update({
      where: {
        id: attempt.id,
      },
      data: {
        status: OnlinePaymentAttemptStatus.SETTLED,
        providerTransactionId: verification.providerTransactionId,
        providerReference: verification.providerReference ?? null,
        providerStatus: verification.providerStatus ?? null,
        verifiedAt: attempt.verifiedAt ?? now,
        settledAt: now,
        settledPaymentId: payment.id,
        reviewReason: null,
        failureReason: null,
        lastStatusCheckedAt: now,
        sanitizedStatus: safeStatusMetadata(verification),
      },
    });

    if (input.webhookEventId) {
      await tx.providerWebhookEvent.update({
        where: {
          id: input.webhookEventId,
        },
        data: {
          attemptId: settledAttempt.id,
          status: ProviderWebhookEventStatus.PROCESSED,
          processedAt: now,
          failureReason: null,
        },
      });
    }

    await notifyPaymentConfirmed(tx, {
      paymentId: payment.id,
      recipient: attempt.membership.user,
      amountFormatted: formatMinorUnits(payment.amountMinor, payment.currency),
      invoiceNumber: attempt.invoice.invoiceNumber,
      paymentReference: payment.internalReference,
    });

    return payment;
  });
}

async function verifyProviderTransaction(input: {
  attempt: {
    id: string;
    invoiceId: string;
    sonderReference: string;
    amountMinor: bigint;
    currency: string;
    providerTransactionId: string | null;
  };
  providerTransactionId: string;
  provider: PaymentProvider;
}) {
  const result = await input.provider.verifyPayment({
    invoiceId: input.attempt.invoiceId,
    sonderTransactionReference: input.attempt.sonderReference,
    providerTransactionId: input.providerTransactionId,
    amountMinor: input.attempt.amountMinor,
    currency: input.attempt.currency,
  });

  if (result.status === "disabled") {
    throw new BillingError("Online payments are currently unavailable.");
  }

  if (result.status === "failed") {
    if (result.retryable) {
      throw new OnlinePaymentTemporaryError("Provider verification is temporarily unavailable.");
    }

    throw new BillingError("Provider verification failed.");
  }

  return result.data;
}

async function applyVerifiedProviderResult(input: {
  attemptId: string;
  verification: PaymentProviderVerification;
  webhookEventId?: string | null;
}) {
  if (input.verification.confirmed) {
    return settleVerifiedOnlinePayment(input);
  }

  await updateAttemptFromNonSuccessfulVerification(input);
  return null;
}

export async function checkOnlinePaymentAttemptStatus(input: {
  attemptId?: string;
  sonderReference?: string;
  userId?: string;
  adminContext?: {
    user: {
      systemRole: SystemRole;
    };
    membership:
      | {
          role: SystemRole;
          status: MembershipStatus;
        }
      | null
      | undefined;
  };
  providerTransactionId?: string | null;
  force?: boolean;
}) {
  const provider = getPaymentProvider();
  assertProviderConfigured(provider);

  const attempt = await db.onlinePaymentAttempt.findFirst({
    where: {
      ...(input.attemptId ? { id: input.attemptId } : {}),
      ...(input.sonderReference
        ? { sonderReference: input.sonderReference }
        : {}),
    },
    include: {
      invoice: true,
      membership: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              notificationPreference: true,
            },
          },
        },
      },
      settledPayment: true,
    },
  });

  if (!attempt) {
    throw new BillingError("Online payment attempt was not found.");
  }

  const isAdmin =
    input.adminContext && canManageBilling(input.adminContext.user, input.adminContext.membership);

  if (!isAdmin && input.userId && attempt.membership.userId !== input.userId) {
    throw new BillingError("Online payment attempt was not found.");
  }

  if (!isAdmin && !input.userId) {
    throw new BillingError("Online payment attempt was not found.");
  }

  if (
    !input.force &&
    (isTerminalAttemptStatus(attempt.status) || isAttemptCheckOnCooldown(attempt))
  ) {
    return attempt;
  }

  if (attempt.status === OnlinePaymentAttemptStatus.REVIEW_REQUIRED) {
    return attempt;
  }

  const providerTransactionId =
    input.providerTransactionId ?? attempt.providerTransactionId;

  if (!providerTransactionId) {
    return attempt;
  }

  const verification = await verifyProviderTransaction({
    attempt,
    provider,
    providerTransactionId,
  });

  await applyVerifiedProviderResult({
    attemptId: attempt.id,
    verification,
  });

  return db.onlinePaymentAttempt.findUniqueOrThrow({
    where: {
      id: attempt.id,
    },
    include: {
      invoice: true,
      membership: {
        include: {
          user: true,
        },
      },
      settledPayment: true,
    },
  });
}

function webhookEventFailureResponse(error: string) {
  if (error === "invalid_webhook_signature") {
    return {
      status: 401,
      body: { ok: false, error: "invalid_signature" },
    };
  }

  if (error === "malformed_webhook") {
    return {
      status: 400,
      body: { ok: false, error: "malformed_webhook" },
    };
  }

  return {
    status: 200,
    body: { ok: true, ignored: true },
  };
}

async function persistWebhookEvent(result: PaymentWebhookResult) {
  const eventKey =
    result.eventKey ??
    [
      "event",
      result.eventType ?? "unknown",
      result.providerTransactionId,
      result.sonderTransactionReference ?? "no_reference",
      result.payloadHash ?? "no_hash",
    ].join(":");

  try {
    return {
      event: await db.providerWebhookEvent.create({
        data: {
          provider: OnlinePaymentProvider.FLUTTERWAVE,
          eventKey,
          providerEventId: result.eventId ?? null,
          eventType: result.eventType ?? null,
          providerTransactionId: result.providerTransactionId,
          sonderReference: result.sonderTransactionReference ?? null,
          payloadHash: result.payloadHash ?? "0".repeat(64),
          status: ProviderWebhookEventStatus.RECEIVED,
        },
      }),
      duplicate: false,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const event = await db.providerWebhookEvent.findUniqueOrThrow({
        where: {
          provider_eventKey: {
            provider: OnlinePaymentProvider.FLUTTERWAVE,
            eventKey,
          },
        },
      });

      return {
        event,
        duplicate: true,
      };
    }

    throw error;
  }
}

async function findAttemptForProviderResult(result: PaymentWebhookResult) {
  return db.onlinePaymentAttempt.findFirst({
    where: {
      provider: OnlinePaymentProvider.FLUTTERWAVE,
      OR: [
        ...(result.sonderTransactionReference
          ? [{ sonderReference: result.sonderTransactionReference }]
          : []),
        {
          providerTransactionId: result.providerTransactionId,
        },
      ],
    },
    include: {
      invoice: true,
      membership: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              notificationPreference: true,
            },
          },
        },
      },
      settledPayment: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

async function updateAttemptFromWebhookWithoutSettlement(input: {
  attemptId: string;
  result: PaymentWebhookResult;
  eventId: string;
}) {
  const now = new Date();
  const status = providerAttemptStatus(input.result.status, input.result.providerStatus);

  await runBillingTransaction(async (tx) => {
    const updated = await tx.onlinePaymentAttempt.updateMany({
      where: {
        id: input.attemptId,
        status: {
          not: OnlinePaymentAttemptStatus.SETTLED,
        },
      },
      data: {
        status,
        providerTransactionId: input.result.providerTransactionId,
        providerReference: input.result.providerReference ?? null,
        providerStatus: input.result.providerStatus ?? null,
        failureReason:
          status === OnlinePaymentAttemptStatus.PROCESSING
            ? null
            : `provider_status_${input.result.providerStatus ?? "failed"}`,
        lastStatusCheckedAt: now,
        sanitizedStatus: {
          providerStatus: input.result.providerStatus ?? null,
          webhookStatus: input.result.status,
          checkedAt: now.toISOString(),
        },
      },
    });

    await tx.providerWebhookEvent.update({
      where: {
        id: input.eventId,
      },
      data: {
        attemptId: input.attemptId,
        status:
          updated.count === 1
            ? ProviderWebhookEventStatus.PROCESSED
            : ProviderWebhookEventStatus.IGNORED,
        processedAt: now,
        failureReason:
          updated.count === 1 ? null : "attempt_already_settled",
      },
    });
  });
}

export async function processFlutterwaveWebhook(input: PaymentWebhookInput) {
  const provider = getPaymentProvider();

  if (!isProviderConfigured(provider)) {
    return {
      status: 503,
      body: { ok: false, error: "provider_disabled" },
    };
  }

  const parsed = await provider.parseWebhook(input);

  if (parsed.status !== "ok") {
    return webhookEventFailureResponse(
      parsed.status === "failed" ? parsed.error : "provider_disabled",
    );
  }

  const { event, duplicate } = await persistWebhookEvent(parsed.data);

  if (duplicate && event.status === ProviderWebhookEventStatus.PROCESSED) {
    return {
      status: 200,
      body: { ok: true, duplicate: true },
    };
  }

  const attempt = await findAttemptForProviderResult(parsed.data);

  if (!attempt) {
    await db.providerWebhookEvent.update({
      where: {
        id: event.id,
      },
      data: {
        status: ProviderWebhookEventStatus.IGNORED,
        failureReason: "attempt_not_found",
        processedAt: new Date(),
      },
    });

    return {
      status: 200,
      body: { ok: true, ignored: true },
    };
  }

  if (parsed.data.status !== "confirmed") {
    await updateAttemptFromWebhookWithoutSettlement({
      attemptId: attempt.id,
      result: parsed.data,
      eventId: event.id,
    });

    return {
      status: 200,
      body: { ok: true },
    };
  }

  try {
    const verification = await verifyProviderTransaction({
      attempt,
      provider,
      providerTransactionId: parsed.data.providerTransactionId,
    });

    await applyVerifiedProviderResult({
      attemptId: attempt.id,
      verification,
      webhookEventId: event.id,
    });
  } catch (error) {
    const retryable = error instanceof OnlinePaymentTemporaryError;

    await db.providerWebhookEvent.update({
      where: {
        id: event.id,
      },
      data: {
        status: ProviderWebhookEventStatus.FAILED,
        failureReason: retryable
          ? "provider_verification_unavailable"
          : "provider_verification_failed",
      },
    });

    if (retryable) {
      return {
        status: 503,
        body: { ok: false, error: "verification_unavailable" },
      };
    }
  }

  return {
    status: 200,
    body: { ok: true },
  };
}

export async function getMemberPaymentReturnState(input: {
  userId: string;
  sonderReference: string | null;
  providerTransactionId?: string | null;
}) {
  if (!input.sonderReference) {
    return {
      statusLabel: "processing",
      title: "Payment status is processing",
      message:
        "Sonder is waiting for a trusted payment reference. Your invoice will only update after server-side verification.",
      attempt: null,
    };
  }

  let attempt;
  try {
    attempt = await checkOnlinePaymentAttemptStatus({
      sonderReference: input.sonderReference,
      userId: input.userId,
      providerTransactionId: input.providerTransactionId,
    });
  } catch (error) {
    if (error instanceof OnlinePaymentTemporaryError) {
      attempt = await db.onlinePaymentAttempt.findFirst({
        where: {
          sonderReference: input.sonderReference,
          membership: {
            userId: input.userId,
          },
        },
        include: {
          invoice: true,
          settledPayment: true,
        },
      });
    } else if (error instanceof BillingError) {
      attempt = await db.onlinePaymentAttempt.findFirst({
        where: {
          sonderReference: input.sonderReference,
          membership: {
            userId: input.userId,
          },
        },
        include: {
          invoice: true,
          settledPayment: true,
        },
      });
    } else {
      throw error;
    }
  }

  if (!attempt) {
    return {
      statusLabel: "processing",
      title: "Payment status is processing",
      message:
        "Sonder could not find a payment attempt for this return. Check billing for the latest invoice status.",
      attempt: null,
    };
  }

  const statusLabel = attemptStatusMessage(attempt.status);

  return {
    statusLabel,
    title:
      attempt.status === OnlinePaymentAttemptStatus.SETTLED
        ? "Payment verified and settled"
        : attempt.status === OnlinePaymentAttemptStatus.REVIEW_REQUIRED
          ? "Payment requires administrative review"
          : attempt.status === OnlinePaymentAttemptStatus.CANCELLED
            ? "Payment was cancelled"
            : attempt.status === OnlinePaymentAttemptStatus.FAILED ||
                attempt.status === OnlinePaymentAttemptStatus.EXPIRED
              ? "Payment was not completed"
              : "Payment is still processing",
    message:
      attempt.status === OnlinePaymentAttemptStatus.REVIEW_REQUIRED
        ? reviewReasonMessage(attempt.reviewReason)
        : attempt.status === OnlinePaymentAttemptStatus.SETTLED
          ? "Sonder verified the Flutterwave transaction server-side and updated your invoice."
          : "Mobile-money approval can complete asynchronously. Sonder will update billing after server-side verification.",
    attempt,
  };
}

export async function getOnlinePaymentAttemptsForAdmin(input: {
  user: {
    systemRole: SystemRole;
  };
  membership:
    | {
        role: SystemRole;
        status: MembershipStatus;
      }
    | null
    | undefined;
}) {
  if (!canManageBilling(input.user, input.membership)) {
    throw new Error("Active admin access is required for online payment reconciliation.");
  }

  return db.onlinePaymentAttempt.findMany({
    include: {
      membership: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      invoice: true,
      settledPayment: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: ONLINE_PAYMENT_ADMIN_LIMIT,
  });
}

export async function findStaleProcessingOnlinePaymentAttempts() {
  const before = new Date(Date.now() - STALE_PROCESSING_AFTER_MS);

  return db.onlinePaymentAttempt.findMany({
    where: {
      provider: OnlinePaymentProvider.FLUTTERWAVE,
      status: OnlinePaymentAttemptStatus.PROCESSING,
      OR: [
        {
          lastStatusCheckedAt: null,
        },
        {
          lastStatusCheckedAt: {
            lt: before,
          },
        },
      ],
    },
    orderBy: {
      createdAt: "asc",
    },
    take: ONLINE_PAYMENT_ADMIN_LIMIT,
  });
}

export async function markOnlinePaymentAttemptForReview(input: {
  attemptId: string;
  actor: {
    user: {
      systemRole: SystemRole;
    };
    membership:
      | {
          role: SystemRole;
          status: MembershipStatus;
        }
      | null
      | undefined;
  };
}) {
  if (!canManageBilling(input.actor.user, input.actor.membership)) {
    throw new BillingError("Active admin access is required for online payment reconciliation.");
  }

  const attempt = await db.onlinePaymentAttempt.findUnique({
    where: {
      id: input.attemptId,
    },
    select: {
      status: true,
    },
  });

  if (!attempt) {
    throw new BillingError("Online payment attempt was not found.");
  }

  if (attempt.status === OnlinePaymentAttemptStatus.SETTLED) {
    throw new BillingError("Settled online payments cannot be moved back to review.");
  }

  return db.onlinePaymentAttempt.update({
    where: {
      id: input.attemptId,
    },
    data: {
      status: OnlinePaymentAttemptStatus.REVIEW_REQUIRED,
      reviewReason: "admin_review_requested",
    },
  });
}

export function formatOnlinePaymentAttemptStatus(
  status: OnlinePaymentAttemptStatus,
) {
  return status.toLowerCase().replaceAll("_", " ");
}
