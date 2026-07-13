import type { Metadata } from "next";
import Link from "next/link";
import {
  BookOpenText,
  CalendarDays,
  MessageCircle,
  Vote,
} from "lucide-react";

import { BrandLogo } from "@/components/app/brand-logo";
import { EmptyState } from "@/components/app/empty-state";
import { MemberAvatar } from "@/components/app/member-avatar";
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
  title: "Home",
};

const quickActions = [
  {
    href: "/community",
    label: "Club updates",
    description: "See what members are sharing in the community feed.",
    icon: MessageCircle,
  },
  {
    href: "/reading-plan",
    label: "Reading progress",
    description: "Check the active plan and keep your current milestone moving.",
    icon: BookOpenText,
  },
  {
    href: "/voting",
    label: "Nominations & voting",
    description: "See the next-book conversation and add your vote when polls open.",
    icon: Vote,
  },
  {
    href: "/meetings",
    label: "Meetings",
    description: "Find the next gathering, agenda, and RSVP details.",
    icon: CalendarDays,
  },
] as const;

function progressTone(state: ReturnType<typeof getProgressState>) {
  if (state === "completed") {
    return "emerald" as const;
  }

  if (state === "behind") {
    return "amber" as const;
  }

  return "sky" as const;
}

function getFirstName(name?: string | null) {
  const trimmedName = name?.trim();

  if (!trimmedName) {
    return "member";
  }

  return trimmedName.split(/\s+/)[0];
}

function formatPostType(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

export default async function DashboardPage() {
  const user = await requireSessionUser();
  const data = await getDashboardData(user.id);
  const canParticipate = canParticipateInClub(user, data.viewerMembership);
  const firstName = getFirstName(user.name);

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm sm:p-6">
        <SectionHeading
          eyebrow="Home"
          title="Community home"
          description={`Welcome back, ${firstName}. Here is what the Sonder community is reading, deciding, and gathering around today.`}
          action={
            <div className="hidden rounded-[1.25rem] border border-stone-200 bg-[rgba(255,251,244,0.85)] p-3 md:block">
              <BrandLogo className="w-16" />
            </div>
          }
        />
        <p className="mt-4 max-w-3xl text-sm leading-6 text-stone-600">
          Start with the live club touchpoints, then keep scrolling for the
          reading plan, meeting, and announcement snapshot that already keeps
          {data.club.name} coordinated.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {quickActions.map((action) => {
          const Icon = action.icon;

          return (
            <Link
              key={action.href}
              href={action.href}
              className="group min-h-36 rounded-[1.35rem] border border-stone-200 bg-[rgba(255,251,244,0.92)] p-4 shadow-[0_12px_30px_rgba(64,43,27,0.06)] transition-colors hover:border-stone-300 hover:bg-white sm:p-5"
            >
              <div className="flex h-full flex-col justify-between gap-5">
                <span className="inline-flex size-10 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700 transition-colors group-hover:border-stone-300 group-hover:text-stone-950">
                  <Icon className="size-4" />
                </span>
                <span className="space-y-2">
                  <span className="block text-sm font-semibold text-stone-950">
                    {action.label}
                  </span>
                  <span className="block text-sm leading-6 text-stone-600">
                    {action.description}
                  </span>
                </span>
              </div>
            </Link>
          );
        })}
      </section>

      {!canParticipate ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm">
          You can browse the club as a guest, but only members can RSVP, log reading progress, and vote.
        </section>
      ) : null}

      <section className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading
            eyebrow="Community"
            title="Recent from the feed"
            description="A few live notes from the shared room before the rest of the club snapshot."
          />
          <Link
            href="/community"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-stone-300 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-stone-200"
          >
            Open feed
          </Link>
        </div>
        {data.recentCommunityPosts.length > 0 ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {data.recentCommunityPosts.map((post) => (
              <Link
                key={post.id}
                href="/community"
                className="rounded-xl border border-stone-200 bg-[rgba(255,251,244,0.72)] p-4 transition-colors hover:border-stone-300 hover:bg-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-stone-200"
              >
                <div className="flex items-center gap-3">
                  <MemberAvatar
                    name={post.author.name}
                    imageUrl={post.author.profile?.profileImageUrl}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-stone-950">
                      {post.author.name}
                    </p>
                    <p className="text-xs capitalize text-stone-500">
                      {formatPostType(post.postType)}
                    </p>
                  </div>
                </div>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-stone-700">
                  {post.body ||
                    post.listeningTitle ||
                    post.relatedBook?.title ||
                    "A new community update is waiting in the feed."}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-5">
            <EmptyState
              title="No community posts yet"
              description="New member reflections and recommendations will appear here once the feed starts moving."
            />
          </div>
        )}
      </section>

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
