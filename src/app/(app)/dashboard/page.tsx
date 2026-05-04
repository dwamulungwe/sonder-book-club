import type { Metadata } from "next";

import { BrandLogo } from "@/components/app/brand-logo";
import { EmptyState } from "@/components/app/empty-state";
import { ProgressBar } from "@/components/app/progress-bar";
import { SectionHeading } from "@/components/app/section-heading";
import { StatusBadge } from "@/components/app/status-badge";
import { SummaryCard } from "@/components/app/summary-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardData } from "@/features/club/queries";
import { formatDate, formatDateTime } from "@/lib/formatters";
import { canParticipateInClub } from "@/lib/permissions";
import { getProgressState } from "@/lib/progress";
import { requireSessionUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Dashboard",
};

function progressTone(state: ReturnType<typeof getProgressState>) {
  if (state === "completed") {
    return "emerald" as const;
  }

  if (state === "behind") {
    return "amber" as const;
  }

  return "sky" as const;
}

export default async function DashboardPage() {
  const user = await requireSessionUser();
  const data = await getDashboardData(user.id);
  const canParticipate = canParticipateInClub(user, data.viewerMembership);

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm sm:p-6">
        <SectionHeading
          eyebrow="Dashboard"
          title={`Welcome back to ${data.club.name}`}
          description={
            data.club.description ??
            "Track today's read, the next discussion, and the pulse of the club from one dependable overview."
          }
          action={
            <div className="hidden rounded-[1.25rem] border border-stone-200 bg-[rgba(255,251,244,0.85)] p-3 md:block">
              <BrandLogo className="w-16" />
            </div>
          }
        />
      </section>

      {!canParticipate ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm">
          You can browse the club as a guest, but only members can RSVP, log reading progress, and vote.
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Members"
          value={data.memberCount}
          helper="Active people in the club"
        />
        <SummaryCard
          label="Open polls"
          value={data.openPollCount}
          helper="Votes or drafts currently in motion"
        />
        <SummaryCard
          label="Targets completed"
          value={data.progressSummary.completed}
          helper="Your completed milestones in the active plan"
        />
        <SummaryCard
          label="On track"
          value={data.progressSummary.onTrack}
          helper="Targets still pacing well this cycle"
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr] lg:gap-6">
        <Card className="border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-zinc-950">Current book</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.currentBook ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge tone="emerald">current</StatusBadge>
                  {data.currentBook.genre ? (
                    <StatusBadge>{data.currentBook.genre}</StatusBadge>
                  ) : null}
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-zinc-950 sm:text-2xl">
                    {data.currentBook.title}
                  </h3>
                  <p className="mt-1 text-sm text-zinc-600">
                    {data.currentBook.author}
                  </p>
                </div>
                <p className="text-sm leading-6 text-zinc-600">
                  {data.currentBook.summary ??
                    "No summary has been added for this title yet."}
                </p>
                {data.currentBook.pageCount ? (
                  <p className="text-xs uppercase tracking-[0.12em] text-zinc-400">
                    {data.currentBook.pageCount} pages
                  </p>
                ) : null}
              </>
            ) : (
              <EmptyState
                title="No current book selected"
                description="Mark a title as current to spotlight it here."
              />
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-zinc-950">Next meeting</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.nextMeeting ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge tone="sky">scheduled</StatusBadge>
                  <p className="text-sm text-zinc-600">
                    {data.nextMeeting.rsvps.length} RSVPs so far
                  </p>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-zinc-950">
                    {data.nextMeeting.title}
                  </h3>
                  <p className="mt-1 text-sm text-zinc-600">
                    {formatDateTime(data.nextMeeting.startsAt)}
                  </p>
                </div>
                <p className="text-sm text-zinc-600">
                  {data.nextMeeting.location ??
                    data.nextMeeting.meetingLink ??
                    "Location will be shared by the club team."}
                </p>
                <p className="text-sm leading-6 text-zinc-600">
                  {data.nextMeeting.agenda ?? "Agenda to follow."}
                </p>
              </>
            ) : (
              <EmptyState
                title="No meeting scheduled"
                description="Your upcoming discussion will show here as soon as it is added."
              />
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr] lg:gap-6">
        <Card className="border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-zinc-950">
              Active reading plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.activePlan ? (
              <>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-zinc-900">
                    {data.activePlan.title}
                  </p>
                  <p className="text-sm text-zinc-600">
                    {data.activePlan.book.title} by {data.activePlan.book.author}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {formatDate(data.activePlan.startsOn)} to{" "}
                    {formatDate(data.activePlan.endsOn)}
                  </p>
                </div>
                <div className="space-y-4">
                  {data.activePlan.targets.map((target) => {
                    const progress = target.progresses[0];
                    const state = getProgressState(target.endsOn, progress);

                    return (
                      <div key={target.id} className="space-y-2 rounded-lg border border-zinc-200 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-medium text-zinc-900">
                              {target.label}
                            </p>
                            <p className="text-xs text-zinc-500">
                              Ends {formatDate(target.endsOn)}
                            </p>
                          </div>
                          <StatusBadge tone={progressTone(state)}>
                            {state.replace("_", " ")}
                          </StatusBadge>
                        </div>
                        <ProgressBar value={progress?.percent ?? 0} />
                        <div className="flex flex-col gap-1 text-xs text-zinc-500 sm:flex-row sm:items-start sm:justify-between">
                          <span>{progress?.percent ?? 0}% logged</span>
                          <span className="sm:max-w-[60%] sm:text-right">
                            {progress?.notes ?? "No note yet"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <EmptyState
                title="No active plan"
                description="Create a reading plan to break the current title into manageable targets."
              />
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-zinc-950">
              Recent announcements
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.recentAnnouncements.length > 0 ? (
              data.recentAnnouncements.map((announcement) => (
                <div
                  key={announcement.id}
                  className="border-b border-zinc-100 pb-4 last:border-b-0 last:pb-0"
                >
                  <p className="text-sm font-medium text-zinc-900">
                    {announcement.title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    {announcement.body}
                  </p>
                  <p className="mt-2 text-xs text-zinc-500">
                    {announcement.createdBy.name} on{" "}
                    {formatDate(announcement.createdAt)}
                  </p>
                </div>
              ))
            ) : (
              <EmptyState
                title="No announcements yet"
                description="Club updates from admins and moderators will show here."
              />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
