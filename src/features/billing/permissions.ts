import { db } from "@/lib/db";
import { redirectWithNotice } from "@/lib/navigation";
import { canManageBilling } from "@/lib/permissions";
import { requireMembershipContext } from "@/lib/session";

export async function requireBillingAdmin(redirectTo: string) {
  const { user } = await requireMembershipContext();
  const activeUser = await db.user.findUnique({
    where: {
      id: user.id,
    },
    select: {
      id: true,
      systemRole: true,
      deletedAt: true,
      membership: {
        select: {
          role: true,
          status: true,
        },
      },
    },
  });

  if (
    !activeUser ||
    activeUser.deletedAt ||
    !canManageBilling(activeUser, activeUser.membership)
  ) {
    redirectWithNotice(
      redirectTo,
      "error",
      "Active admin access is required for billing.",
    );
  }

  return {
    user: {
      id: activeUser.id,
      systemRole: activeUser.systemRole,
    },
    membership: activeUser.membership,
  };
}
