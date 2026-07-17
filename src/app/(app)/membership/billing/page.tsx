import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import {
  InvoiceStatus,
  PaymentStatus,
  SubscriptionStatus,
} from "@prisma/client";
import { CreditCard, ReceiptText } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { SectionHeading } from "@/components/app/section-heading";
import { StatusBadge } from "@/components/app/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { startOnlineCheckoutAction } from "@/features/billing/actions";
import { formatMinorUnits } from "@/features/billing/currency";
import { onlinePaymentProviderStatus } from "@/features/billing/online-payments";
import {
  MEMBER_INVOICE_LIMIT,
  MEMBER_PAYMENT_HISTORY_LIMIT,
  getMemberBillingPageData,
} from "@/features/billing/queries";
import { calculateInvoiceBalance } from "@/features/billing/service";
import {
  formatBillingInterval,
  formatDate,
  formatDateTime,
  formatInvoiceStatus,
  formatPaymentMethod,
  formatPaymentStatus,
  formatSubscriptionStatus,
} from "@/lib/formatters";
import { requireSessionUser } from "@/lib/session";
import { OnlinePaymentSubmitButton } from "./online-payment-submit-button";

export const metadata: Metadata = {
  title: "Billing",
};

function subscriptionTone(status: SubscriptionStatus) {
  if (status === SubscriptionStatus.ACTIVE) {
    return "emerald" as const;
  }

  if (status === SubscriptionStatus.PAST_DUE) {
    return "rose" as const;
  }

  if (status === SubscriptionStatus.WAIVED) {
    return "sky" as const;
  }

  if (status === SubscriptionStatus.PAUSED) {
    return "amber" as const;
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

  if (status === PaymentStatus.FAILED || status === PaymentStatus.CANCELLED) {
    return "rose" as const;
  }

  if (status === PaymentStatus.PENDING) {
    return "amber" as const;
  }

  return "neutral" as const;
}

const PAYABLE_INVOICE_STATUSES: readonly InvoiceStatus[] = [
  InvoiceStatus.OPEN,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
] as const;

function isPayableInvoice(status: InvoiceStatus, balance: bigint) {
  return PAYABLE_INVOICE_STATUSES.includes(status) && balance > 0;
}

function OnlinePaymentForm({
  invoiceId,
  redirectTo,
  amountLabel,
}: {
  invoiceId: string;
  redirectTo: string;
  amountLabel: string;
}) {
  return (
    <form action={startOnlineCheckoutAction} className="mt-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <input type="hidden" name="checkoutNonce" value={randomUUID()} />
      <OnlinePaymentSubmitButton amountLabel={amountLabel} />
    </form>
  );
}

export default async function BillingPage() {
  const user = await requireSessionUser();
  const data = await getMemberBillingPageData(user.id);
  const subscription = data.currentSubscription;
  const providerStatus = onlinePaymentProviderStatus();
  const onlinePaymentsEnabled = providerStatus.isConfigured;

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm sm:p-6">
        <SectionHeading
          eyebrow="Membership"
          title="Billing"
          description="Your membership dues, invoices, and verified offline payment history."
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-[1rem] border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start gap-3">
            <div className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-stone-900 text-stone-50">
              <CreditCard className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-stone-950">
                {subscription?.plan.name ?? "No plan assigned"}
              </p>
              {subscription ? (
                <p className="mt-1 text-sm text-stone-600">
                  {formatMinorUnits(
                    subscription.plan.amountMinor,
                    subscription.plan.currency,
                  )}{" "}
                  / {formatBillingInterval(subscription.plan.billingInterval)}
                </p>
              ) : (
                <p className="mt-1 text-sm text-stone-600">
                  Billing will appear here after an administrator assigns a plan.
                </p>
              )}
            </div>
          </div>

          {subscription ? (
            <dl className="mt-5 grid gap-3 text-sm text-stone-700 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                  Status
                </dt>
                <dd className="mt-1">
                  <StatusBadge tone={subscriptionTone(data.billingStatus)}>
                    {formatSubscriptionStatus(data.billingStatus)}
                  </StatusBadge>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                  Current period
                </dt>
                <dd className="mt-1">
                  {formatDate(subscription.currentPeriodStart)} to{" "}
                  {formatDate(subscription.currentPeriodEnd)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                  Next billing
                </dt>
                <dd className="mt-1">
                  {subscription.nextBillingAt
                    ? formatDate(subscription.nextBillingAt)
                    : "Not scheduled"}
                </dd>
              </div>
              {subscription.waiverReason ? (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                    Waiver
                  </dt>
                  <dd className="mt-1">{subscription.waiverReason}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </article>

        <article className="rounded-[1rem] border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700 shadow-sm sm:p-5">
          <div className="flex items-start gap-3">
            <ReceiptText className="mt-0.5 size-5 shrink-0 text-stone-500" />
          <div>
            <p className="font-semibold text-stone-950">
                {onlinePaymentsEnabled
                  ? "Online checkout available"
                  : "Online payments unavailable"}
              </p>
              <p className="mt-1 leading-6">
                {onlinePaymentsEnabled
                  ? "Payable invoices can be sent to Flutterwave sandbox checkout. Mobile-money approval may complete asynchronously, so Sonder only updates billing after server-side verification."
                  : "Online checkout is currently disabled. Cash, bank transfer, mobile-money, and approved offline payments are still recorded by an administrator after verification."}
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-stone-950">
            Invoices
          </h2>
          <p className="text-xs text-stone-500">
            Showing up to {MEMBER_INVOICE_LIMIT}
          </p>
        </div>
        {data.membership?.invoices.length ? (
          <>
            <div className="space-y-3 md:hidden">
              {data.membership.invoices.map((invoice) => {
                const balance = calculateInvoiceBalance(invoice);
                const amountLabel = formatMinorUnits(balance, invoice.currency);
                const payable = isPayableInvoice(invoice.status, balance);

                return (
                  <article
                    key={invoice.invoiceNumber}
                    className="rounded-[1rem] border border-stone-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-stone-950">
                          {invoice.invoiceNumber}
                        </p>
                        <p className="mt-1 text-sm text-stone-600">
                          Due {formatDate(invoice.dueAt)}
                        </p>
                      </div>
                      <StatusBadge tone={invoiceTone(invoice.status)}>
                        {formatInvoiceStatus(invoice.status)}
                      </StatusBadge>
                    </div>
                    <dl className="mt-4 grid gap-3 text-sm text-stone-700">
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                          Amount due
                        </dt>
                        <dd className="mt-1">
                          {formatMinorUnits(
                            invoice.amountDueMinor,
                            invoice.currency,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                          Balance
                        </dt>
                        <dd className="mt-1">
                          {amountLabel}
                        </dd>
                      </div>
                    </dl>
                    {payable && onlinePaymentsEnabled ? (
                      <div className="mt-4 border-t border-stone-100 pt-3">
                        <p className="text-sm text-stone-600">
                          Flutterwave may complete mobile-money approval after
                          you return to Sonder.
                        </p>
                        <OnlinePaymentForm
                          invoiceId={invoice.id}
                          redirectTo="/membership/billing"
                          amountLabel={amountLabel}
                        />
                      </div>
                    ) : payable ? (
                      <p className="mt-4 rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-600">
                        Online payments are currently unavailable.
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>

            <div className="hidden rounded-[1rem] border border-stone-200 bg-white p-4 shadow-sm md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Online</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.membership.invoices.map((invoice) => {
                    const balance = calculateInvoiceBalance(invoice);
                    const amountLabel = formatMinorUnits(balance, invoice.currency);
                    const payable = isPayableInvoice(invoice.status, balance);

                    return (
                      <TableRow key={invoice.invoiceNumber}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-stone-900">
                              {invoice.invoiceNumber}
                            </p>
                            <p className="text-xs text-stone-500">
                              {invoice.description}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={invoiceTone(invoice.status)}>
                            {formatInvoiceStatus(invoice.status)}
                          </StatusBadge>
                        </TableCell>
                        <TableCell>{formatDate(invoice.dueAt)}</TableCell>
                        <TableCell>
                          {formatMinorUnits(
                            invoice.amountDueMinor,
                            invoice.currency,
                          )}
                        </TableCell>
                        <TableCell>
                          {formatMinorUnits(
                            invoice.amountPaidMinor,
                            invoice.currency,
                          )}
                        </TableCell>
                        <TableCell>
                          {amountLabel}
                        </TableCell>
                        <TableCell>
                          {payable && onlinePaymentsEnabled ? (
                            <OnlinePaymentForm
                              invoiceId={invoice.id}
                              redirectTo="/membership/billing"
                              amountLabel={amountLabel}
                            />
                          ) : payable ? (
                            <span className="text-sm text-stone-500">
                              Unavailable
                            </span>
                          ) : (
                            <span className="text-sm text-stone-500">
                              Not payable
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <EmptyState
            title="No invoices"
            description="Membership invoices will appear here after they are created."
          />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-stone-950">
            Payment history
          </h2>
          <p className="text-xs text-stone-500">
            Showing up to {MEMBER_PAYMENT_HISTORY_LIMIT}
          </p>
        </div>
        {data.recentPayments.length ? (
          <div className="rounded-[1rem] border border-stone-200 bg-white p-4 shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Invoice</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentPayments.map((payment) => (
                  <TableRow key={payment.internalReference}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-stone-900">
                          {payment.internalReference}
                        </p>
                        {payment.externalReference ? (
                          <p className="text-xs text-stone-500">
                            External: {payment.externalReference}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={paymentTone(payment.status)}>
                        {formatPaymentStatus(payment.status)}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>{formatPaymentMethod(payment.method)}</TableCell>
                    <TableCell>
                      {formatMinorUnits(payment.amountMinor, payment.currency)}
                    </TableCell>
                    <TableCell>
                      {payment.paidAt ? formatDateTime(payment.paidAt) : "Pending"}
                    </TableCell>
                    <TableCell>
                      {payment.invoice?.invoiceNumber ?? "Not linked"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState
            title="No payments"
            description="Verified membership payments will appear here."
          />
        )}
      </section>
    </div>
  );
}
