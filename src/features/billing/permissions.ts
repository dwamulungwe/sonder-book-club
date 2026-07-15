import { db } from "@/lib/db";
import { redirectWithNotice } from "@/lib/navigation";
import { canManageBilling } from "@/lib/permissions";
import { requireMembershipContext } from "@/lib/session";

export async function requireBillingAdmin(redirectTo: string) {
  const { user, membership } = await requireMembershipContext();
  const activeUser = await db.user.findUnique({
    where: {
      id: user.id,
    },
    select: {
      deletedAt: true,
    },
  });

  if (
    !activeUser ||
    activeUser.deletedAt ||
    !canManageBilling(user, membership)
  ) {
    redirectWithNotice(
      redirectTo,
      "error",
      "Active admin access is required for billing.",
    );
  }

  return { user, membership };
}
