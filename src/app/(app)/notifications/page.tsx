import type { Metadata } from "next";
import Link from "next/link";
import { Bell, Check, CheckCheck } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { SectionHeading } from "@/components/app/section-heading";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/features/notifications/actions";
import {
  getNotificationsPageData,
  NOTIFICATION_PAGE_LIMIT,
  notificationTypeLabel,
} from "@/features/notifications/queries";
import { formatDateTime } from "@/lib/formatters";
import { requireSessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Notifications",
};

export default async function NotificationsPage() {
  const user = await requireSessionUser();
  const data = await getNotificationsPageData(user.id);
  const hasUnread = data.notifications.some((notification) => !notification.readAt);

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm sm:p-6">
        <SectionHeading
          eyebrow="Notifications"
          title="What needs your attention"
          description={`Showing up to ${NOTIFICATION_PAGE_LIMIT} recent notifications for your account.`}
          action={
            <form action={markAllNotificationsReadAction}>
              <input type="hidden" name="redirectTo" value="/notifications" />
              <button
                type="submit"
                disabled={!hasUnread}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCheck className="size-4" />
                Mark all read
              </button>
            </form>
          }
        />
      </section>

      <section className="space-y-3">
        {data.notifications.length > 0 ? (
          data.notifications.map((notification) => {
            const isUnread = !notification.readAt;

            return (
              <article
                key={notification.id}
                className={cn(
                  "rounded-[1rem] border p-4 shadow-sm sm:p-5",
                  isUnread
                    ? "border-amber-200 bg-amber-50/80"
                    : "border-stone-200 bg-white",
                )}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex size-9 items-center justify-center rounded-full border",
                          isUnread
                            ? "border-amber-300 bg-white text-amber-900"
                            : "border-stone-200 bg-stone-50 text-stone-500",
                        )}
                      >
                        <Bell className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-stone-950">
                          {notification.title}
                        </p>
                        <p className="text-xs capitalize text-stone-500">
                          {notificationTypeLabel(notification.type)}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm leading-6 text-stone-700">
                      {notification.message}
                    </p>
                    <p className="text-xs text-stone-500">
                      {formatDateTime(notification.createdAt)}
                      {notification.actor?.name ? ` by ${notification.actor.name}` : ""}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {notification.href ? (
                      <Link
                        href={notification.href}
                        className="inline-flex min-h-10 items-center justify-center rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
                      >
                        Open
                      </Link>
                    ) : null}
                    {isUnread ? (
                      <form action={markNotificationReadAction}>
                        <input
                          type="hidden"
                          name="notificationId"
                          value={notification.id}
                        />
                        <input
                          type="hidden"
                          name="redirectTo"
                          value="/notifications"
                        />
                        <button
                          type="submit"
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-800"
                        >
                          <Check className="size-4" />
                          Mark read
                        </button>
                      </form>
                    ) : (
                      <span className="inline-flex min-h-10 items-center rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-500">
                        Read
                      </span>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <EmptyState
            title="No notifications yet"
            description="Application updates, community activity, announcements, and meeting changes will appear here."
          />
        )}
      </section>
    </div>
  );
}
