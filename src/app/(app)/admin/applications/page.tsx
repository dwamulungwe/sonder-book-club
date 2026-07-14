import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MembershipApplicationStatus } from "@prisma/client";
import {
  CheckCircle2,
  Clock3,
  FileText,
  ListFilter,
  Save,
  XCircle,
} from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { SectionHeading } from "@/components/app/section-heading";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  approveApplicationAction,
  markApplicationUnderReviewAction,
  rejectApplicationAction,
  updateApplicationReviewNotesAction,
  waitlistApplicationAction,
} from "@/features/applications/actions";
import {
  APPLICATION_REVIEW_LIMIT,
  getApplicationReviewPageData,
  parseApplicationStatusFilter,
} from "@/features/applications/queries";
import {
  applicationStatusFilterValues,
} from "@/features/applications/schemas";
import {
  formatDateTime,
  formatMembershipApplicationStatus,
  formatMembershipStatus,
  formatRole,
} from "@/lib/formatters";
import { canModerateClub } from "@/lib/permissions";
import { requireSessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Applications",
};

type ApplicationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ApplicationReviewData = Awaited<
  ReturnType<typeof getApplicationReviewPageData>
>;
type ApplicationItem = ApplicationReviewData["applications"][number];

function filterHref(status?: MembershipApplicationStatus) {
  return status ? `/admin/applications?status=${status}` : "/admin/applications";
}

function statusTone(status: MembershipApplicationStatus) {
  if (status === MembershipApplicationStatus.APPROVED) {
    return "emerald" as const;
  }

  if (status === MembershipApplicationStatus.REJECTED) {
    return "rose" as const;
  }

  if (
    status === MembershipApplicationStatus.UNDER_REVIEW ||
    status === MembershipApplicationStatus.WAITLISTED
  ) {
    return "amber" as const;
  }

  return "sky" as const;
}

