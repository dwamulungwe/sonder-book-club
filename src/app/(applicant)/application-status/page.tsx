import type { Metadata } from "next";
import Link from "next/link";
import { Bell, Check } from "lucide-react";
import { MembershipApplicationStatus, MembershipStatus } from "@prisma/client";

import { BrandLogo } from "@/components/app/brand-logo";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { getMyApplicationStatusData } from "@/features/applications/queries";
import { logoutAction } from "@/features/auth/actions";
import { markApplicationNotificationReadAction } from "@/features/notifications/actions";
import {
  APPLICATION_NOTIFICATION_LIMIT,
  getApplicationStatusNotifications,
  notificationTypeLabel,
} from "@/features/notifications/queries";
import { APP_LOGO_PATH, APP_NAME } from "@/lib/brand";
import {
  formatDateTime,
  formatMembershipApplicationStatus,
} from "@/lib/formatters";
import { requireSessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Application Status",
};

const statusCopy: Record<
  MembershipApplicationStatus,
  { title: string; body: string; tone?: "amber" | "sky" | "emerald" | "rose" }
> = {
  DRAFT: {
    title: "Your application is not submitted yet",
    body: "Your application is still a draft. Submit a completed application when you are ready for review.",
    tone: "amber",
  },
  SUBMITTED: {
    title: "Your application has been received",
    body: "Thank you for applying. The Sonder team will review your application with care.",
    tone: "sky",
  },
  UNDER_REVIEW: {
    title: "Your application is under review",
    body: "A reviewer is reading through your application. You can check back here for the latest decision.",
    tone: "amber",
  },
  APPROVED: {
    title: "Welcome to Sonder",
    body: "Your membership has been approved. You can complete your profile and join the community conversation.",
    tone: "emerald",
  },
  REJECTED: {
    title: "Your application has been reviewed",
    body: "Sonder is not able to offer membership at this time. Thank you for taking the time to apply.",
    tone: "rose",
  },
  WAITLISTED: {
    title: "You are on the waitlist",
    body: "Your application is still active, and the team will revisit it as space opens.",
    tone: "amber",
  },
};

export default async function ApplicationStatusPage() {
  const sessionUser = await requireSessionUser();
  const data = await getMyApplicationStatusData(sessionUser.id);
  const application = data.application;
  const isActiveMember =
    data.user?.membership?.status === MembershipStatus.ACTIVE;
  const applicationNotifications = isActiveMember
    ? []
    : await getApplicationStatusNotifications(sessionUser.id);
  const status = application?.status;
  const copy = status ? statusCopy[status] : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(188,157,116,0.14),_transparent_36%),linear-gradient(180deg,#f8f2e8_0%,#f0e6d8_100%)] px-4 py-8 sm:py-12">
      <section className="w-full max-w-2xl rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm sm:p-7">
        <div className="w-24">
          <BrandLogo src={APP_LOGO_PATH} priority className="w-full" />
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">
          {APP_NAME}
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl text-stone-950">Application status</h1>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Signed in as {data.user?.name ?? sessionUser.email ?? "applicant"}.
            </p>
          </div>
          {status ? (
            <StatusBadge tone={copy?.tone}>
              {formatMembershipApplicationStatus(status)}
            </StatusBadge>
          ) : null}
        </div>

        <div className="mt-6 rounded-xl border border-stone-200 bg-[rgba(255,251,244,0.75)] p-5">
          {copy ? (
            <>
              <h2 className="text-xl font-semibold text-stone-950">
                {copy.title}
              </h2>
              <p className="mt-3 text-sm leading-6 text-stone-700">
                {copy.body}
              </p>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-stone-950">
                No application found
              </h2>
              <p className="mt-3 text-sm leading-6 text-stone-700">
                This account does not have a membership application attached to
                it. If you are already a member, continue to the club workspace.
              </p>
            </>
          )}
        </div>

        {!isActiveMember ? (
          <div className="mt-6 rounded-xl border border-stone-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-900">
                <Bell className="size-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-stone-950">
                  Application updates
                </h2>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  Showing up to {APPLICATION_NOTIFICATION_LIMIT} recent
                  application-status notifications for this account.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {applicationNotifications.length > 0 ? (
                applicationNotifications.map((notification) => {
                  const isUnread = !notification.readAt;

                  return (
                    <article
                      key={notification.id}
                      className={cn(
                        "rounded-xl border p-3",
                        isUnread
                          ? "border-amber-200 bg-amber-50/80"
                          : "border-stone-200 bg-stone-50",
                      )}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-stone-950">
                              {notification.title}
                            </p>
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em]",
                                isUnread
                                  ? "bg-amber-100 text-amber-900"
                                  : "bg-stone-200 text-stone-600",
                              )}
                            >
                              {isUnread ? "Unread" : "Read"}
                            </span>
                          </div>
                          <p className="mt-1 text-sm leading-6 text-stone-700">
                            {notification.message}
                          </p>
                          <p className="mt-1 text-xs capitalize text-stone-500">
                            {notificationTypeLabel(notification.type)} -{" "}
                            {formatDateTime(notification.createdAt)}
                          </p>
                        </div>
                        {isUnread ? (
                          <form action={markApplicationNotificationReadAction}>
                            <input
                              type="hidden"
                              name="notificationId"
                              value={notification.id}
                            />
                            <input
                              type="hidden"
                              name="redirectTo"
                              value="/application-status"
                            />
                            <button
                              type="submit"
                              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-800"
                            >
                              <Check className="size-4" />
                              Mark read
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </article>
                  );
                })
              ) : (
                <p className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm leading-6 text-stone-600">
                  Application updates from Sonder will appear here.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-stone-200 bg-white p-4 text-sm leading-6 text-stone-600">
            You can now view all of your notifications from the member
            workspace.
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {status === MembershipApplicationStatus.APPROVED || isActiveMember ? (
            <>
              <Link
                href="/profile"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-800"
              >
                Complete profile
              </Link>
              <Link
                href="/community"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
              >
                Visit Community
              </Link>
            </>
          ) : null}
          <form action={logoutAction}>
            <Button
              type="submit"
              variant="outline"
              className="h-11 rounded-xl border-stone-200 bg-white px-4 text-stone-700 hover:bg-stone-50"
            >
              Sign out
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
