import { MembershipApplicationStatus } from "@prisma/client";

import {
  applicationStatusFilterSchema,
} from "@/features/applications/schemas";
import { getClubSettings } from "@/lib/club";
import { db } from "@/lib/db";
import { getMembershipForUser } from "@/lib/session";

export const APPLICATION_REVIEW_LIMIT = 40;

export function parseApplicationStatusFilter(
  value: string | string[] | undefined,
) {
  const candidate = Array.isArray(value) ? value[0] : value;
  const parsed = applicationStatusFilterSchema.safeParse(candidate);

  return parsed.success ? parsed.data : undefined;
}

export async function getMyApplicationStatusData(userId: string) {
  const [user, application] = await Promise.all([
    db.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        name: true,
        membership: true,
      },
    }),
    db.membershipApplication.findFirst({
      where: {
        applicantUserId: userId,
      },
      select: {
        fullName: true,
        status: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
  ]);

  return {
    user,
    application,
  };
}

export async function getApplicationReviewPageData(
  userId: string,
  status?: MembershipApplicationStatus,
) {
  const [club, viewerMembership, applications] = await Promise.all([
    getClubSettings(),
    getMembershipForUser(userId),
    db.membershipApplication.findMany({
      where: status ? { status } : undefined,
      include: {
        applicantUser: {
          select: {
            id: true,
            name: true,
            email: true,
            systemRole: true,
            membership: true,
            profile: true,
          },
        },
        reviewedBy: {
          select: {
            name: true,
          },
        },
        welcomePost: {
          select: {
            id: true,
            createdAt: true,
          },
        },
      },
      orderBy: [
        { submittedAt: "desc" },
        { createdAt: "desc" },
      ],
      take: APPLICATION_REVIEW_LIMIT,
    }),
  ]);

  return {
    club,
    viewerMembership,
    applications,
    limit: APPLICATION_REVIEW_LIMIT,
    status,
  };
}
