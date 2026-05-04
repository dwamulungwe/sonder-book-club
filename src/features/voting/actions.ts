"use server";

import { PollStatus } from "@prisma/client";

import {
  nominationSchema,
  pollSchema,
} from "@/features/voting/schemas";
import { combineDateAndTime } from "@/lib/date";
import { db } from "@/lib/db";
import { getOptionalString, getString, getStringArray } from "@/lib/form-data";
import { redirectWithNotice, resolveReturnPath } from "@/lib/navigation";
import {
  canModerateClub,
  canParticipateInClub,
} from "@/lib/permissions";
import { requireMembershipContext, requireSessionUser } from "@/lib/session";

async function calculateWinningBook(pollId: string) {
  const poll = await db.poll.findUnique({
    where: { id: pollId },
    include: {
      options: {
        include: {
          votes: true,
        },
      },
    },
  });

  if (!poll) {
    return null;
  }

  const winner = [...poll.options].sort(
    (left, right) => right.votes.length - left.votes.length,
  )[0];

  return winner?.bookId ?? null;
}

export async function createNominationAction(formData: FormData) {
  const bookId = getString(formData, "bookId");
  const redirectTo = resolveReturnPath(formData, "/voting");
  const { user, membership } = await requireMembershipContext();

  if (!canParticipateInClub(user, membership)) {
    redirectWithNotice(
      redirectTo,
      "error",
      "You do not have access to nominate books here.",
    );
  }

  const parsed = nominationSchema.safeParse({
    reason: getOptionalString(formData, "reason"),
  });

  if (!parsed.success) {
    redirectWithNotice(
      redirectTo,
      "error",
      parsed.error.issues[0]?.message ?? "Unable to submit the nomination.",
    );
  }

  await db.bookNomination.upsert({
    where: {
      bookId,
    },
    update: {
      reason: parsed.data.reason,
      nominatorId: user.id,
    },
    create: {
      bookId,
      nominatorId: user.id,
      reason: parsed.data.reason,
    },
  });

  redirectWithNotice(
    redirectTo,
    "success",
    "Book nominated for voting.",
  );
}

export async function createPollAction(formData: FormData) {
  const nominationIds = getStringArray(formData, "nominationIds");
  const redirectTo = resolveReturnPath(formData, "/voting");
  const { user, membership } = await requireMembershipContext();

  if (!canModerateClub(user, membership)) {
    redirectWithNotice(
      redirectTo,
      "error",
      "You do not have permission to create polls.",
    );
  }

  if (nominationIds.length < 2) {
    redirectWithNotice(
      redirectTo,
      "error",
      "Choose at least two nominations for a poll.",
    );
  }

  const parsed = pollSchema.safeParse({
    title: getString(formData, "title"),
    description: getOptionalString(formData, "description"),
    opensOn: getString(formData, "opensOn"),
    opensAt: getString(formData, "opensAt"),
    closesOn: getString(formData, "closesOn"),
    closesAt: getString(formData, "closesAt"),
  });

  if (!parsed.success) {
    redirectWithNotice(
      redirectTo,
      "error",
      parsed.error.issues[0]?.message ?? "Unable to create the poll.",
    );
  }

  const nominations = await db.bookNomination.findMany({
    where: {
      id: {
        in: nominationIds,
      },
    },
  });

  if (nominations.length !== nominationIds.length) {
    redirectWithNotice(
      redirectTo,
      "error",
      "One or more nominations no longer exist.",
    );
  }

  const opensAt = combineDateAndTime(parsed.data.opensOn, parsed.data.opensAt);
  const closesAt = combineDateAndTime(parsed.data.closesOn, parsed.data.closesAt);

  if (closesAt <= opensAt) {
    redirectWithNotice(
      redirectTo,
      "error",
      "Poll closing time must be after the opening time.",
    );
  }

  await db.poll.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      createdById: user.id,
      opensAt,
      closesAt,
      status: opensAt <= new Date() ? PollStatus.OPEN : PollStatus.DRAFT,
      options: {
        create: nominations.map((nomination) => ({
          nominationId: nomination.id,
          bookId: nomination.bookId,
        })),
      },
    },
  });

  redirectWithNotice(redirectTo, "success", "Poll created.");
}

export async function castVoteAction(formData: FormData) {
  const pollId = getString(formData, "pollId");
  const optionId = getString(formData, "optionId");
  const redirectTo = resolveReturnPath(formData, "/voting");
  const user = await requireSessionUser();
  const { membership } = await requireMembershipContext();
  const poll = await db.poll.findUnique({
    where: { id: pollId },
  });

  if (!poll) {
    redirectWithNotice(redirectTo, "error", "Poll not found.");
  }

  if (!canParticipateInClub(user, membership)) {
    redirectWithNotice(
      redirectTo,
      "error",
      "You do not have access to vote in this poll.",
    );
  }

  if (poll.status === PollStatus.CLOSED || poll.closesAt <= new Date()) {
    redirectWithNotice(
      redirectTo,
      "error",
      "This poll is closed.",
    );
  }

  const option = await db.pollOption.findFirst({
    where: {
      id: optionId,
      pollId,
    },
  });

  if (!option) {
    redirectWithNotice(redirectTo, "error", "Poll option not found.");
  }

  await db.pollVote.upsert({
    where: {
      pollId_voterId: {
        pollId,
        voterId: user.id,
      },
    },
    update: {
      optionId,
    },
    create: {
      pollId,
      optionId,
      voterId: user.id,
    },
  });

  redirectWithNotice(redirectTo, "success", "Vote recorded.");
}

export async function closePollAction(formData: FormData) {
  const pollId = getString(formData, "pollId");
  const redirectTo = resolveReturnPath(formData, "/voting");
  const { user, membership } = await requireMembershipContext();
  const poll = await db.poll.findUnique({
    where: { id: pollId },
  });

  if (!poll) {
    redirectWithNotice(redirectTo, "error", "Poll not found.");
  }

  if (!canModerateClub(user, membership)) {
    redirectWithNotice(
      redirectTo,
      "error",
      "You do not have permission to close polls.",
    );
  }

  const winningBookId = await calculateWinningBook(pollId);

  await db.poll.update({
    where: { id: pollId },
    data: {
      status: PollStatus.CLOSED,
      closedAt: new Date(),
      winningBookId,
    },
  });

  redirectWithNotice(
    redirectTo,
    "success",
    "Poll closed and winner locked in.",
  );
}
