import type { Metadata } from "next";
import Link from "next/link";
import { EmailOutboxStatus } from "@prisma/client";
import { Play, RotateCcw, ShieldAlert, XCircle } from "lucide-react";

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
import {
  cancelEmailAction,
  moveUncertainEmailToReviewAction,
  processEmailBatchAction,
  retryFailedEmailAction,
} from "@/features/email/outbox-actions";
import {
  EMAIL_OUTBOX_PAGE_LIMIT,
  emailOutboxDueFilterValues,
  emailOutboxProviderFilterValues,
  emailOutboxStatusFilterValues,
  formatEmailOutboxStatus,
  getEmailOutboxPageData,
  maskEmailAddress,
  parseEmailOutboxDueFilter,
  parseEmailOutboxProviderFilter,
  parseEmailOutboxSearch,
  parseEmailOutboxStatusFilter,
  type EmailOutboxFilters,
} from "@/features/email/outbox-queries";
import { requireEmailOutboxAdmin } from "@/features/email/outbox-permissions";
import { formatDateTime } from "@/lib/formatters";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Email Outbox",
};

type EmailOutboxPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function filtersHref(filters: EmailOutboxFilters, status?: EmailOutboxStatus) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (filters.provider) params.set("provider", filters.provider);
  if (filters.due) params.set("due", filters.due);
  if (filters.search) params.set("search", filters.search);
  const query = params.toString();
  return query ? `/admin/email-outbox?${query}` : "/admin/email-outbox";
}

function statusTone(status: EmailOutboxStatus) {
  if (status === EmailOutboxStatus.DELIVERED) return "emerald" as const;
  if (
    status === EmailOutboxStatus.PERMANENTLY_FAILED ||
    status === EmailOutboxStatus.FAILED ||
    status === EmailOutboxStatus.BOUNCED ||
    status === EmailOutboxStatus.COMPLAINED ||
    status === EmailOutboxStatus.SUPPRESSED
  ) {
    return "rose" as const;
  }
  if (status === EmailOutboxStatus.PROCESSING) return "sky" as const;
  if (
    status === EmailOutboxStatus.CANCELLED ||
    status === EmailOutboxStatus.REVIEW_REQUIRED
  ) {
    return "neutral" as const;
  }
  return "amber" as const;
}

function shortIdentifier(value: string | null) {
  if (!value) return "None";
  return value.length <= 18 ? value : `${value.slice(0, 8)}…${value.slice(-6)}`;
}

type EmailOutboxItem = Awaited<
  ReturnType<typeof getEmailOutboxPageData>
>["emails"][number];

function EmailActions({
  email,
  redirectTo,
}: {
  email: EmailOutboxItem;
  redirectTo: string;
}) {
  const canRetry =
    !email.uncertainSince &&
    (email.status === EmailOutboxStatus.RETRY_SCHEDULED ||
      ((email.status === EmailOutboxStatus.FAILED ||
        email.status === EmailOutboxStatus.PERMANENTLY_FAILED) &&
        email.lastFailureRetryable === true));
  const canCancel =
    email.status === EmailOutboxStatus.PENDING ||
    email.status === EmailOutboxStatus.RETRY_SCHEDULED;
  const canReview =
    Boolean(email.uncertainSince) &&
    (email.status === EmailOutboxStatus.RETRY_SCHEDULED ||
      (email.status === EmailOutboxStatus.PROCESSING &&
        Boolean(email.leaseExpiresAt && email.leaseExpiresAt <= new Date())));

  return (
    <div className="flex flex-wrap gap-2">
      {canRetry ? (
        <form action={retryFailedEmailAction}>
          <input type="hidden" name="emailId" value={email.id} />
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <button type="submit" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50">
            <RotateCcw className="size-3.5" /> Retry safely
          </button>
        </form>
      ) : null}
      {canReview ? (
        <form action={moveUncertainEmailToReviewAction}>
          <input type="hidden" name="emailId" value={email.id} />
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <button type="submit" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100">
            <ShieldAlert className="size-3.5" /> Review
          </button>
        </form>
      ) : null}
      {canCancel ? (
        <form action={cancelEmailAction}>
          <input type="hidden" name="emailId" value={email.id} />
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <button type="submit" className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-800">
            <XCircle className="size-3.5" /> Cancel
          </button>
        </form>
      ) : null}
    </div>
  );
}

