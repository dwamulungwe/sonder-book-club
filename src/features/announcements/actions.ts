"use server";

import { announcementSchema } from "@/features/announcements/schemas";
import { notifyActiveMembersForAnnouncement } from "@/features/notifications/service";
import { db } from "@/lib/db";
import { getString } from "@/lib/form-data";
import { redirectWithNotice, resolveReturnPath } from "@/lib/navigation";
import { canModerateClub } from "@/lib/permissions";
import { requireMembershipContext } from "@/lib/session";

export async function createAnnouncementAction(formData: FormData) {
  const redirectTo = resolveReturnPath(formData, "/announcements");
  const { user, membership } = await requireMembershipContext();

  if (!canModerateClub(user, membership)) {
    redirectWithNotice(
      redirectTo,
      "error",
      "You do not have permission to post announcements.",
    );
  }

  const parsed = announcementSchema.safeParse({
    title: getString(formData, "title"),
    body: getString(formData, "body"),
  });

  if (!parsed.success) {
    redirectWithNotice(
      redirectTo,
      "error",
      parsed.error.issues[0]?.message ?? "Unable to post the announcement.",
    );
  }

  await db.$transaction(async (tx) => {
    const announcement = await tx.announcement.create({
      data: {
        createdById: user.id,
        title: parsed.data.title,
        body: parsed.data.body,
      },
      select: {
        id: true,
      },
    });

    await notifyActiveMembersForAnnouncement(tx, {
      announcementId: announcement.id,
      actorId: user.id,
      title: parsed.data.title,
      body: parsed.data.body,
    });
  });

  redirectWithNotice(
    redirectTo,
    "success",
    "Announcement published.",
  );
}
