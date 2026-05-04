import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { ProgressBar } from "@/components/app/progress-bar";
import { SectionHeading } from "@/components/app/section-heading";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getReadingPlansPageData } from "@/features/club/queries";
import {
  createReadingPlanAction,
  updateReadingProgressAction,
} from "@/features/reading-plans/actions";
import {
  formatDate,
  formatTargetMode,
} from "@/lib/formatters";
import {
  canModerateClub,
  canParticipateInClub,
} from "@/lib/permissions";
import { getProgressState } from "@/lib/progress";
import { requireSessionUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Reading Plan",
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

export default async function ReadingPlanPage() {
  const user = await requireSessionUser();
  const data = await getReadingPlansPageData(user.id);
  const canModerate = canModerateClub(user, data.viewerMembership);
  const canParticipate = canParticipateInClub(user, data.viewerMembership);

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm sm:p-6">
        <SectionHeading
          eyebrow="Reading Plan"
          title="Weekly targets and progress"
          description="Set a clear pace for the current book and give every member a quick way to log momentum."
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:gap-6">
        {canModerate ? (
          <Card className="border-zinc-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg text-zinc-950">
                Create a reading plan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createReadingPlanAction} className="space-y-4">
                <input type="hidden" name="redirectTo" value="/reading-plan" />
                <div className="space-y-2">
                  <Label htmlFor="plan-title">Plan title</Label>
                  <Input id="plan-title" name="title" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-book">Book</Label>
                  <select
                    id="plan-book"
                    name="bookId"
                    className="flex h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                  >
                    {data.books.map((book) => (
                      <option key={book.id} value={book.id}>
                        {book.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="plan-mode">Target mode</Label>
                    <select
                      id="plan-mode"
                      name="targetMode"
                      defaultValue="PAGES"
                      className="flex h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                    >
                      <option value="PAGES">pages</option>
                      <option value="CHAPTERS">chapters</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="plan-weeks">Weeks</Label>
                    <Input id="plan-weeks" name="weekCount" type="number" min="1" max="24" required />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="plan-chapters">Chapter count</Label>
                    <Input id="plan-chapters" name="chapterCount" type="number" min="1" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="plan-start">Starts on</Label>
                    <Input id="plan-start" name="startsOn" type="date" required />
                  </div>
                </div>
                <button
                  type="submit"
                  className="min-h-11 w-full rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-800 sm:w-auto"
                >
                  Create plan
                </button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-zinc-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg text-zinc-950">How this works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-zinc-600">
              <p>Moderators build the plan, and members log progress against each weekly target.</p>
              <p>Guests can review the pacing, but only participating members can update progress.</p>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {data.plans.length > 0 ? (
            data.plans.map((plan) => (
              <Card key={plan.id} className="border-zinc-200 bg-white shadow-sm">
                <CardContent className="space-y-4 pt-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-xl font-semibold text-zinc-950">
                          {plan.title}
                        </h3>
                        <StatusBadge tone={plan.isActive ? "emerald" : "neutral"}>
                          {plan.isActive ? "active" : "archived"}
                        </StatusBadge>
                        <StatusBadge>{formatTargetMode(plan.targetMode)}</StatusBadge>
                      </div>
                      <p className="text-sm text-zinc-600">
                        {plan.book.title} by {plan.book.author}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {formatDate(plan.startsOn)} to {formatDate(plan.endsOn)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {plan.targets.map((target) => {
                      const progress = target.progresses[0];
                      const state = getProgressState(target.endsOn, progress);

                      return (
                        <div key={target.id} className="rounded-lg border border-zinc-200 p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-3">
                                <p className="text-sm font-medium text-zinc-900">
                                  {target.label}
                                </p>
                                <StatusBadge tone={progressTone(state)}>
                                  {state.replace("_", " ")}
                                </StatusBadge>
                              </div>
                              <p className="text-xs text-zinc-500">
                                {formatDate(target.startsOn)} to {formatDate(target.endsOn)}
                              </p>
                            </div>
                            <div className="text-sm text-zinc-600 sm:min-w-[140px] sm:text-right">
                              {progress?.percent ?? 0}% complete
                            </div>
                          </div>

                          <div className="mt-3 space-y-3">
                            <ProgressBar value={progress?.percent ?? 0} />
                            {canParticipate ? (
                              <form action={updateReadingProgressAction} className="grid gap-3 md:grid-cols-[120px_minmax(0,1fr)] xl:grid-cols-[120px_minmax(0,1fr)_auto]">
                                <input type="hidden" name="targetId" value={target.id} />
                                <input type="hidden" name="redirectTo" value="/reading-plan" />
                                <Input
                                  name="percent"
                                  type="number"
                                  min="0"
                                  max="100"
                                  defaultValue={progress?.percent ?? 0}
                                />
                                <Textarea
                                  name="notes"
                                  rows={2}
                                  defaultValue={progress?.notes ?? ""}
                                  placeholder="Add a short note"
                                />
                                <button
                                  type="submit"
                                  className="min-h-11 w-full rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 md:w-auto xl:self-start"
                                >
                                  Save
                                </button>
                              </form>
                            ) : (
                              <p className="text-sm text-zinc-500">
                                {progress?.notes ?? "Members can add progress notes here."}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <EmptyState
              title="No reading plans yet"
              description="Create the first plan to guide the club through the current title."
            />
          )}
        </div>
      </section>
    </div>
  );
}