function AuditDetails({ email }: { email: EmailOutboxItem }) {
  if (!email.deliveryAttempts.length && !email.webhookEvents.length) return null;

  return (
    <details className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs text-stone-700">
      <summary className="cursor-pointer font-semibold">Delivery audit</summary>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="font-semibold text-stone-900">Provider attempts</p>
          <ul className="mt-2 space-y-2">
            {email.deliveryAttempts.map((attempt) => (
              <li key={attempt.id} className="rounded-md bg-white p-2">
                #{attempt.attemptNumber} · {attempt.provider} · {attempt.outcome.toLowerCase().replaceAll("_", " ")}
                <br />
                {formatDateTime(attempt.startedAt)} · HTTP {attempt.httpStatus ?? "n/a"} · {attempt.failureCode ?? "no failure"}
                {attempt.uncertainDelivery ? " · outcome uncertain" : ""}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-semibold text-stone-900">Verified webhook events</p>
          <ul className="mt-2 space-y-2">
            {email.webhookEvents.map((event) => (
              <li key={event.id} className="rounded-md bg-white p-2">
                {event.eventType} · {event.status.toLowerCase().replaceAll("_", " ")}
                <br />
                {formatDateTime(event.eventTimestamp)} · {event.failureReason ?? "processed"}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}

export default async function EmailOutboxPage({
  searchParams,
}: EmailOutboxPageProps) {
  const { user, membership } = await requireEmailOutboxAdmin("/dashboard");
  const params = await searchParams;
  const filters: EmailOutboxFilters = {
    status: parseEmailOutboxStatusFilter(params.status),
    provider: parseEmailOutboxProviderFilter(params.provider),
    due: parseEmailOutboxDueFilter(params.due),
    search: parseEmailOutboxSearch(params.search),
  };
  const data = await getEmailOutboxPageData({ user, membership }, filters);
  const redirectTo = filtersHref(filters, filters.status);

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm sm:p-6">
        <SectionHeading
          eyebrow="Admin"
          title="Email delivery outbox"
          description={`Showing up to ${EMAIL_OUTBOX_PAGE_LIMIT} durable email jobs. Provider acceptance and recipient delivery are tracked separately.`}
          action={
            <div className="flex flex-wrap gap-2">
              <form action={processEmailBatchAction}>
                <input type="hidden" name="redirectTo" value={redirectTo} />
                <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 hover:bg-stone-800">
                  <Play className="size-4" /> Process up to 5
                </button>
              </form>
              <Link href="/admin" className="inline-flex min-h-11 items-center rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50">
                Admin settings
              </Link>
            </div>
          }
        />
      </section>

      <section className="space-y-3 rounded-[1rem] border border-stone-200 bg-white/80 p-4 shadow-sm">
        <form method="get" className="grid gap-3 md:grid-cols-4">
          <label className="text-sm font-medium text-stone-700">
            Provider
            <select name="provider" defaultValue={filters.provider ?? ""} className="mt-1 h-10 w-full rounded-lg border border-stone-200 bg-white px-3">
              <option value="">All</option>
              {emailOutboxProviderFilterValues.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-stone-700">
            Due state
            <select name="due" defaultValue={filters.due ?? ""} className="mt-1 h-10 w-full rounded-lg border border-stone-200 bg-white px-3">
              <option value="">All</option>
              {emailOutboxDueFilterValues.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-stone-700 md:col-span-2">
            Safe metadata search
            <div className="mt-1 flex gap-2">
              <input name="search" defaultValue={filters.search ?? ""} maxLength={80} placeholder="Template, job ID, dedupe key, provider ID" className="h-10 min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-3" />
              <button type="submit" className="rounded-lg border border-stone-300 bg-white px-4 text-sm font-medium">Filter</button>
            </div>
          </label>
        </form>
        <div className="flex flex-wrap gap-2">
          <Link href={filtersHref(filters)} className={cn("rounded-lg border px-3 py-2 text-xs font-medium", !filters.status ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white")}>All statuses</Link>
          {emailOutboxStatusFilterValues.map((value) => (
            <Link key={value} href={filtersHref(filters, value)} className={cn("rounded-lg border px-3 py-2 text-xs font-medium capitalize", filters.status === value ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white")}>
              {formatEmailOutboxStatus(value)}
            </Link>
          ))}
        </div>
      </section>

      {data.emails.length ? (
        <section className="space-y-3">
          {data.emails.map((email) => (
            <article key={email.id} className="rounded-[1rem] border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-stone-950">{email.subject}</p>
                  <p className="mt-1 text-xs text-stone-500">{email.recipientUser?.name ?? "External recipient"} · {maskEmailAddress(email.toEmail)}</p>
                </div>
                <StatusBadge tone={statusTone(email.status)}>{formatEmailOutboxStatus(email.status)}</StatusBadge>
              </div>
              <dl className="mt-4 grid gap-3 text-sm text-stone-600 sm:grid-cols-2 lg:grid-cols-5">
                <div><dt className="text-xs font-semibold uppercase tracking-wider">Template</dt><dd>{email.templateKey} v{email.templateVersion}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wider">Class</dt><dd>{email.deliveryClass.toLowerCase().replaceAll("_", " ")}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wider">Provider</dt><dd>{email.provider ?? "unassigned"} · {shortIdentifier(email.providerMessageId)}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wider">Attempts</dt><dd>{email.attempts}/{email.maxAttempts}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wider">Failure</dt><dd>{email.lastFailureCategory ?? "None"} / {email.lastFailureCode ?? "None"}</dd></div>
              </dl>
              <div className="mt-4"><EmailActions email={email} redirectTo={redirectTo} /></div>
              <AuditDetails email={email} />
            </article>
          ))}
        </section>
      ) : (
        <EmptyState title="No email jobs found" description="Queued email jobs matching the current filters will appear here." />
      )}

      <section className="rounded-[1rem] border border-stone-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-stone-950">Recipient suppressions</h2>
        <p className="mt-1 text-sm text-stone-600">Complaint, hard-bounce, provider, administrative, and invalid-address records are audit-preserving and cannot be cleared from this screen.</p>
        {data.suppressions.length ? (
          <Table>
            <TableHeader><TableRow><TableHead>Recipient</TableHead><TableHead>Reason</TableHead><TableHead>Source</TableHead><TableHead>State</TableHead><TableHead>Last occurrence</TableHead></TableRow></TableHeader>
            <TableBody>{data.suppressions.map((suppression) => (
              <TableRow key={suppression.id}><TableCell>{maskEmailAddress(suppression.normalizedEmail)}</TableCell><TableCell>{suppression.reason.toLowerCase().replaceAll("_", " ")}</TableCell><TableCell>{suppression.provider ?? suppression.source}</TableCell><TableCell>{suppression.active ? "active" : "resolved"}</TableCell><TableCell>{formatDateTime(suppression.lastOccurredAt)}</TableCell></TableRow>
            ))}</TableBody>
          </Table>
        ) : <p className="mt-4 text-sm text-stone-500">No suppression records.</p>}
      </section>

      <section className="rounded-[1rem] border border-stone-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-stone-950">Unmatched verified webhooks</h2>
        <p className="mt-1 text-sm text-stone-600">Verified events without a correlated outbox row remain available for administrative review.</p>
        {data.unmatchedWebhookEvents.length ? (
          <ul className="mt-4 space-y-2 text-sm text-stone-700">
            {data.unmatchedWebhookEvents.map((event) => (
              <li key={event.id} className="rounded-lg border border-stone-200 p-3">{event.provider} · {event.eventType} · {event.status.toLowerCase().replaceAll("_", " ")} · {formatDateTime(event.eventTimestamp)} · {event.failureReason ?? "no failure"}</li>
            ))}
          </ul>
        ) : <p className="mt-4 text-sm text-stone-500">No unmatched verified events.</p>}
      </section>
    </div>
  );
}
