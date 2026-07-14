import type { Metadata } from "next";
import { Bell, Mail, ShieldCheck } from "lucide-react";

import { SectionHeading } from "@/components/app/section-heading";
import { updateNotificationPreferencesAction } from "@/features/notifications/actions";
import { getNotificationPreferences } from "@/features/notifications/queries";
import { requireSessionUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Notification Settings",
};

function ToggleRow({
  id,
  name,
  title,
  description,
  defaultChecked,
  disabled = false,
}: {
  id: string;
  name: string;
  title: string;
  description: string;
  defaultChecked: boolean;
  disabled?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white p-4"
    >
      <input
        id={id}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="mt-1 size-4 rounded border-stone-300 text-stone-900"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-stone-950">{title}</span>
        <span className="mt-1 block text-sm leading-6 text-stone-600">
          {description}
        </span>
      </span>
    </label>
  );
}

export default async function NotificationSettingsPage() {
  const user = await requireSessionUser();
  const preferences = await getNotificationPreferences(user.id);

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm sm:p-6">
        <SectionHeading
          eyebrow="Settings"
          title="Notification preferences"
          description="Choose which optional activity appears in Sonder and which optional updates can be queued for email."
        />
      </section>

      <form action={updateNotificationPreferencesAction} className="space-y-5">
        <input
          type="hidden"
          name="redirectTo"
          value="/settings/notifications"
        />

        <section className="rounded-[1rem] border border-stone-200 bg-stone-50/70 p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2 text-stone-900">
            <Bell className="size-4 text-amber-800" />
            <h2 className="text-lg font-semibold">In-app</h2>
          </div>
          <div className="grid gap-3">
            <ToggleRow
              id="in-app-community"
              name="inAppCommunityActivity"
              title="Community activity"
              description="Comments, replies, and reactions related to your posts and comments."
              defaultChecked={preferences.inAppCommunityActivity}
            />
            <ToggleRow
              id="in-app-announcements"
              name="inAppAnnouncements"
              title="Announcements"
              description="New club announcements from the Sonder team."
              defaultChecked={preferences.inAppAnnouncements}
            />
            <ToggleRow
              id="in-app-applications"
              name="inAppApplicationUpdatesLocked"
              title="Application status"
              description="Membership decisions and application-status updates stay enabled."
              defaultChecked
              disabled
            />
            <ToggleRow
              id="in-app-billing"
              name="inAppBillingUpdatesLocked"
              title="Billing"
              description="Invoices, payment confirmations, and billing-status updates stay enabled."
              defaultChecked={preferences.inAppBillingUpdates}
              disabled
            />
          </div>
        </section>

        <section className="rounded-[1rem] border border-stone-200 bg-stone-50/70 p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2 text-stone-900">
            <Mail className="size-4 text-amber-800" />
            <h2 className="text-lg font-semibold">Email outbox</h2>
          </div>
          <div className="grid gap-3">
            <ToggleRow
              id="email-community"
              name="emailCommunityActivity"
              title="Community activity"
              description="Optional email jobs for comments and replies. Reaction emails stay off by default."
              defaultChecked={preferences.emailCommunityActivity}
            />
            <ToggleRow
              id="email-announcements"
              name="emailAnnouncements"
              title="Announcements"
              description="Optional email jobs for new announcements."
              defaultChecked={preferences.emailAnnouncements}
            />
            <ToggleRow
              id="email-meetings"
              name="emailMeetingUpdates"
              title="Meeting updates"
              description="Optional email jobs when meetings are materially created or updated."
              defaultChecked={preferences.emailMeetingUpdates}
            />
            <ToggleRow
              id="email-applications"
              name="emailApplicationUpdatesLocked"
              title="Application status"
              description="Application decisions are transactional and remain enabled."
              defaultChecked
              disabled
            />
            <ToggleRow
              id="email-billing"
              name="emailBillingUpdatesLocked"
              title="Billing"
              description="Billing email jobs are transactional and remain enabled."
              defaultChecked={preferences.emailBillingUpdates}
              disabled
            />
          </div>
        </section>

        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <p>
              Email delivery is queued through the outbox foundation. No live
              third-party provider is configured in this slice.
            </p>
          </div>
        </section>

        <button
          type="submit"
          className="min-h-11 w-full rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-800 sm:w-auto"
        >
          Save preferences
        </button>
      </form>
    </div>
  );
}
