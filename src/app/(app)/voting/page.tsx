import type { Metadata } from "next";

import { PollStatus } from "@prisma/client";

import { EmptyState } from "@/components/app/empty-state";
import { SectionHeading } from "@/components/app/section-heading";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getVotingPageData } from "@/features/club/queries";
import {
  castVoteAction,
  closePollAction,
  createNominationAction,
  createPollAction,
} from "@/features/voting/actions";
import {
  formatDateTime,
  formatPollStatus,
} from "@/lib/formatters";
import {
  canModerateClub,
  canParticipateInClub,
} from "@/lib/permissions";
import { requireSessionUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Voting",
};

function pollTone(status: PollStatus) {
  if (status === PollStatus.OPEN) {
    return "emerald" as const;
  }

  if (status === PollStatus.CLOSED) {
    return "rose" as const;
  }

  return "sky" as const;
}

export default async function VotingPage() {
  const user = await requireSessionUser();
  const data = await getVotingPageData(user.id);
  const canModerate = canModerateClub(user, data.viewerMembership);
  const canParticipate = canParticipateInClub(user, data.viewerMembership);

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm sm:p-6">
        <SectionHeading
          eyebrow="Voting"
          title="Nominate the next read"
          description="Gather nominations, turn them into a clean shortlist, and lock the next pick once the vote closes."
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr] lg:gap-6">
        <div className="space-y-6">
          {canParticipate ? (
            <Card className="border-zinc-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg text-zinc-950">Nominate a book</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={createNominationAction} className="space-y-4">
                  <input type="hidden" name="redirectTo" value="/voting" />
                  <div className="space-y-2">
                    <Label htmlFor="nomination-book">Book</Label>
                    <select
                      id="nomination-book"
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
                  <div className="space-y-2">
                    <Label htmlFor="nomination-reason">Reason</Label>
                    <Textarea id="nomination-reason" name="reason" rows={4} />
                  </div>
                  <button
                    type="submit"
                    className="min-h-11 w-full rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 sm:w-auto"
                  >
                    Submit nomination
                  </button>
                </form>
              </CardContent>
            </Card>
          ) : null}

          {canModerate ? (
            <Card className="border-zinc-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg text-zinc-950">Create poll</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={createPollAction} className="space-y-4">
                  <input type="hidden" name="redirectTo" value="/voting" />
                  <div className="space-y-2">
                    <Label htmlFor="poll-title">Title</Label>
                    <Input id="poll-title" name="title" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="poll-description">Description</Label>
                    <Textarea id="poll-description" name="description" rows={3} />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="opens-on">Opens on</Label>
                      <Input id="opens-on" name="opensOn" type="date" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="opens-at">Opens at</Label>
                      <Input id="opens-at" name="opensAt" type="time" required />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="closes-on">Closes on</Label>
                      <Input id="closes-on" name="closesOn" type="date" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="closes-at">Closes at</Label>
                      <Input id="closes-at" name="closesAt" type="time" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Nominations</Label>
                    <div className="space-y-2 rounded-lg border border-zinc-200 p-4">
                      {data.nominations.length > 0 ? (
                        data.nominations.map((nomination) => (
                          <label
                            key={nomination.id}
                            className="flex items-start gap-3 text-sm text-zinc-700"
                          >
                            <input
                              type="checkbox"
                              name="nominationIds"
                              value={nomination.id}
                              className="mt-1"
                            />
                            <span>
                              <span className="font-medium text-zinc-900">
                                {nomination.book.title}
                              </span>
                              <span className="block text-xs text-zinc-500">
                                Nominated by {nomination.nominator.name}
                              </span>
                            </span>
                          </label>
                        ))
                      ) : (
                        <p className="text-sm text-zinc-600">
                          Add nominations before opening a poll.
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="min-h-11 w-full rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-800 sm:w-auto"
                  >
                    Create poll
                  </button>
                </form>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          {data.polls.length > 0 ? (
            data.polls.map((poll) => {
              const currentVote =
                poll.votes.find((vote) => vote.voterId === user.id) ?? null;

              return (
                <Card key={poll.id} className="border-zinc-200 bg-white shadow-sm">
                  <CardContent className="space-y-4 pt-6">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-xl font-semibold text-zinc-950">
                        {poll.title}
                      </h3>
                      <StatusBadge tone={pollTone(poll.status)}>
                        {formatPollStatus(poll.status)}
                      </StatusBadge>
                    </div>
                    <p className="text-sm text-zinc-600">
                      Opens {formatDateTime(poll.opensAt)} and closes{" "}
                      {formatDateTime(poll.closesAt)}
                    </p>
                    <p className="text-sm leading-6 text-zinc-600">
                      {poll.description ?? "No extra poll description has been added."}
                    </p>

                    <div className="space-y-3">
                      {poll.options.map((option) => {
                        const isSelected = currentVote?.optionId === option.id;

                        return (
                          <div key={option.id} className="rounded-lg border border-zinc-200 p-4">
                            <div className="flex flex-wrap items-center gap-3">
                              <p className="font-medium text-zinc-900">
                                {option.book.title}
                              </p>
                              <StatusBadge tone={isSelected ? "emerald" : "neutral"}>
                                {option.votes.length} votes
                              </StatusBadge>
                              {poll.status === PollStatus.CLOSED &&
                              poll.winningBookId === option.bookId ? (
                                <StatusBadge tone="emerald">winner</StatusBadge>
                              ) : null}
                            </div>
                            {canParticipate && poll.status !== PollStatus.CLOSED ? (
                              <form action={castVoteAction} className="mt-3">
                                <input type="hidden" name="pollId" value={poll.id} />
                                <input type="hidden" name="optionId" value={option.id} />
                                <input type="hidden" name="redirectTo" value="/voting" />
                                <button
                                  type="submit"
                                  className="min-h-11 w-full rounded-lg bg-zinc-950 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 sm:w-auto sm:text-xs"
                                >
                                  {isSelected ? "Update vote" : "Vote for this book"}
                                </button>
                              </form>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>

                    {canModerate && poll.status !== PollStatus.CLOSED ? (
                      <form action={closePollAction}>
                        <input type="hidden" name="pollId" value={poll.id} />
                        <input type="hidden" name="redirectTo" value="/voting" />
                        <button
                          type="submit"
                          className="min-h-11 w-full rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 sm:w-auto"
                        >
                          Close poll
                        </button>
                      </form>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <EmptyState
              title="No polls yet"
              description="Once the shortlist is ready, create a poll and let the club vote."
            />
          )}
        </div>
      </section>
    </div>
  );
}
