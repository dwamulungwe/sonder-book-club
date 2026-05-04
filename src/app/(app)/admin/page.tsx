import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SectionHeading } from "@/components/app/section-heading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  updateClubSettingsAction,
  updateMembershipAction,
} from "@/features/admin/actions";
import { getAdminPageData } from "@/features/club/queries";
import {
  formatMembershipStatus,
  formatRole,
} from "@/lib/formatters";
import { canManageClub } from "@/lib/permissions";
import { requireSessionUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Admin",
};

export default async function AdminPage() {
  const user = await requireSessionUser();
  const data = await getAdminPageData(user.id);

  if (!canManageClub(user, data.viewerMembership)) {
    redirect("/dashboard?error=Admin+access+required");
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm sm:p-6">
        <SectionHeading
          eyebrow="Admin"
          title="Club settings and access"
          description="Manage the single-club profile, contact details, and member access from one dependable control point."
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr] lg:gap-6">
        <Card className="border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-zinc-950">Club profile</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={updateClubSettingsAction} className="space-y-4">
              <input type="hidden" name="redirectTo" value="/admin" />
              <div className="space-y-2">
                <Label htmlFor="club-name">Club name</Label>
                <Input id="club-name" name="name" defaultValue={data.club.name} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="club-description">Description</Label>
                <Textarea
                  id="club-description"
                  name="description"
                  rows={4}
                  defaultValue={data.club.description ?? ""}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="meeting-frequency">Meeting frequency</Label>
                  <Input
                    id="meeting-frequency"
                    name="meetingFrequency"
                    defaultValue={data.club.meetingFrequency ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="club-location">Location</Label>
                  <Input
                    id="club-location"
                    name="location"
                    defaultValue={data.club.location ?? ""}
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="contact-email">Contact email</Label>
                  <Input
                    id="contact-email"
                    name="contactEmail"
                    type="email"
                    defaultValue={data.club.contactEmail ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact-phone">Contact phone</Label>
                  <Input
                    id="contact-phone"
                    name="contactPhone"
                    defaultValue={data.club.contactPhone ?? ""}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="logo-url">Logo URL</Label>
                <Input
                  id="logo-url"
                  name="logoUrl"
                  type="url"
                  defaultValue={data.club.logoUrl ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="banner-url">Banner URL</Label>
                <Input
                  id="banner-url"
                  name="bannerUrl"
                  type="url"
                  defaultValue={data.club.bannerUrl ?? ""}
                />
              </div>
              <button
                type="submit"
                className="min-h-11 w-full rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-800 sm:w-auto"
              >
                Save settings
              </button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-zinc-950">Member access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.memberships.map((membership) => (
              <form
                key={membership.id}
                action={updateMembershipAction}
                className="grid gap-3 rounded-lg border border-zinc-200 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_160px_160px_auto]"
              >
                <input type="hidden" name="membershipId" value={membership.id} />
                <input type="hidden" name="redirectTo" value="/admin" />
                <div>
                  <p className="font-medium text-zinc-900">
                    {membership.user.name}
                  </p>
                  <p className="break-all text-xs text-zinc-500">
                    {membership.user.email}
                  </p>
                  <p className="mt-2 text-xs text-zinc-400">
                    Current: {formatRole(membership.role)} /{" "}
                    {formatMembershipStatus(membership.status)}
                  </p>
                </div>
                <select
                  name="role"
                  defaultValue={membership.role}
                  className="flex h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                >
                  <option value="ADMIN">admin</option>
                  <option value="MODERATOR">moderator</option>
                  <option value="MEMBER">member</option>
                  <option value="GUEST">guest</option>
                </select>
                <select
                  name="status"
                  defaultValue={membership.status}
                  className="flex h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                >
                  <option value="ACTIVE">active</option>
                  <option value="SUSPENDED">suspended</option>
                  <option value="LEFT">left</option>
                </select>
                <button
                  type="submit"
                  className="min-h-11 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 sm:col-span-2 xl:col-span-1"
                >
                  Save
                </button>
              </form>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
