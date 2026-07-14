import { redirectWithNotice } from "@/lib/navigation";
import { canAdministerEmailOutbox } from "@/lib/permissions";
import { requireMembershipContext } from "@/lib/session";

export async function requireEmailOutboxAdmin(redirectTo: string) {
  const { user, membership } = await requireMembershipContext();

  if (!canAdministerEmailOutbox(user, membership)) {
    redirectWithNotice(
      redirectTo,
      "error",
      "Active admin access is required for the email outbox.",
    );
  }

  return { user, membership };
}