function ApplicationDetail({
  application,
  redirectTo,
}: {
  application: ApplicationItem;
  redirectTo: string;
}) {
  const isFinal =
    application.status === MembershipApplicationStatus.APPROVED ||
    application.status === MembershipApplicationStatus.REJECTED;
  const reviewableStatuses: readonly MembershipApplicationStatus[] = [
    MembershipApplicationStatus.SUBMITTED,
    MembershipApplicationStatus.UNDER_REVIEW,
    MembershipApplicationStatus.WAITLISTED,
  ];
  const waitlistableStatuses: readonly MembershipApplicationStatus[] = [
    MembershipApplicationStatus.SUBMITTED,
    MembershipApplicationStatus.UNDER_REVIEW,
  ];
  const underReviewStatuses: readonly MembershipApplicationStatus[] = [
    MembershipApplicationStatus.SUBMITTED,
    MembershipApplicationStatus.WAITLISTED,
  ];
  const canApprove = reviewableStatuses.includes(application.status);
  const canWaitlist = waitlistableStatuses.includes(application.status);
  const canReject = canApprove;
  const canMarkUnderReview = underReviewStatuses.includes(application.status);

  return (
    <article className="rounded-[1rem] border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-stone-950">
              {application.fullName}
            </h2>
            <StatusBadge tone={statusTone(application.status)}>
              {formatMembershipApplicationStatus(application.status)}
            </StatusBadge>
          </div>
          <p className="mt-2 break-all text-sm text-stone-600">
            {application.email}
          </p>
          <p className="mt-1 text-xs text-stone-500">
            Submitted {formatDateTime(application.submittedAt)}
          </p>
        </div>
        {application.applicantUser?.membership ? (
          <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
            <span className="font-medium text-stone-900">
              {formatRole(application.applicantUser.membership.role)}
            </span>{" "}
            / {formatMembershipStatus(application.applicantUser.membership.status)}
          </div>
        ) : null}
      </div>

      <details className="mt-4 rounded-xl border border-stone-200 bg-[rgba(255,251,244,0.7)] p-3">
        <summary className="cursor-pointer text-sm font-semibold text-stone-800">
          Open application details
        </summary>
        <div className="mt-4 grid gap-4 text-sm text-stone-700 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
              Phone
            </p>
            <p className="mt-1">{application.phoneNumber}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
              Location
            </p>
            <p className="mt-1">{application.location}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
              Occupation
            </p>
            <p className="mt-1">{application.occupation ?? "Not shared"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
              Referral source
            </p>
            <p className="mt-1">{application.referralSource ?? "Not shared"}</p>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
              Favourite genres
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {application.favouriteGenres.map((genre) => (
                <span
                  key={genre}
                  className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700"
                >
                  {genre}
                </span>
              ))}
            </div>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
              Favourite books
            </p>
            <p className="mt-1 whitespace-pre-line">
              {application.favouriteBooks ?? "Not shared"}
            </p>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
              Reading interests
            </p>
            <p className="mt-1 whitespace-pre-line">{application.readingInterests}</p>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
              Reason for joining
            </p>
            <p className="mt-1 whitespace-pre-line">{application.reasonForJoining}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
              Community rules
            </p>
            <p className="mt-1">
              {application.acceptedCommunityRules ? "Accepted" : "Not accepted"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
              Privacy consent
            </p>
            <p className="mt-1">
              {application.acceptedPrivacyPolicy ? "Accepted" : "Not accepted"}
            </p>
          </div>
          {application.reviewedAt ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                Last reviewed
              </p>
              <p className="mt-1">{formatDateTime(application.reviewedAt)}</p>
            </div>
          ) : null}
          {application.reviewedBy ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                Reviewer
              </p>
              <p className="mt-1">{application.reviewedBy.name}</p>
            </div>
          ) : null}
          {application.welcomePost ? (
            <div className="md:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                Welcome post
              </p>
              <p className="mt-1">
                Created {formatDateTime(application.welcomePost.createdAt)}
              </p>
            </div>
          ) : null}
        </div>
      </details>

      <form action={updateApplicationReviewNotesAction} className="mt-4 space-y-3">
        <input type="hidden" name="applicationId" value={application.id} />
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <div className="space-y-2">
          <Label htmlFor={`review-notes-${application.id}`}>
            Internal review notes
          </Label>
          <Textarea
            id={`review-notes-${application.id}`}
            name="reviewNotes"
            rows={4}
            defaultValue={application.reviewNotes ?? ""}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            variant="outline"
            className="h-10 gap-2 rounded-lg border-stone-200 bg-white px-3 text-stone-700 hover:bg-stone-50"
          >
            <Save className="size-4" />
            Save notes
          </Button>
          <Button
            type="submit"
            formAction={markApplicationUnderReviewAction}
            disabled={!canMarkUnderReview}
            variant="outline"
            className="h-10 gap-2 rounded-lg border-stone-200 bg-white px-3 text-stone-700 hover:bg-stone-50"
          >
            <Clock3 className="size-4" />
            Under review
          </Button>
          <Button
            type="submit"
            formAction={approveApplicationAction}
            disabled={!canApprove}
            className="h-10 gap-2 rounded-lg bg-stone-900 px-3 text-stone-50 hover:bg-stone-800"
          >
            <CheckCircle2 className="size-4" />
            Approve
          </Button>
          <Button
            type="submit"
            formAction={waitlistApplicationAction}
            disabled={!canWaitlist || isFinal}
            variant="outline"
            className="h-10 gap-2 rounded-lg border-amber-200 bg-amber-50 px-3 text-amber-900 hover:bg-amber-100"
          >
            <ListFilter className="size-4" />
            Waitlist
          </Button>
          <Button
            type="submit"
            formAction={rejectApplicationAction}
            disabled={!canReject}
            className="h-10 gap-2 rounded-lg bg-rose-700 px-3 text-white hover:bg-rose-800"
          >
            <XCircle className="size-4" />
            Reject
          </Button>
        </div>
      </form>
    </article>
  );
}

export default async function ApplicationsPage({
  searchParams,
}: ApplicationsPageProps) {
  const user = await requireSessionUser();
  const params = await searchParams;
  const status = parseApplicationStatusFilter(params.status);
  const data = await getApplicationReviewPageData(user.id, status);

  if (!canModerateClub(user, data.viewerMembership)) {
    redirect("/dashboard?error=Application+review+access+required");
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm sm:p-6">
        <SectionHeading
          eyebrow="Applications"
          title="Membership review queue"
          description={`Showing up to ${APPLICATION_REVIEW_LIMIT} applications, newest submissions first.`}
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
          {applicationStatusFilterValues.map((value) => (
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
              {formatMembershipApplicationStatus(value)}
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        {data.applications.length > 0 ? (
          data.applications.map((application) => (
            <ApplicationDetail
              key={application.id}
              application={application}
              redirectTo={filterHref(status)}
            />
          ))
        ) : (
          <EmptyState
            title="No applications found"
            description="Applications that match the current filter will appear here."
          />
        )}
      </section>

      <section className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">
        <div className="flex items-start gap-2">
          <FileText className="mt-0.5 size-4 shrink-0 text-stone-500" />
          <p>
            Review notes are internal to this queue and are not shown on the
            applicant status page.
          </p>
        </div>
      </section>
    </div>
  );
}
