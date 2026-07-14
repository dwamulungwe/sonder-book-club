import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  MessageSquareWarning,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { MemberAvatar } from "@/components/app/member-avatar";
import { SectionHeading } from "@/components/app/section-heading";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  getCommunityModerationData,
  MODERATION_REPORT_LIMIT,
} from "@/features/community/queries";
import { reviewContentReportAction } from "@/features/community/actions";
import { formatDateTime } from "@/lib/formatters";
import { canModerateClub } from "@/lib/permissions";
import { requireSessionUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Community Moderation",
};

type ModerationData = Awaited<ReturnType<typeof getCommunityModerationData>>;
type ReportItem = ModerationData["reports"][number];

function reportTargetLabel(report: ReportItem) {
  if (report.postId) {
    return "Post";
  }

  if (report.commentId) {
    return "Comment";
  }

  return "Unknown target";
}

function reportTargetBody(report: ReportItem) {
  if (report.post) {
    return report.post.body || "Post has no body text.";
  }

  if (report.comment) {
    return report.comment.body;
  }

  return "The reported content is no longer available.";
}

function reportTargetAuthor(report: ReportItem) {
  return report.post?.author ?? report.comment?.author ?? null;
}

function ReportCard({ report }: { report: ReportItem }) {
  const author = reportTargetAuthor(report);

  return (
    <Card className="border-zinc-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg text-zinc-950">
          <MessageSquareWarning className="size-4 text-amber-700" />
          {reportTargetLabel(report)} report
          <StatusBadge tone={report.status === "OPEN" ? "amber" : "sky"}>
            {report.status.toLowerCase()}
          </StatusBadge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-[1fr_0.8fr]">
          <div className="rounded-xl border border-stone-200 bg-[rgba(255,251,244,0.75)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
              Reported content
            </p>
            {author ? (
              <div className="mt-3 flex items-center gap-3">
                <MemberAvatar
                  name={author.name}
                  imageUrl={author.profile?.profileImageUrl}
                  size="sm"
                />
                <div>
                  <p className="text-sm font-semibold text-stone-950">
                    {author.name}
                  </p>
                  <p className="text-xs text-stone-500">
                    {report.post?.createdAt
                      ? formatDateTime(report.post.createdAt)
                      : report.comment?.createdAt
                        ? formatDateTime(report.comment.createdAt)
                        : "Timestamp unavailable"}
                  </p>
                </div>
              </div>
            ) : null}
            <p className="mt-4 whitespace-pre-line text-sm leading-6 text-stone-700">
              {reportTargetBody(report)}
            </p>
            {report.post?.relatedBook ? (
              <p className="mt-3 text-xs text-stone-500">
                Related book: {report.post.relatedBook.title}
              </p>
            ) : null}
            {report.post?.deletedAt || report.comment?.deletedAt ? (
              <p className="mt-3 text-xs font-medium text-rose-700">
                This content has already been removed from the normal feed.
              </p>
            ) : null}
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
              Report details
            </p>
            <div className="mt-3 flex items-center gap-3">
              <MemberAvatar
                name={report.reporter.name}
                imageUrl={report.reporter.profile?.profileImageUrl}
                size="sm"
              />
              <div>
                <p className="text-sm font-semibold text-stone-950">
                  {report.reporter.name}
                </p>
                <p className="text-xs text-stone-500">
                  {formatDateTime(report.createdAt)}
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm font-medium text-stone-900">
              {report.reason}
            </p>
            {report.details ? (
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-stone-600">
                {report.details}
              </p>
            ) : (
              <p className="mt-2 text-sm text-stone-500">
                No additional details were provided.
              </p>
            )}
          </div>
        </div>

        <form
          action={reviewContentReportAction}
          className="grid gap-3 rounded-xl border border-stone-200 bg-white p-4 md:grid-cols-[220px_1fr_auto]"
        >
          <input type="hidden" name="redirectTo" value="/community/moderation" />
          <input type="hidden" name="reportId" value={report.id} />
          <div className="space-y-2">
            <Label htmlFor={`status-${report.id}`}>Review status</Label>
            <select
              id={`status-${report.id}`}
              name="status"
              defaultValue={report.status === "OPEN" ? "REVIEWING" : report.status}
              className="flex h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
            >
              <option value="REVIEWING">reviewing</option>
              <option value="RESOLVED">resolved</option>
              <option value="DISMISSED">dismissed</option>
            </select>
          </div>
          <label className="flex min-h-10 items-center gap-2 self-end rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">
            <input
              type="checkbox"
              name="deleteReportedContent"
              className="size-4 accent-rose-700"
            />
            <Trash2 className="size-4" />
            Remove reported content
          </label>
          <button
            type="submit"
            className="inline-flex min-h-10 items-center justify-center gap-2 self-end rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-stone-300"
          >
            <ShieldCheck className="size-4" />
            Save review
          </button>
        </form>
      </CardContent>
    </Card>
  );
}

export default async function CommunityModerationPage() {
  const user = await requireSessionUser();
  const data = await getCommunityModerationData(user.id);

  if (!canModerateClub(user, data.viewerMembership)) {
    redirect("/community?error=Moderator+access+required");
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm sm:p-6">
        <SectionHeading
          eyebrow="Community"
          title="Moderation queue"
          description="Review open community reports, preserve the audit trail, and soft-remove content when the room needs care."
          action={
            <Link
              href="/community"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-stone-300 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-stone-200"
            >
              Back to feed
            </Link>
          }
        />
      </section>

      <section className="space-y-4">
        <p className="text-sm text-stone-600">
          Showing up to {MODERATION_REPORT_LIMIT} open or reviewing reports.
        </p>
        {data.reports.length > 0 ? (
          data.reports.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))
        ) : (
          <Card className="border-zinc-200 bg-white shadow-sm">
            <CardContent className="py-8 text-center text-sm text-stone-600">
              No open community reports.
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
