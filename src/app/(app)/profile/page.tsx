import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BookOpenText,
  Headphones,
  MapPin,
  PenLine,
} from "lucide-react";

import { MemberAvatar } from "@/components/app/member-avatar";
import { SectionHeading } from "@/components/app/section-heading";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getProfilePageData } from "@/features/club/queries";
import { updateMyProfileAction } from "@/features/profiles/actions";
import {
  formatDate,
  formatMembershipStatus,
  formatRole,
} from "@/lib/formatters";
import { requireSessionUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "My Profile",
};

function displayValue(value?: string | null) {
  return value?.trim() || "Not shared yet";
}

function DetailBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-[rgba(255,251,244,0.65)] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
        {label}
      </p>
      <div className="mt-2 text-sm leading-6 text-stone-700">{children}</div>
    </div>
  );
}

function GenreList({ genres }: { genres: string[] }) {
  if (genres.length === 0) {
    return <span>Not shared yet</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {genres.map((genre) => (
        <span
          key={genre}
          className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700"
        >
          {genre}
        </span>
      ))}
    </div>
  );
}

export default async function ProfilePage() {
  const sessionUser = await requireSessionUser();
  const data = await getProfilePageData(sessionUser.id);

  if (!data.profileUser) {
    redirect("/login");
  }

  const { profileUser } = data;
  const { membership, profile } = profileUser;
  const favouriteGenres = profile?.favouriteGenres ?? [];
  const profileLocation = profile?.location;
  const listeningTitle = profile?.currentlyListeningTitle;
  const listeningCreator = profile?.currentlyListeningCreator;
  const listeningUrl = profile?.currentlyListeningUrl;
  const listeningText =
    listeningTitle && listeningCreator
      ? `${listeningTitle} by ${listeningCreator}`
      : listeningTitle || listeningCreator;

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <MemberAvatar
              name={profileUser.name}
              imageUrl={profile?.profileImageUrl}
              size="lg"
            />
            <SectionHeading
              eyebrow="My Profile"
              title={profileUser.name}
              description="Your member card for the Sonder community: what you read, where your taste wanders, and what you are carrying into the next conversation."
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {membership ? (
              <>
                <StatusBadge tone="sky">{formatRole(membership.role)}</StatusBadge>
                <StatusBadge>
                  {formatMembershipStatus(membership.status)}
                </StatusBadge>
              </>
            ) : (
              <StatusBadge tone="amber">membership pending</StatusBadge>
            )}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3 text-sm text-stone-600">
          {membership ? (
            <span>Joined {formatDate(membership.joinedAt)}</span>
          ) : (
            <span>Join date not available</span>
          )}
          {profileLocation ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4" />
              {profileLocation}
            </span>
          ) : null}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr] lg:gap-6">
        <Card className="border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-zinc-950">
              <PenLine className="size-4 text-stone-500" />
              Member notes
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <DetailBlock label="Biography">
              {displayValue(profile?.bio)}
            </DetailBlock>
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailBlock label="Location">
                {displayValue(profile?.location)}
              </DetailBlock>
              <DetailBlock label="Occupation">
                {displayValue(profile?.occupation)}
              </DetailBlock>
            </div>
            <DetailBlock label="Favourite genres">
              <GenreList genres={favouriteGenres} />
            </DetailBlock>
            <DetailBlock label="Favourite books">
              {displayValue(profile?.favouriteBooks)}
            </DetailBlock>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-zinc-950">
              <BookOpenText className="size-4 text-stone-500" />
              Reading life
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <DetailBlock label="Reading interests">
              {displayValue(profile?.readingInterests)}
            </DetailBlock>
            <DetailBlock label="Currently reading">
              {displayValue(profile?.currentlyReadingText)}
            </DetailBlock>
            <DetailBlock label="Currently listening">
              <div className="space-y-2">
                <p>{displayValue(listeningText)}</p>
                {listeningUrl ? (
                  <Link
                    href={listeningUrl}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-950 underline-offset-4 hover:underline"
                  >
                    <Headphones className="size-4" />
                    Open listening link
                  </Link>
                ) : null}
              </div>
            </DetailBlock>
          </CardContent>
        </Card>
      </section>

      <Card className="border-zinc-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-zinc-950">Edit profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateMyProfileAction} className="space-y-4">
            <input type="hidden" name="redirectTo" value="/profile" />
            <div className="space-y-2">
              <Label htmlFor="profile-image-url">Profile image URL</Label>
              <Input
                id="profile-image-url"
                name="profileImageUrl"
                type="url"
                defaultValue={profile?.profileImageUrl ?? ""}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-bio">Biography</Label>
              <Textarea
                id="profile-bio"
                name="bio"
                rows={5}
                defaultValue={profile?.bio ?? ""}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="profile-phone">Phone number</Label>
                <Input
                  id="profile-phone"
                  name="phoneNumber"
                  defaultValue={profile?.phoneNumber ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-location">Location</Label>
                <Input
                  id="profile-location"
                  name="location"
                  defaultValue={profile?.location ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-occupation">Occupation</Label>
                <Input
                  id="profile-occupation"
                  name="occupation"
                  defaultValue={profile?.occupation ?? ""}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-genres">Favourite genres</Label>
              <Input
                id="profile-genres"
                name="favouriteGenres"
                defaultValue={favouriteGenres.join(", ")}
                placeholder="Literary fiction, memoir, poetry"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="profile-books">Favourite books</Label>
                <Textarea
                  id="profile-books"
                  name="favouriteBooks"
                  rows={4}
                  defaultValue={profile?.favouriteBooks ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-interests">Reading interests</Label>
                <Textarea
                  id="profile-interests"
                  name="readingInterests"
                  rows={4}
                  defaultValue={profile?.readingInterests ?? ""}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-currently-reading">
                Currently reading
              </Label>
              <Input
                id="profile-currently-reading"
                name="currentlyReadingText"
                defaultValue={profile?.currentlyReadingText ?? ""}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="profile-listening-title">
                  Currently listening title
                </Label>
                <Input
                  id="profile-listening-title"
                  name="currentlyListeningTitle"
                  defaultValue={profile?.currentlyListeningTitle ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-listening-creator">
                  Creator
                </Label>
                <Input
                  id="profile-listening-creator"
                  name="currentlyListeningCreator"
                  defaultValue={profile?.currentlyListeningCreator ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-listening-url">Listening URL</Label>
                <Input
                  id="profile-listening-url"
                  name="currentlyListeningUrl"
                  type="url"
                  defaultValue={profile?.currentlyListeningUrl ?? ""}
                  placeholder="https://..."
                />
              </div>
            </div>
            <button
              type="submit"
              className="min-h-11 w-full rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-800 sm:w-auto"
            >
              Save profile
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
