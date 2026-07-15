import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import Link from "next/link";
import {
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  SubscriptionStatus,
} from "@prisma/client";
import {
  AlertTriangle,
  CheckCircle2,
  FilePlus2,
  PauseCircle,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { SectionHeading } from "@/components/app/section-heading";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  assignMembershipPlanAction,
  confirmMembershipPaymentAction,
  createMembershipInvoiceAction,
  markOnlinePaymentAttemptForReviewAction,
  recordMembershipPaymentAction,
  recheckOnlinePaymentAttemptAction,
  updateSubscriptionStateAction,
  voidMembershipInvoiceAction,
} from "@/features/billing/actions";
import { formatMinorUnits } from "@/features/billing/currency";
import {
  formatOnlinePaymentAttemptStatus,
  getOnlinePaymentAttemptsForAdmin,
} from "@/features/billing/online-payments";
import { requireBillingAdmin } from "@/features/billing/permissions";
import {
  ADMIN_BILLING_DETAIL_LIMIT,
  ADMIN_BILLING_MEMBER_LIMIT,
  getAdminBillingPageData,
} from "@/features/billing/queries";
import {
  calculateInvoiceBalance,
} from "@/features/billing/service";
import {
  invoiceStatusFilterValues,
  parseInvoiceStatusFilter,
  parseSubscriptionStatusFilter,
  subscriptionStatusFilterValues,
} from "@/features/billing/schemas";
import {
  formatBillingInterval,
  formatDate,
  formatDateTime,
  formatInvoiceStatus,
  formatPaymentMethod,
  formatPaymentStatus,
  formatSubscriptionStatus,
} from "@/lib/formatters";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Billing Administration",
};

type BillingAdminPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type BillingData = Awaited<ReturnType<typeof getAdminBillingPageData>>;
type MembershipItem = BillingData["memberships"][number];
type OnlinePaymentAttemptItem = Awaited<
  ReturnType<typeof getOnlinePaymentAttemptsForAdmin>
>[number];

const paymentMethods = [
  PaymentMethod.CASH,
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.MOBILE_MONEY,
  PaymentMethod.OTHER,
] as const;

const CURRENT_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.PAUSED,
  SubscriptionStatus.WAIVED,
  SubscriptionStatus.PENDING,
];

const PAYABLE_INVOICE_STATUSES: readonly InvoiceStatus[] = [
  InvoiceStatus.OPEN,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
];

const VOIDABLE_INVOICE_STATUSES: readonly InvoiceStatus[] = [
  InvoiceStatus.DRAFT,
  InvoiceStatus.OPEN,
  InvoiceStatus.OVERDUE,
];

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function billingHref(input: {
  search?: string;
  subscriptionStatus?: SubscriptionStatus;
  invoiceStatus?: InvoiceStatus;
}) {
  const params = new URLSearchParams();

  if (input.search) {
    params.set("q", input.search);
  }

  if (input.subscriptionStatus) {
    params.set("subscription", input.subscriptionStatus);
  }

  if (input.invoiceStatus) {
    params.set("invoice", input.invoiceStatus);
  }

  const query = params.toString();
  return query ? `/admin/billing?${query}` : "/admin/billing";
}

function subscriptionTone(status: SubscriptionStatus) {
  if (status === SubscriptionStatus.ACTIVE) {
    return "emerald" as const;
  }

  if (status === SubscriptionStatus.PAST_DUE) {
    return "rose" as const;
  }

  if (status === SubscriptionStatus.PAUSED) {
    return "amber" as const;
  }

  if (status === SubscriptionStatus.WAIVED) {
    return "sky" as const;
  }

  return "neutral" as const;
}

function invoiceTone(status: InvoiceStatus) {
  if (status === InvoiceStatus.PAID) {
    return "emerald" as const;
  }

  if (status === InvoiceStatus.OVERDUE) {
    return "rose" as const;
  }

  if (status === InvoiceStatus.PARTIALLY_PAID) {
    return "amber" as const;
  }

  if (status === InvoiceStatus.VOID) {
    return "neutral" as const;
  }

  return "sky" as const;
}

function paymentTone(status: PaymentStatus) {
  if (status === PaymentStatus.CONFIRMED || status === PaymentStatus.PAID) {
    return "emerald" as const;
  }

  if (status === PaymentStatus.PENDING) {
    return "amber" as const;
  }

  if (status === PaymentStatus.FAILED || status === PaymentStatus.CANCELLED) {
    return "rose" as const;
  }

  return "neutral" as const;
}

