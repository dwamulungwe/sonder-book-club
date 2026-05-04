"use server";

import { TargetMode } from "@prisma/client";

import {
  progressSchema,
  readingPlanSchema,
} from "@/features/reading-plans/schemas";
import { addDays } from "@/lib/date";
import { db } from "@/lib/db";
import { getInt, getOptionalString, getString } from "@/lib/form-data";
import { redirectWithNotice, resolveReturnPath } from "@/lib/navigation";
import {
  canModerateClub,
  canParticipateInClub,
} from "@/lib/permissions";
import { requireMembershipContext, requireSessionUser } from "@/lib/session";

export async function createReadingPlanAction(formData: FormData) {
  const bookId = getString(formData, "bookId");
  const redirectTo = resolveReturnPath(formData, "/reading-plan");
  const { user, membership } = await requireMembershipContext();

  if (!canModerateClub(user, membership)) {
    redirectWithNotice(
      redirectTo,
      "error",
      "You do not have permission to create reading plans.",
    );
  }

  const parsed = readingPlanSchema.safeParse({
    title: getString(formData, "title"),
    targetMode: getString(formData, "targetMode"),
    weekCount: getInt(formData, "weekCount"),
    chapterCount: getInt(formData, "chapterCount"),
    startsOn: getString(formData, "startsOn"),
  });

  if (!parsed.success) {
    redirectWithNotice(
      redirectTo,
      "error",
      parsed.error.issues[0]?.message ?? "Unable to create the reading plan.",
    );
  }

  const book = await db.book.findUnique({
    where: { id: bookId },
  });

  if (!book) {
    redirectWithNotice(
      redirectTo,
      "error",
      "Select a valid book before creating a plan.",
    );
  }

  if (parsed.data.targetMode === "PAGES" && !book.pageCount) {
    redirectWithNotice(
      redirectTo,
      "error",
      "Page-based plans need a page count on the book.",
    );
  }

  if (
    parsed.data.targetMode === "CHAPTERS" &&
    !parsed.data.chapterCount
  ) {
    redirectWithNotice(
      redirectTo,
      "error",
      "Chapter-based plans need a chapter count.",
    );
  }

  const startsOn = new Date(`${parsed.data.startsOn}T00:00:00`);
  const endsOn = addDays(startsOn, parsed.data.weekCount * 7 - 1);

  const targets = Array.from({ length: parsed.data.weekCount }, (_, index) => {
    const targetStartsOn = addDays(startsOn, index * 7);
    const targetEndsOn = addDays(targetStartsOn, 6);

    if (parsed.data.targetMode === "PAGES") {
      const pageCount = book.pageCount ?? 0;
      const startPage =
        Math.floor((index * pageCount) / parsed.data.weekCount) + 1;
      const endPage =
        index === parsed.data.weekCount - 1
          ? pageCount
          : Math.floor(
              ((index + 1) * pageCount) / parsed.data.weekCount,
            );

      return {
        sequence: index + 1,
        label: `Week ${index + 1}: pages ${startPage}-${endPage}`,
        mode: TargetMode.PAGES,
        startPage,
        endPage,
        startsOn: targetStartsOn,
        endsOn: targetEndsOn,
      };
    }

    const chapterCount = parsed.data.chapterCount ?? 0;
    const startChapter =
      Math.floor((index * chapterCount) / parsed.data.weekCount) + 1;
    const endChapter =
      index === parsed.data.weekCount - 1
        ? chapterCount
        : Math.floor(
            ((index + 1) * chapterCount) / parsed.data.weekCount,
          );

    return {
      sequence: index + 1,
      label: `Week ${index + 1}: chapters ${startChapter}-${endChapter}`,
      mode: TargetMode.CHAPTERS,
      startChapter,
      endChapter,
      startsOn: targetStartsOn,
      endsOn: targetEndsOn,
    };
  });

  await db.readingPlan.create({
    data: {
      bookId,
      createdById: user.id,
      title: parsed.data.title,
      targetMode: parsed.data.targetMode as TargetMode,
      weekCount: parsed.data.weekCount,
      chapterCount: parsed.data.chapterCount,
      startsOn,
      endsOn,
      targets: {
        create: targets,
      },
    },
  });

  redirectWithNotice(
    redirectTo,
    "success",
    "Reading plan created.",
  );
}

export async function updateReadingProgressAction(formData: FormData) {
  const targetId = getString(formData, "targetId");
  const redirectTo = resolveReturnPath(formData, "/reading-plan");
  const user = await requireSessionUser();
  const { membership } = await requireMembershipContext();
  const parsed = progressSchema.safeParse({
    percent: getInt(formData, "percent"),
    notes: getOptionalString(formData, "notes"),
  });

  if (!parsed.success) {
    redirectWithNotice(
      redirectTo,
      "error",
      parsed.error.issues[0]?.message ?? "Unable to update progress.",
    );
  }

  const target = await db.readingTarget.findUnique({
    where: { id: targetId },
  });

  if (!target) {
    redirectWithNotice(redirectTo, "error", "Reading target not found.");
  }

  if (!canParticipateInClub(user, membership)) {
    redirectWithNotice(
      redirectTo,
      "error",
      "You do not have access to update this target.",
    );
  }

  await db.readingProgress.upsert({
    where: {
      targetId_memberId: {
        targetId,
        memberId: user.id,
      },
    },
    update: {
      percent: parsed.data.percent,
      notes: parsed.data.notes,
      completedAt:
        parsed.data.percent >= 100 ? new Date() : null,
    },
    create: {
      targetId,
      memberId: user.id,
      percent: parsed.data.percent,
      notes: parsed.data.notes,
      completedAt:
        parsed.data.percent >= 100 ? new Date() : null,
    },
  });

  redirectWithNotice(
    redirectTo,
    "success",
    "Progress updated.",
  );
}
