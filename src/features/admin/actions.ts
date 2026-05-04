"use server";

import {
  MembershipStatus,
  SystemRole,
} from "@prisma/client";

import {
  clubSettingsSchema,
  membershipUpdateSchema,
} from "@/features/admin/schemas";
import { CLUB_SETTINGS_ID } from "@/lib/club";
import { db } from "@/lib/db";
import { getOptionalString, getString } from "@/lib/form-data";
import { redirectWithNotice, resolveReturnPath } from "@/lib/navigation";
import { canManageClub } from "@/lib/permissions";
import { requireMembershipContext } from "@/lib/session";

async function requireAdminAccess(redirectTo: string) {
  const { user, membership } = await requireMembershipContext();

  if (!canManageClub(user, membership)) {
    redirectWithNotice(
      redirectTo,
      "error",
      "You do not have permission to manage club settings.",
    );
  }

  return { user };
}

export async function updateClubSettingsAction(formData: FormData) {
  const redirectTo = resolveReturnPath(formData, "/admin");
  await requireAdminAccess(redirectTo);
  const parsed = clubSettingsSchema.safeParse({
    name: getString(formData, "name"),
    description: getOptionalString(formData, "description"),
    meetingFrequency: getOptionalString(formData, "meetingFrequency"),
    location: getOptionalString(formData, "location"),
    contactEmail: getOptionalString(formData, "contactEmail"),
    contactPhone: getOptionalString(formData, "contactPhone"),
    logoUrl: getOptionalString(formData, "logoUrl"),
    bannerUrl: getOptionalString(formData, "bannerUrl"),
  });

  if (!parsed.success) {
    redirectWithNotice(
      redirectTo,
      "error",
      parsed.error.issues[0]?.message ?? "Unable to update club settings.",
    );
  }

  await db.clubSettings.upsert({
    where: {
      id: CLUB_SETTINGS_ID,
    },
    update: parsed.data,
    create: {
      id: CLUB_SETTINGS_ID,
      ...parsed.data,
    },
  });

  redirectWithNotice(redirectTo, "success", "Club settings updated.");
}

export async function updateMembershipAction(formData: FormData) {
  const membershipId = getString(formData, "membershipId");
  const redirectTo = resolveReturnPath(formData, "/admin");
  await requireAdminAccess(redirectTo);
  const parsed = membershipUpdateSchema.safeParse({
    role: getString(formData, "role"),
    status: getString(formData, "status"),
  });

  if (!parsed.success) {
    redirectWithNotice(
      redirectTo,
      "error",
      parsed.error.issues[0]?.message ?? "Unable to update the member.",
    );
  }

  const targetMembership = await db.membership.findUnique({
    where: {
      id: membershipId,
    },
  });

  if (!targetMembership) {
    redirectWithNotice(redirectTo, "error", "Member not found.");
  }

  const removingAdmin =
    targetMembership.role === SystemRole.ADMIN &&
    (parsed.data.role !== SystemRole.ADMIN ||
      parsed.data.status !== MembershipStatus.ACTIVE);

  if (removingAdmin) {
    const adminCount = await db.membership.count({
      where: {
        role: SystemRole.ADMIN,
        status: MembershipStatus.ACTIVE,
      },
    });

    if (adminCount <= 1) {
      redirectWithNotice(
        redirectTo,
        "error",
        "Keep at least one active admin assigned.",
      );
    }
  }

  await db.$transaction([
    db.membership.update({
      where: {
        id: membershipId,
      },
      data: {
        role: parsed.data.role as SystemRole,
        status: parsed.data.status as MembershipStatus,
      },
    }),
    db.user.update({
      where: {
        id: targetMembership.userId,
      },
      data: {
        systemRole: parsed.data.role as SystemRole,
      },
    }),
  ]);

  redirectWithNotice(redirectTo, "success", "Member updated.");
}