function currentSubscription(membership: MembershipItem) {
  return (
    membership.subscriptions.find((subscription) =>
      CURRENT_SUBSCRIPTION_STATUSES.includes(subscription.status),
    ) ?? null
  );
}

function MemberBillingCard({
  membership,
  plans,
  redirectTo,
}: {
  membership: MembershipItem;
  plans: BillingData["activePlans"];
  redirectTo: string;
}) {
  const subscription = currentSubscription(membership);
  const payableInvoices = membership.invoices.filter((invoice) =>
    PAYABLE_INVOICE_STATUSES.includes(invoice.status),
  );

  return (
    <article className="rounded-[1rem] border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-stone-950">
            {membership.user.name}
          </h2>
          <p className="mt-1 break-all text-sm text-stone-600">
            {membership.user.email}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {subscription ? (
            <StatusBadge tone={subscriptionTone(subscription.status)}>
              {formatSubscriptionStatus(subscription.status)}
            </StatusBadge>
          ) : (
            <StatusBadge>No subscription</StatusBadge>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="space-y-4 rounded-lg border border-stone-200 bg-stone-50 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
              Current plan
            </p>
            {subscription ? (
              <div className="mt-2">
                <p className="font-medium text-stone-950">
                  {subscription.plan.name}
                </p>
                <p className="mt-1 text-sm text-stone-600">
                  {formatMinorUnits(
                    subscription.plan.amountMinor,
                    subscription.plan.currency,
                  )}{" "}
                  / {formatBillingInterval(subscription.plan.billingInterval)}
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  {formatDate(subscription.currentPeriodStart)} to{" "}
                  {formatDate(subscription.currentPeriodEnd)}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-stone-600">No plan assigned.</p>
            )}
          </div>

          <form action={assignMembershipPlanAction} className="space-y-3">
            <input type="hidden" name="membershipId" value={membership.id} />
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <div className="space-y-2">
              <Label htmlFor={`plan-${membership.id}`}>Assign plan</Label>
              <select
                id={`plan-${membership.id}`}
                name="planId"
                defaultValue={subscription?.planId ?? plans[0]?.id ?? ""}
                className="flex h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} - {formatMinorUnits(plan.amountMinor, plan.currency)}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="submit"
              disabled={plans.length === 0}
              className="h-10 gap-2 rounded-lg bg-stone-900 px-3 text-stone-50 hover:bg-stone-800"
            >
              <ShieldCheck className="size-4" />
              Assign
            </Button>
          </form>

          <form action={createMembershipInvoiceAction}>
            <input type="hidden" name="membershipId" value={membership.id} />
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <Button
              type="submit"
              disabled={!subscription}
              variant="outline"
              className="h-10 gap-2 rounded-lg border-stone-200 bg-white px-3 text-stone-700 hover:bg-stone-50"
            >
              <FilePlus2 className="size-4" />
              Create invoice
            </Button>
          </form>

          {subscription ? (
            <div className="grid gap-3">
              <form action={updateSubscriptionStateAction} className="flex gap-2">
                <input
                  type="hidden"
                  name="subscriptionId"
                  value={subscription.id}
                />
                <input type="hidden" name="action" value="pause" />
                <input type="hidden" name="redirectTo" value={redirectTo} />
                <Button
                  type="submit"
                  variant="outline"
                  className="h-10 gap-2 rounded-lg border-stone-200 bg-white px-3 text-stone-700 hover:bg-stone-50"
                >
                  <PauseCircle className="size-4" />
                  Pause
                </Button>
              </form>
              <form action={updateSubscriptionStateAction} className="space-y-2">
                <input
                  type="hidden"
                  name="subscriptionId"
                  value={subscription.id}
                />
                <input type="hidden" name="action" value="waive" />
                <input type="hidden" name="redirectTo" value={redirectTo} />
                <Label htmlFor={`waiver-${membership.id}`}>Waiver reason</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id={`waiver-${membership.id}`}
                    name="reason"
                    defaultValue={subscription.waiverReason ?? ""}
                    maxLength={500}
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    className="h-10 gap-2 rounded-lg border-stone-200 bg-white px-3 text-stone-700 hover:bg-stone-50"
                  >
                    Waive
                  </Button>
                </div>
              </form>
              <form action={updateSubscriptionStateAction}>
                <input
                  type="hidden"
                  name="subscriptionId"
                  value={subscription.id}
                />
                <input type="hidden" name="action" value="cancel" />
                <input type="hidden" name="redirectTo" value={redirectTo} />
                <Button
                  type="submit"
                  className="h-10 gap-2 rounded-lg bg-rose-700 px-3 text-white hover:bg-rose-800"
                >
                  <XCircle className="size-4" />
                  Cancel subscription
                </Button>
              </form>
            </div>
          ) : null}
        </section>

        <section className="space-y-4 rounded-lg border border-stone-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <ReceiptText className="size-4 text-stone-500" />
            <h3 className="font-semibold text-stone-950">Record payment</h3>
          </div>
          <form action={recordMembershipPaymentAction} className="space-y-3">
            <input type="hidden" name="membershipId" value={membership.id} />
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <input type="hidden" name="idempotencyKey" value={randomUUID()} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`invoice-${membership.id}`}>Invoice</Label>
                <select
                  id={`invoice-${membership.id}`}
                  name="invoiceId"
                  className="flex h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                >
                  <option value="">Standalone payment</option>
                  {payableInvoices.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.invoiceNumber} -{" "}
                      {formatMinorUnits(
                        calculateInvoiceBalance(invoice),
                        invoice.currency,
                      )}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`method-${membership.id}`}>Method</Label>
                <select
                  id={`method-${membership.id}`}
                  name="method"
                  className="flex h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                  defaultValue={PaymentMethod.CASH}
                >
                  {paymentMethods.map((method) => (
                    <option key={method} value={method}>
                      {formatPaymentMethod(method)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`amount-${membership.id}`}>Amount</Label>
                <Input
                  id={`amount-${membership.id}`}
                  name="amount"
                  inputMode="decimal"
                  placeholder="Leave blank for invoice balance"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`paid-at-${membership.id}`}>Paid at</Label>
                <Input
                  id={`paid-at-${membership.id}`}
                  name="paidAt"
                  type="datetime-local"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`external-${membership.id}`}>
                External reference
              </Label>
              <Input
                id={`external-${membership.id}`}
                name="externalReference"
                maxLength={160}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`notes-${membership.id}`}>Internal notes</Label>
              <Textarea id={`notes-${membership.id}`} name="notes" rows={3} />
            </div>
            <Button
              type="submit"
              className="h-10 gap-2 rounded-lg bg-stone-900 px-3 text-stone-50 hover:bg-stone-800"
            >
              <ReceiptText className="size-4" />
              Record payment
            </Button>
          </form>
        </section>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <section className="space-y-3">
          <h3 className="font-semibold text-stone-950">Invoices</h3>
          {membership.invoices.length ? (
            membership.invoices.map((invoice) => {
              const balance = calculateInvoiceBalance(invoice);
              const canVoid =
                invoice.amountPaidMinor === BigInt(0) &&
                VOIDABLE_INVOICE_STATUSES.includes(invoice.status);

              return (
                <div
                  key={invoice.id}
                  className="rounded-lg border border-stone-200 bg-stone-50 p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-stone-900">
                        {invoice.invoiceNumber}
                      </p>
                      <p className="text-xs text-stone-500">
                        Due {formatDate(invoice.dueAt)}
                      </p>
                    </div>
                    <StatusBadge tone={invoiceTone(invoice.status)}>
                      {formatInvoiceStatus(invoice.status)}
                    </StatusBadge>
                  </div>
                  <p className="mt-2 text-sm text-stone-700">
                    {formatMinorUnits(invoice.amountPaidMinor, invoice.currency)} paid
                    of {formatMinorUnits(invoice.amountDueMinor, invoice.currency)}
                    {" "}- balance {formatMinorUnits(balance, invoice.currency)}
                  </p>
                  {canVoid ? (
                    <form action={voidMembershipInvoiceAction} className="mt-3">
                      <input
                        type="hidden"
                        name="invoiceId"
                        value={invoice.id}
                      />
                      <input type="hidden" name="redirectTo" value={redirectTo} />
                      <Button
                        type="submit"
                        variant="outline"
                        className="h-9 gap-2 rounded-lg border-stone-200 bg-white px-3 text-xs text-stone-700 hover:bg-stone-50"
                      >
                        <XCircle className="size-3.5" />
                        Void
                      </Button>
                    </form>
                  ) : null}
                </div>
              );
            })
          ) : (
            <p className="text-sm text-stone-500">No invoices in this view.</p>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold text-stone-950">Payments</h3>
          {membership.payments.length ? (
            membership.payments.map((payment) => (
              <div
                key={payment.id}
                className="rounded-lg border border-stone-200 bg-stone-50 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-stone-900">
                      {payment.internalReference}
                    </p>
                    <p className="text-xs text-stone-500">
                      {formatMinorUnits(payment.amountMinor, payment.currency)} via{" "}
                      {formatPaymentMethod(payment.method)}
                    </p>
                  </div>
                  <StatusBadge tone={paymentTone(payment.status)}>
                    {formatPaymentStatus(payment.status)}
                  </StatusBadge>
                </div>
                <p className="mt-2 text-sm text-stone-700">
                  Invoice: {payment.invoice?.invoiceNumber ?? "not linked"}
                </p>
                {payment.status === PaymentStatus.PENDING ? (
                  <form
                    action={confirmMembershipPaymentAction}
                    className="mt-3"
                  >
                    <input
                      type="hidden"
                      name="paymentId"
                      value={payment.id}
                    />
                    <input type="hidden" name="redirectTo" value={redirectTo} />
                    <Button
                      type="submit"
                      className="h-9 gap-2 rounded-lg bg-stone-900 px-3 text-xs text-stone-50 hover:bg-stone-800"
                    >
                      <CheckCircle2 className="size-3.5" />
                      Confirm
                    </Button>
                  </form>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-sm text-stone-500">No payments in this view.</p>
          )}
        </section>
      </div>
    </article>
  );
}

function OnlinePaymentReconciliationSection({
  attempts,
  redirectTo,
}: {
  attempts: OnlinePaymentAttemptItem[];
  redirectTo: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-stone-950">
            Online payment reconciliation
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            Flutterwave sandbox attempts awaiting settlement, review, or audit.
          </p>
        </div>
      </div>

      {attempts.length ? (
        <div className="grid gap-3">
          {attempts.map((attempt) => (
            <article
              key={attempt.id}
              className="rounded-[1rem] border border-stone-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="break-all font-semibold text-stone-950">
                      {attempt.sonderReference}
                    </p>
                    <StatusBadge
                      tone={
                        attempt.status === "SETTLED"
                          ? "emerald"
                          : attempt.status === "REVIEW_REQUIRED"
                            ? "amber"
                            : attempt.status === "FAILED" ||
                                attempt.status === "CANCELLED" ||
                                attempt.status === "EXPIRED"
                              ? "rose"
                              : "sky"
                      }
                    >
                      {formatOnlinePaymentAttemptStatus(attempt.status)}
                    </StatusBadge>
                  </div>
                  <p className="mt-1 text-sm text-stone-600">
                    {attempt.membership.user.name} -{" "}
                    {attempt.membership.user.email}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <form action={recheckOnlinePaymentAttemptAction}>
                    <input type="hidden" name="attemptId" value={attempt.id} />
                    <input type="hidden" name="redirectTo" value={redirectTo} />
                    <Button
                      type="submit"
                      variant="outline"
                      className="h-9 gap-2 rounded-lg border-stone-200 bg-white px-3 text-xs text-stone-700 hover:bg-stone-50"
                    >
                      <RefreshCw className="size-3.5" />
                      Recheck
                    </Button>
                  </form>
                  {attempt.status !== "SETTLED" &&
                  attempt.status !== "REVIEW_REQUIRED" ? (
                    <form action={markOnlinePaymentAttemptForReviewAction}>
                      <input type="hidden" name="attemptId" value={attempt.id} />
                      <input type="hidden" name="redirectTo" value={redirectTo} />
                      <Button
                        type="submit"
                        variant="outline"
                        className="h-9 gap-2 rounded-lg border-amber-200 bg-amber-50 px-3 text-xs text-amber-900 hover:bg-amber-100"
                      >
                        <AlertTriangle className="size-3.5" />
                        Flag review
                      </Button>
                    </form>
                  ) : null}
                  <Link
                    href={`/admin/billing?q=${encodeURIComponent(
                      attempt.membership.user.email,
                    )}`}
                    className="inline-flex h-9 items-center rounded-lg border border-stone-200 bg-white px-3 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50"
                  >
                    Related invoice
                  </Link>
                </div>
              </div>

              <dl className="mt-4 grid gap-3 text-sm text-stone-700 sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                    Expected amount
                  </dt>
                  <dd className="mt-1">
                    {formatMinorUnits(attempt.amountMinor, attempt.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                    Invoice
                  </dt>
                  <dd className="mt-1">{attempt.invoice.invoiceNumber}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                    Provider status
                  </dt>
                  <dd className="mt-1">{attempt.providerStatus ?? "Not known"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                    Provider transaction
                  </dt>
                  <dd className="mt-1 break-all">
                    {attempt.providerTransactionId ?? "Not known"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                    Created
                  </dt>
                  <dd className="mt-1">{formatDateTime(attempt.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                    Last checked
                  </dt>
                  <dd className="mt-1">
                    {attempt.lastStatusCheckedAt
                      ? formatDateTime(attempt.lastStatusCheckedAt)
                      : "Not checked"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                    Verified
                  </dt>
                  <dd className="mt-1">
                    {attempt.verifiedAt
                      ? formatDateTime(attempt.verifiedAt)
                      : "Not verified"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                    Settled
                  </dt>
                  <dd className="mt-1">
                    {attempt.settledAt
                      ? formatDateTime(attempt.settledAt)
                      : "Not settled"}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                    Review reason
                  </dt>
                  <dd className="mt-1">{attempt.reviewReason ?? "None"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                    Confirmed payment
                  </dt>
                  <dd className="mt-1">
                    {attempt.settledPayment?.internalReference ?? "Not linked"}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No online payment attempts"
          description="Flutterwave checkout attempts will appear here after members start sandbox checkout."
        />
      )}
    </section>
  );
}

export default async function BillingAdminPage({
  searchParams,
}: BillingAdminPageProps) {
  const { user, membership } = await requireBillingAdmin("/dashboard");
  const params = await searchParams;
  const search = single(params.q)?.trim();
  const subscriptionStatus = parseSubscriptionStatusFilter(params.subscription);
  const invoiceStatus = parseInvoiceStatusFilter(params.invoice);
  const adminContext = { user, membership };
  const [data, onlineAttempts] = await Promise.all([
    getAdminBillingPageData(adminContext, {
      search,
      subscriptionStatus,
      invoiceStatus,
    }),
    getOnlinePaymentAttemptsForAdmin(adminContext),
  ]);
  const redirectTo = billingHref({ search, subscriptionStatus, invoiceStatus });

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm sm:p-6">
        <SectionHeading
          eyebrow="Admin"
          title="Billing administration"
          description={`Showing ${data.memberships.length} of ${data.totalMatching} matching active members. Detail rows are capped at ${ADMIN_BILLING_DETAIL_LIMIT} invoices and payments per member.`}
          action={
            <Link
              href="/admin/membership-plans"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-stone-300 hover:bg-stone-50"
            >
              Membership plans
            </Link>
          }
        />
      </section>

      <section className="rounded-[1rem] border border-stone-200 bg-white p-4 shadow-sm">
        <form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_200px_auto]">
          <div className="space-y-2">
            <Label htmlFor="billing-search">Search</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
              <Input
                id="billing-search"
                name="q"
                defaultValue={search ?? ""}
                className="pl-9"
                placeholder="Name or email"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="subscription-filter">Subscription</Label>
            <select
              id="subscription-filter"
              name="subscription"
              defaultValue={subscriptionStatus ?? ""}
              className="flex h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
            >
              <option value="">All</option>
              {subscriptionStatusFilterValues.map((status) => (
                <option key={status} value={status}>
                  {formatSubscriptionStatus(status)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="invoice-filter">Invoice</Label>
            <select
              id="invoice-filter"
              name="invoice"
              defaultValue={invoiceStatus ?? ""}
              className="flex h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
            >
              <option value="">All</option>
              {invoiceStatusFilterValues.map((status) => (
                <option key={status} value={status}>
                  {formatInvoiceStatus(status)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <Button
              type="submit"
              className="h-10 gap-2 rounded-lg bg-stone-900 px-3 text-stone-50 hover:bg-stone-800"
            >
              <Search className="size-4" />
              Filter
            </Button>
            <Link
              href="/admin/billing"
              className={cn(
                "inline-flex h-10 items-center rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50",
                !search && !subscriptionStatus && !invoiceStatus && "hidden",
              )}
            >
              Clear
            </Link>
          </div>
        </form>
      </section>

      <OnlinePaymentReconciliationSection
        attempts={onlineAttempts}
        redirectTo={redirectTo}
      />

      <section className="space-y-4">
        {data.memberships.length ? (
          data.memberships.map((item) => (
            <MemberBillingCard
              key={item.id}
              membership={item}
              plans={data.activePlans}
              redirectTo={redirectTo}
            />
          ))
        ) : (
          <EmptyState
            title="No members found"
            description={`Billing results are limited to ${ADMIN_BILLING_MEMBER_LIMIT} active members.`}
          />
        )}
      </section>
    </div>
  );
}
