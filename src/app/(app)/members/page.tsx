import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
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
                    <p className="font-medium text-zinc-900">
                      {membership.user.name}
                    </p>
                    <p className="mt-1 break-all text-sm text-zinc-500">
                      {membership.user.email}
                    </p>
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
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Joined</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.memberships.map((membership) => (
                      <TableRow key={membership.id}>
                        <TableCell className="whitespace-normal">
                          <div>
                            <p className="font-medium text-zinc-900">
                              {membership.user.name}
                            </p>
                            <p className="text-xs text-zinc-500">
                              {membership.user.email}
                            </p>
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
