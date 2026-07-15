import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert, CircleCheck, Clock3 } from "lucide-react";

import { StatusBadge } from "@/components/app/status-badge";
import { formatMinorUnits } from "@/features/billing/currency";
import { getMemberPaymentReturnState } from "@/features/billing/online-payments";
import { formatDateTime } from "@/lib/formatters";
import { requireSessionUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Payment Return",
};

type PaymentReturnPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function statusTone(statusLabel: string) {
  if (statusLabel === "successful and settled") {
    return "emerald" as const;
  }

  if (statusLabel === "requires administrative review") {
    return "amber" as const;
  }

  if (statusLabel === "failed" || statusLabel === "cancelled") {
    return "rose" as const;
  }

  return "sky" as const;
}

function StatusIcon({ statusLabel }: { statusLabel: string }) {
  if (statusLabel === "successful and settled") {
    return <CircleCheck className="size-5" />;
  }

  if (statusLabel === "processing") {
    return <Clock3 className="size-5" />;
  }

  return <CircleAlert className="size-5" />;
}

export default async function PaymentReturnPage({
  searchParams,
}: PaymentReturnPageProps) {
  const user = await requireSessionUser();
  const params = await searchParams;
  const state = await getMemberPaymentReturnState({
    userId: user.id,
    sonderReference: single(params.tx_ref) ?? null,
    providerTransactionId: single(params.transaction_id) ?? null,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <section className="rounded-[1rem] border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <div className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-stone-900 text-stone-50">
            <StatusIcon statusLabel={state.statusLabel} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-stone-950">
                {state.title}
              </h1>
              <StatusBadge tone={statusTone(state.statusLabel)}>
                {state.statusLabel}
              </StatusBadge>
            </div>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {state.message}
            </p>
          </div>
        </div>

        {state.attempt ? (
          <dl className="mt-6 grid gap-3 text-sm text-stone-700 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                Sonder reference
              </dt>
              <dd className="mt-1 break-all">{state.attempt.sonderReference}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                Amount
              </dt>
              <dd className="mt-1">
                {formatMinorUnits(
                  state.attempt.amountMinor,
                  state.attempt.currency,
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                Last checked
              </dt>
              <dd className="mt-1">
                {state.attempt.lastStatusCheckedAt
                  ? formatDateTime(state.attempt.lastStatusCheckedAt)
                  : "Not checked yet"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                Invoice
              </dt>
              <dd className="mt-1">{state.attempt.invoice.invoiceNumber}</dd>
            </div>
          </dl>
        ) : null}

        <div className="mt-6">
          <Link
            href="/membership/billing"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-stone-300 hover:bg-stone-50"
          >
            Back to billing
          </Link>
        </div>
      </section>
    </div>
  );
}
