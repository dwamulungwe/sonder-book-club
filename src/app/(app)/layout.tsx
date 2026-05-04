import { AppShell } from "@/components/app/app-shell";
import { getClubShellData } from "@/features/club/queries";
import { requireSessionUser } from "@/lib/session";

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [user, club] = await Promise.all([
    requireSessionUser(),
    getClubShellData(),
  ]);

  return (
    <AppShell club={club} user={user}>
      {children}
    </AppShell>
  );
}
