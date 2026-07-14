import { MembershipStatus } from "@prisma/client";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { getClubShellData } from "@/features/club/queries";
import { requireMembershipContext } from "@/lib/session";

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [{ user, membership }, club] = await Promise.all([
    requireMembershipContext(),
    getClubShellData(),
  ]);

  if (membership?.status !== MembershipStatus.ACTIVE) {
    redirect("/application-status");
  }

  return (
    <AppShell club={club} user={{ ...user, membership }}>
      {children}
    </AppShell>
  );
}
