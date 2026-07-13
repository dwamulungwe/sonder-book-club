import type { Metadata } from "next";
import {
  BookOpenText,
  MapPin,
} from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { MemberAvatar } from "@/components/app/member-avatar";
import { SectionHeading } from "@/components/app/section-heading";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getMembersPageData } from "@/features/club/queries";
import {
  formatDate,
  formatMembershipStatus,
  formatRole,
} from "@/lib/formatters";
import { requireSessionUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Members",
};

function membershipTone(status: string) {
  if (status === "ACTIVE") {
    return "emerald" as const;
  }

  if (status === "SUSPENDED") {
    return "amber" as const;
  }

  return "rose" as const;
}

function getExcerpt(value?: string | null, maxLength = 140) {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return null;
  }

  if (trimmedValue.length <= maxLength) {
    return trimmedValue;
  }

  return `${trimmedValue.slice(0, maxLength - 3).trimEnd()}...`;
}

function GenrePills({ genres }: { genres: string[] }) {
  if (genres.length === 0) {
    return null;
  }

  const visibleGenres = genres.slice(0, 3);
  const extraCount = genres.length - visibleGenres.length;

  return (
    <div className="flex flex-wrap gap-1.5">
      {visibleGenres.map((genre) => (
        <span
          key={genre}
          className="rounded-full border border-stone-200 bg-[rgba(255,251,244,0.9)] px-2 py-0.5 text-xs font-medium text-stone-700"
        >
          {genre}
        </span>
      ))}
      {extraCount > 0 ? (
        <span className="rounded-full border border-stone-200 bg-white px-2 py-0.5 text-xs font-medium text-stone-500">
          +{extraCount} more
        </span>
      ) : null}
    </div>
  );
}

export default async function MembersPage() {
  const user = await requireSessionUser();
  const data = await getMembersPageData(user.id);

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm sm:p-6">
        <SectionHeading
          eyebrow="Members"
          title="Everyone in the room"
          description="A clear roster of everyone reading with the club, their role, and when they joined."
        />
      </section>

      <Card className="border-zinc-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-zinc-950">Member directory</CardTitle>
        </CardHeader>
        <CardContent>
          {data.memberships.length > 0 ? (
            <>
              <div className="space-y-3 md:hidden">
                {data.memberships.map((membership) => (
                  <div
                    key={membership.id}
                    className="rounded-xl border border-zinc-200 p-4"
                  >
                    <div className="flex gap-3">
                      <MemberAvatar
                        name={membership.user.name}
                        imageUrl={membership.user.profile?.profileImageUrl}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-900">
                          {membership.user.name}
                        </p>
                        <p className="mt-1 break-all text-sm text-zinc-500">
                          {membership.user.email}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2 text-sm text-zinc-600">
                      {membership.user.profile?.location ? (
                        <p className="flex items-center gap-1.5">
                          <MapPin className="size-4 shrink-0 text-stone-400" />
                          {membership.user.profile?.location}
                        </p>
                      ) : null}
                      {membership.user.profile?.currentlyReadingText ? (
                        <p className="flex items-start gap-1.5">
                          <BookOpenText className="mt-0.5 size-4 shrink-0 text-stone-400" />
                          <span>
                            {membership.user.profile?.currentlyReadingText}
                          </span>
                        </p>
                      ) : null}
                      <GenrePills
                        genres={membership.user.profile?.favouriteGenres ?? []}
                      />
                      {getExcerpt(membership.user.profile?.bio) ? (
                        <p className="leading-6">
                          {getExcerpt(membership.user.profile?.bio)}
                        </p>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <StatusBadge tone="sky">
                        {formatRole(membership.role)}
                      </StatusBadge>
                      <StatusBadge tone={membershipTone(membership.status)}>
                        {formatMembershipStatus(membership.status)}
                      </StatusBadge>
                    </div>
                    <p className="mt-3 text-xs text-zinc-500">
                      Joined {formatDate(membership.joinedAt)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Profile</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Joined</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.memberships.map((membership) => (
                      <TableRow key={membership.id}>
                        <TableCell className="whitespace-normal">
                          <div className="flex items-center gap-3">
                            <MemberAvatar
                              name={membership.user.name}
                              imageUrl={membership.user.profile?.profileImageUrl}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <p className="font-medium text-zinc-900">
                                {membership.user.name}
                              </p>
                              <p className="break-all text-xs text-zinc-500">
                                {membership.user.email}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-sm whitespace-normal">
                          <div className="space-y-2 text-sm text-zinc-600">
                            {membership.user.profile?.location ? (
                              <p className="flex items-center gap-1.5">
                                <MapPin className="size-4 shrink-0 text-stone-400" />
                                {membership.user.profile?.location}
                              </p>
                            ) : null}
                            {membership.user.profile?.currentlyReadingText ? (
                              <p className="flex items-start gap-1.5">
                                <BookOpenText className="mt-0.5 size-4 shrink-0 text-stone-400" />
                                <span>
                                  {membership.user.profile?.currentlyReadingText}
                                </span>
                              </p>
                            ) : null}
                            <GenrePills
                              genres={
                                membership.user.profile?.favouriteGenres ?? []
                              }
                            />
                            {getExcerpt(membership.user.profile?.bio, 110) ? (
                              <p className="leading-6">
                                {getExcerpt(membership.user.profile?.bio, 110)}
                              </p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone="sky">
                            {formatRole(membership.role)}
                          </StatusBadge>
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={membershipTone(membership.status)}>
                            {formatMembershipStatus(membership.status)}
                          </StatusBadge>
                        </TableCell>
                        <TableCell>{formatDate(membership.joinedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <EmptyState
              title="No members yet"
              description="People will appear here as soon as they join the club."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
