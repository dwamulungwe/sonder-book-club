"use server";

import { revalidatePath } from "next/cache";

import { applicationNotificationTypes } from "@/features/notifications/queries";
import { db } from "@/lib/db";
import { getCheckbox, getString } from "@/lib/form-data";
import { redirectWithNotice, resolveReturnPath } from "@/lib/navigation";
import { requireSessionUser } from "@/lib/session";

export async function markNotificationReadAction(formData: FormData) {
  const user = await requireSessionUser();
  const notificationId = getString(formData, "notificationId");
  const redirectTo = resolveReturnPath(formData, "/notifications");

  await db.notification.updateMany({
    where: {
      id: notificationId,
      recipientId: user.id,
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });

  revalidatePath("/notifications");
  redirectWithNotice(redirectTo, "success", "Notification marked as read.");
}

export async function markApplicationNotificationReadAction(formData: FormData) {
  const user = await requireSessionUser();
  const notificationId = getString(formData, "notificationId");
  const redirectTo = resolveReturnPath(formData, "/application-status");

  await db.notification.updateMany({
    where: {
      id: notificationId,
      recipientId: user.id,
      type: {
        in: [...applicationNotificationTypes],
      },
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });

  revalidatePath("/application-status");
  redirectWithNotice(redirectTo, "success", "Notification marked as read.");
}

export async function markAllNotificationsReadAction(formData: FormData) {
  const user = await requireSessionUser();
  const redirectTo = resolveReturnPath(formData, "/notifications");

  await db.notification.updateMany({
    where: {
      recipientId: user.id,
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });

  revalidatePath("/notifications");
  redirectWithNotice(redirectTo, "success", "Notifications marked as read.");
}

export async function updateNotificationPreferencesAction(formData: FormData) {
  const user = await requireSessionUser();
  const redirectTo = resolveReturnPath(formData, "/settings/notifications");

  await db.notificationPreference.upsert({
    where: {
      userId: user.id,
    },
    create: {
      userId: user.id,
      inAppCommunityActivity: getCheckbox(formData, "inAppCommunityActivity"),
      inAppAnnouncements: getCheckbox(formData, "inAppAnnouncements"),
      inAppApplicationUpdates: true,
      emailCommunityActivity: getCheckbox(formData, "emailCommunityActivity"),
      emailAnnouncements: getCheckbox(formData, "emailAnnouncements"),
      emailApplicationUpdates: true,
      emailMeetingUpdates: getCheckbox(formData, "emailMeetingUpdates"),
    },
    update: {
      inAppCommunityActivity: getCheckbox(formData, "inAppCommunityActivity"),
      inAppAnnouncements: getCheckbox(formData, "inAppAnnouncements"),
      inAppApplicationUpdates: true,
      emailCommunityActivity: getCheckbox(formData, "emailCommunityActivity"),
      emailAnnouncements: getCheckbox(formData, "emailAnnouncements"),
      emailApplicationUpdates: true,
      emailMeetingUpdates: getCheckbox(formData, "emailMeetingUpdates"),
    },
  });

  revalidatePath("/settings/notifications");
  redirectWithNotice(redirectTo, "success", "Notification settings updated.");
}
