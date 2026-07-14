import type { Metadata } from "next";
import Link from "next/link";
import { EmailOutboxStatus } from "@prisma/client";
import { RotateCcw, XCircle } from "lucide-react";

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
  retryFailedEmailAction,
} from "@/features/email/outbox-actions";
import {
  EMAIL_OUTBOX_PAGE_LIMIT,
  emailOutboxStatusFilterValues,
  formatEmailOutboxStatus,
  getEmailOutboxPageData,
  maskEmailAddress,
  parseEmailOutboxStatusFilter,
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

function filterHref(status?: EmailOutboxStatus) {
  return status ? `/admin/email-outbox?status=${status}` : "/admin/email-outbox";
}

function statusTone(status: EmailOutboxStatus) {
  if (status === EmailOutboxStatus.SENT) {
    return "emerald" as const;
  }

  if (status === EmailOutboxStatus.FAILED) {
    return "rose" as const;
  }

  if (status === EmailOutboxStatus.PROCESSING) {
    return "sky" as const;
  }

  if (status === EmailOutboxStatus.CANCELLED) {
    return "neutral" as const;
  }

  return "amber" as const;
}

function safeErrorSummary(error: string | null) {
  if (!error) {
    return "None";
  }

  return error.slice(0, 180);
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
  const canRetry = email.status === EmailOutboxStatus.FAILED;
  const canCancel =
    email.status === EmailOutboxStatus.PENDING ||
    email.status === EmailOutboxStatus.FAILED;

  return (
    <div className="flex flex-wrap gap-2">
      {canRetry ? (
        <form action={retryFailedEmailAction}>
          <input type="hidden" name="emailId" value={email.id} />
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <button
            type="submit"
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50"
          >
            <RotateCcw className="size-3.5" />
            Retry
          </button>
        </form>
      ) : null}
      {canCancel ? (
        <form action={cancelEmailAction}>
          <input type="hidden" name="emailId" value={email.id} />
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <button
            type="submit"
            className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-rose-800"
          >
            <XCircle className="size-3.5" />
            Cancel
          </button>
        </form>
      ) : null}
    </div>
  );
}

export default async function EmailOutboxPage({
  searchParams,
}: EmailOutboxPageProps) {
  const { user, membership } = await requireEmailOutboxAdmin("/dashboard");

  const params = await searchParams;
  const status = parseEmailOutboxStatusFilter(params.status);
  const data = await getEmailOutboxPageData({ user, membership }, status);
  const redirectTo = filterHref(status);

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm sm:p-6">
        <SectionHeading
          eyebrow="Admin"
          title="Email outbox"
          description={`Showing up to ${EMAIL_OUTBOX_PAGE_LIMIT} provider-independent email jobs. Records remain pending until a configured provider confirms delivery.`}
          action={
            <Link
              href="/admin"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-stone-300 hover:bg-stone-50"
            >
              Admin settings
            </Link>
          }
        />
      </section>

      <section className="rounded-[1rem] border border-stone-200 bg-white/80 p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <Link
            href={filterHref()}
            className={cn(
              "inline-flex min-h-10 items-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              !status
                ? "border-stone-900 bg-stone-900 text-stone-50"
                : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50",
            )}
          >
            All
          </Link>
          {emailOutboxStatusFilterValues.map((value) => (
            <Link
              key={value}
              href={filterHref(value)}
              className={cn(
                "inline-flex min-h-10 items-center rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors",
                status === value
                  ? "border-stone-900 bg-stone-900 text-stone-50"
                  : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50",
              )}
            >
              {formatEmailOutboxStatus(value)}
            </Link>
          ))}
        </div>
      </section>

      {data.emails.length > 0 ? (
        <>
          <section className="space-y-3 md:hidden">
            {data.emails.map((email) => (
              <article
                key={email.id}
                className="rounded-[1rem] border border-stone-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-stone-950">
                      {email.subject}
                    </p>
                    <p className="mt-1 break-all text-xs text-stone-500">
                      {maskEmailAddress(email.toEmail)}
                    </p>
                  </div>
                  <StatusBadge tone={statusTone(email.status)}>
                    {formatEmailOutboxStatus(email.status)}
                  </StatusBadge>
                </div>
                <dl className="mt-4 grid gap-3 text-sm text-stone-600">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Template
                    </dt>
                    <dd className="mt-1">{email.templateKey}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Attempts
                    </dt>
                    <dd className="mt-1">
                      {email.attempts}/{email.maxAttempts}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Created
                    </dt>
                    <dd className="mt-1">{formatDateTime(email.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Error
                    </dt>
                    <dd className="mt-1">{safeErrorSummary(email.lastError)}</dd>
                  </div>
                </dl>
                <div className="mt-4">
                  <EmailActions email={email} redirectTo={redirectTo} />
                </div>
              </article>
            ))}
          </section>

          <section className="hidden rounded-[1rem] border border-stone-200 bg-white p-4 shadow-sm md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.emails.map((email) => (
                  <TableRow key={email.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-stone-900">
                          {email.recipientUser?.name ?? "External recipient"}
                        </p>
                        <p className="text-xs text-stone-500">
                          {maskEmailAddress(email.toEmail)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{email.templateKey}</TableCell>
                    <TableCell className="max-w-64 whitespace-normal">
                      {email.subject}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={statusTone(email.status)}>
                        {formatEmailOutboxStatus(email.status)}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      {email.attempts}/{email.maxAttempts}
                    </TableCell>
                    <TableCell>{formatDateTime(email.createdAt)}</TableCell>
                    <TableCell className="max-w-56 whitespace-normal text-xs">
                      {safeErrorSummary(email.lastError)}
                    </TableCell>
                    <TableCell>
                      <EmailActions email={email} redirectTo={redirectTo} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        </>
      ) : (
        <EmptyState
          title="No email jobs found"
          description="Queued email jobs matching the current filter will appear here."
        />
      )}
    </div>
  );
}
