import { NotificationType } from "@prisma/client";

import { sanitizeInternalHref } from "@/features/notifications/links";
import { db } from "@/lib/db";

export const NOTIFICATION_PAGE_LIMIT = 30;
export const APPLICATION_NOTIFICATION_LIMIT = 8;
export const UNREAD_NOTIFICATION_COUNT_LIMIT = 100;

export const applicationNotificationTypes = [
  NotificationType.APPLICATION_SUBMITTED,
  NotificationType.APPLICATION_UNDER_REVIEW,
  NotificationType.APPLICATION_APPROVED,
  NotificationType.APPLICATION_REJECTED,
  NotificationType.APPLICATION_WAITLISTED,
] as const;

export const defaultNotificationPreferences = {
  inAppCommunityActivity: true,
  inAppAnnouncements: true,
  inAppApplicationUpdates: true,
  emailCommunityActivity: false,
  emailAnnouncements: false,
  emailApplicationUpdates: true,
  emailMeetingUpdates: false,
};

export function formatUnreadCount(count: number) {
  return count >= UNREAD_NOTIFICATION_COUNT_LIMIT ? "99+" : String(count);
}

export async function getUnreadNotificationCount(userId: string) {
  const unreadNotifications = await db.notification.findMany({
    where: {
      recipientId: userId,
      readAt: null,
    },
    select: {
      id: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: UNREAD_NOTIFICATION_COUNT_LIMIT,
  });

  return unreadNotifications.length;
}

export async function getNotificationsPageData(userId: string) {
  const notifications = await db.notification.findMany({
    where: {
      recipientId: userId,
    },
    select: {
      id: true,
      type: true,
      title: true,
      message: true,
      href: true,
      readAt: true,
      createdAt: true,
      actor: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: NOTIFICATION_PAGE_LIMIT,
  });

  return {
    notifications: notifications.map((notification) => ({
      ...notification,
      href: sanitizeInternalHref(notification.href),
    })),
    limit: NOTIFICATION_PAGE_LIMIT,
  };
}

export async function getApplicationStatusNotifications(userId: string) {
  const notifications = await db.notification.findMany({
    where: {
      recipientId: userId,
      type: {
        in: [...applicationNotificationTypes],
      },
    },
    select: {
      id: true,
      type: true,
      title: true,
      message: true,
      href: true,
      readAt: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: APPLICATION_NOTIFICATION_LIMIT,
  });

  return notifications.map((notification) => ({
    ...notification,
    href: sanitizeInternalHref(notification.href),
  }));
}

export async function getNotificationPreferences(userId: string) {
  const preferences = await db.notificationPreference.findUnique({
    where: {
      userId,
    },
  });

  return {
    ...defaultNotificationPreferences,
    ...preferences,
  };
}

export function notificationTypeLabel(type: NotificationType) {
  return type.toLowerCase().replaceAll("_", " ");
}
