import { MembershipStatus, SystemRole } from "@prisma/client";

type MembershipLike =
  | {
      role: SystemRole;
      status: MembershipStatus;
    }
  | null
  | undefined;

type UserLike =
  | {
      systemRole: SystemRole;
    }
  | null
  | undefined;

export function isActiveMembership(membership: MembershipLike) {
  return membership?.status === MembershipStatus.ACTIVE;
}

export function canViewClub(_user: UserLike, membership: MembershipLike) {
  return isActiveMembership(membership);
}

export function canManageClub(user: UserLike, membership: MembershipLike) {
  if (!isActiveMembership(membership)) {
    return false;
  }

  return (
    membership?.role === SystemRole.ADMIN ||
    user?.systemRole === SystemRole.ADMIN
  );
}

export function canAdministerEmailOutbox(
  user: UserLike,
  membership: MembershipLike,
) {
  if (!isActiveMembership(membership)) {
    return false;
  }

  return (
    membership?.role === SystemRole.ADMIN ||
    user?.systemRole === SystemRole.ADMIN
  );
}

export function canModerateClub(user: UserLike, membership: MembershipLike) {
  if (canManageClub(user, membership)) {
    return true;
  }

  if (!isActiveMembership(membership)) {
    return false;
  }

  return (
    membership?.role === SystemRole.MODERATOR ||
    user?.systemRole === SystemRole.MODERATOR
  );
}

export function canParticipateInClub(
  user: UserLike,
  membership: MembershipLike,
) {
  if (!canViewClub(user, membership)) {
    return false;
  }

  return membership?.role !== SystemRole.GUEST;
}
