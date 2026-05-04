import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { SectionHeading } from "@/components/app/section-heading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createAnnouncementAction } from "@/features/announcements/actions";
import { getAnnouncementsPageData } from "@/features/club/queries";
import { formatDate } from "@/lib/formatters";
import { canModerateClub } from "@/lib/permissions";
import { requireSessionUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Announcements",
};

export default async function AnnouncementsPage() {
  const user = await requireSessionUser();
  const data = await getAnnouncementsPageData(user.id);
  const canModerate = canModerateClub(user, data.viewerMembership);

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm sm:p-6">
        <SectionHeading
          eyebrow="Announcements"
          title="Club updates and reminders"
          description="Share schedule changes, reading prompts, and reminder notes in one dependable notice board."
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:gap-6">
        {canModerate ? (
          <Card className="border-zinc-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg text-zinc-950">Post announcement</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createAnnouncementAction} className="space-y-4">
                <input type="hidden" name="redirectTo" value="/announcements" />
                <div className="space-y-2">
                  <Label htmlFor="announcement-title">Title</Label>
                  <Input id="announcement-title" name="title" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="announcement-body">Message</Label>
                  <Textarea id="announcement-body" name="body" rows={6} required />
                </div>
                <button
                  type="submit"
                  className="min-h-11 w-full rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 sm:w-auto"
                >
                  Publish
                </button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-zinc-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg text-zinc-950">Latest updates</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-zinc-600">
              Announcements are the club&apos;s shared notice board for scheduling changes, reading prompts, and the small details everyone needs at the right time.
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {data.announcements.length > 0 ? (
            data.announcements.map((announcement) => (
              <Card key={announcement.id} className="border-zinc-200 bg-white shadow-sm">
                <CardContent className="space-y-3 pt-6">
                  <h3 className="text-lg font-semibold text-zinc-950">
                    {announcement.title}
                  </h3>
                  <p className="text-sm leading-6 text-zinc-600">
                    {announcement.body}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {announcement.createdBy.name} on {formatDate(announcement.createdAt)}
                  </p>
                </CardContent>
              </Card>
            ))
          ) : (
            <EmptyState
              title="No announcements yet"
              description="Announcements will appear here as soon as the club team posts them."
            />
          )}
        </div>
      </section>
    </div>
  );
}
