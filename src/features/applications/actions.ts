"use server";

import {
  CommunityPostType,
  MembershipApplicationStatus,
  MembershipStatus,
  Prisma,
  SystemRole,
} from "@prisma/client";
import { hash } from "bcryptjs";
import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import {
  joinApplicationSchema,
  reviewNotesSchema,
  unresolvedApplicationStatuses,
} from "@/features/applications/schemas";
import { db } from "@/lib/db";
import { getOptionalString, getString } from "@/lib/form-data";
import {
  redirectWithNotice,
  resolveReturnPath,
} from "@/lib/navigation";
import { canModerateClub } from "@/lib/permissions";
import { requireMembershipContext } from "@/lib/session";

const REVIEWABLE_STATUSES: readonly MembershipApplicationStatus[] = [
  MembershipApplicationStatus.SUBMITTED,
  MembershipApplicationStatus.UNDER_REVIEW,
  MembershipApplicationStatus.WAITLISTED,
] as const;

class ApplicationActionError extends Error {}

function normalizeApplicationEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeFavouriteGenresInput(value: string) {
  const seen = new Set<string>();

  return value
    .split(/[\n,]/)
    .map((genre) => genre.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((genre) => {
      const key = genre.toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function getCheckbox(formData: FormData, field: string) {
  return formData.get(field) === "on";
}

function isKnownPrismaError(error: unknown, code: string) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

async function requireApplicationReviewer(redirectTo: string) {
  const { user, membership } = await requireMembershipContext();

  if (!canModerateClub(user, membership)) {
    redirectWithNotice(
      redirectTo,
      "error",
      "You do not have permission to review applications.",
    );
  }

  return { user, membership };
}

function preserveStrongerRole(current: SystemRole, fallback: SystemRole) {
  return current === SystemRole.ADMIN || current === SystemRole.MODERATOR
    ? current
    : fallback;
}

function getReviewInput(formData: FormData) {
  return reviewNotesSchema.safeParse({
    applicationId: getString(formData, "applicationId"),
    reviewNotes: getString(formData, "reviewNotes"),
  });
}

async function ensureNoDuplicateApplication(
  tx: Prisma.TransactionClient,
  normalizedEmail: string,
) {
  const [existingUser, existingApplication] = await Promise.all([
    tx.user.findUnique({
      where: {
        email: normalizedEmail,
      },
      select: {
        id: true,
      },
    }),
    tx.membershipApplication.findFirst({
      where: {
        normalizedEmail,
        status: {
          in: [...unresolvedApplicationStatuses],
        },
      },
      select: {
        id: true,
      },
    }),
  ]);

  if (existingUser) {
    throw new ApplicationActionError(
      "An account with that email already exists. Sign in to view your application status.",
    );
  }

  if (existingApplication) {
    throw new ApplicationActionError(
      "An application for that email is already in progress. Sign in to view its latest status.",
    );
  }
}

export async function submitMembershipApplicationAction(formData: FormData) {
  const normalizedEmail = normalizeApplicationEmail(getString(formData, "email"));
  const parsed = joinApplicationSchema.safeParse({
    fullName: getString(formData, "fullName"),
    email: normalizedEmail,
    password: getString(formData, "password"),
    passwordConfirmation: getString(formData, "passwordConfirmation"),
    phoneNumber: getString(formData, "phoneNumber"),
    location: getString(formData, "location"),
    occupation: getOptionalString(formData, "occupation"),
    readingInterests: getString(formData, "readingInterests"),
    favouriteGenres: normalizeFavouriteGenresInput(
      getString(formData, "favouriteGenres"),
    ),
    favouriteBooks: getOptionalString(formData, "favouriteBooks"),
    reasonForJoining: getString(formData, "reasonForJoining"),
    referralSource: getOptionalString(formData, "referralSource"),
    acceptedCommunityRules: getCheckbox(formData, "acceptedCommunityRules"),
    acceptedPrivacyPolicy: getCheckbox(formData, "acceptedPrivacyPolicy"),
  });

  if (!parsed.success) {
    redirectWithNotice(
      "/join",
      "error",
      parsed.error.issues[0]?.message ?? "Check the form and try again.",
    );
  }

  const passwordHash = await hash(parsed.data.password, 12);
  const now = new Date();

  try {
    await db.$transaction(
      async (tx) => {
        await ensureNoDuplicateApplication(tx, parsed.data.email);

        const user = await tx.user.create({
          data: {
            name: parsed.data.fullName,
            email: parsed.data.email,
            passwordHash,
            systemRole: SystemRole.GUEST,
            membership: {
              create: {
                role: SystemRole.GUEST,
                status: MembershipStatus.PENDING,
                joinedAt: now,
              },
            },
            profile: {
              create: {
                phoneNumber: parsed.data.phoneNumber,
                location: parsed.data.location,
                occupation: parsed.data.occupation,
                readingInterests: parsed.data.readingInterests,
                favouriteGenres: parsed.data.favouriteGenres,
                favouriteBooks: parsed.data.favouriteBooks,
              },
            },
          },
          select: {
            id: true,
          },
        });

        await tx.membershipApplication.create({
          data: {
            applicantUserId: user.id,
            fullName: parsed.data.fullName,
            normalizedEmail: parsed.data.email,
            email: parsed.data.email,
            phoneNumber: parsed.data.phoneNumber,
            location: parsed.data.location,
            occupation: parsed.data.occupation,
            readingInterests: parsed.data.readingInterests,
            favouriteGenres: parsed.data.favouriteGenres,
            favouriteBooks: parsed.data.favouriteBooks,
            reasonForJoining: parsed.data.reasonForJoining,
            referralSource: parsed.data.referralSource,
            acceptedCommunityRules: parsed.data.acceptedCommunityRules,
            acceptedPrivacyPolicy: parsed.data.acceptedPrivacyPolicy,
            status: MembershipApplicationStatus.SUBMITTED,
            submittedAt: now,
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  } catch (error) {
    if (error instanceof ApplicationActionError) {
      redirectWithNotice("/join", "error", error.message);
    }

    if (isKnownPrismaError(error, "P2002")) {
      redirectWithNotice(
        "/join",
        "error",
        "An account or unresolved application already exists for that email.",
      );
    }

    if (isKnownPrismaError(error, "P2034")) {
      redirectWithNotice(
        "/join",
        "error",
        "Another request updated that email at the same time. Please try again.",
      );
    }

    throw error;
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/application-status",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirectWithNotice(
        "/login",
        "success",
        "Application submitted. Sign in to view your application status.",
      );
    }

    throw error;
  }
}

async function preservePendingApplicantAccount(
  tx: Prisma.TransactionClient,
  applicantUserId: string | null,
) {
  if (!applicantUserId) {
    return;
  }

  const applicant = await tx.user.findUnique({
    where: {
      id: applicantUserId,
    },
    include: {
      membership: true,
    },
  });

  if (!applicant) {
    return;
  }

  const userRole = preserveStrongerRole(applicant.systemRole, SystemRole.GUEST);
  const membershipRole = preserveStrongerRole(
    applicant.membership?.role ?? SystemRole.GUEST,
    SystemRole.GUEST,
  );

  await tx.user.update({
    where: {
      id: applicant.id,
    },
    data: {
      systemRole: userRole,
    },
  });

  await tx.membership.upsert({
    where: {
      userId: applicant.id,
    },
    create: {
      userId: applicant.id,
      role: membershipRole,
      status: MembershipStatus.PENDING,
    },
    update: {
      role: membershipRole,
      status: MembershipStatus.PENDING,
    },
  });
}

async function transitionApplication(
  formData: FormData,
  targetStatus: MembershipApplicationStatus,
  allowedStatuses: readonly MembershipApplicationStatus[],
  successMessage: string,
) {
  const redirectTo = resolveReturnPath(formData, "/admin/applications");
  const { user } = await requireApplicationReviewer(redirectTo);
  const parsed = getReviewInput(formData);

  if (!parsed.success) {
    redirectWithNotice(
      redirectTo,
      "error",
      parsed.error.issues[0]?.message ?? "Unable to update the application.",
    );
  }

  const reviewNotes = parsed.data.reviewNotes || null;
  const now = new Date();

  try {
    await db.$transaction(
      async (tx) => {
        const application = await tx.membershipApplication.findUnique({
          where: {
            id: parsed.data.applicationId,
          },
          select: {
            id: true,
            status: true,
            applicantUserId: true,
          },
        });

        if (!application) {
          throw new ApplicationActionError("Application not found.");
        }

        if (application.status === targetStatus) {
          await tx.membershipApplication.update({
            where: {
              id: application.id,
            },
            data: {
              reviewedAt: now,
              reviewedById: user.id,
              reviewNotes,
            },
          });
          return;
        }

        if (!allowedStatuses.includes(application.status)) {
          throw new ApplicationActionError(
            "That application cannot move to the requested state.",
          );
        }

        const updated = await tx.membershipApplication.updateMany({
          where: {
            id: application.id,
            status: {
              in: [...allowedStatuses],
            },
          },
          data: {
            status: targetStatus,
            reviewedAt: now,
            reviewedById: user.id,
            reviewNotes,
          },
        });

        if (updated.count !== 1) {
          throw new ApplicationActionError(
            "That application was changed by another reviewer. Refresh and try again.",
          );
        }

        if (
          targetStatus === MembershipApplicationStatus.REJECTED ||
          targetStatus === MembershipApplicationStatus.WAITLISTED
        ) {
          await preservePendingApplicantAccount(tx, application.applicantUserId);
        }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  } catch (error) {
    if (error instanceof ApplicationActionError) {
      redirectWithNotice(redirectTo, "error", error.message);
    }

    if (isKnownPrismaError(error, "P2034")) {
      redirectWithNotice(
        redirectTo,
        "error",
        "That application changed while you were reviewing it. Refresh and try again.",
      );
    }

    throw error;
  }

  redirectWithNotice(redirectTo, "success", successMessage);
}

export async function markApplicationUnderReviewAction(formData: FormData) {
  await transitionApplication(
    formData,
    MembershipApplicationStatus.UNDER_REVIEW,
    [
      MembershipApplicationStatus.SUBMITTED,
      MembershipApplicationStatus.WAITLISTED,
    ],
    "Application marked under review.",
  );
}

export async function rejectApplicationAction(formData: FormData) {
  await transitionApplication(
    formData,
    MembershipApplicationStatus.REJECTED,
    REVIEWABLE_STATUSES,
    "Application rejected.",
  );
}

export async function waitlistApplicationAction(formData: FormData) {
  await transitionApplication(
    formData,
    MembershipApplicationStatus.WAITLISTED,
    [
      MembershipApplicationStatus.SUBMITTED,
      MembershipApplicationStatus.UNDER_REVIEW,
    ],
    "Application waitlisted.",
  );
}

export async function updateApplicationReviewNotesAction(formData: FormData) {
  const redirectTo = resolveReturnPath(formData, "/admin/applications");
  const { user } = await requireApplicationReviewer(redirectTo);
  const parsed = getReviewInput(formData);

  if (!parsed.success) {
    redirectWithNotice(
      redirectTo,
      "error",
      parsed.error.issues[0]?.message ?? "Unable to update review notes.",
    );
  }

  await db.membershipApplication.update({
    where: {
      id: parsed.data.applicationId,
    },
    data: {
      reviewedAt: new Date(),
      reviewedById: user.id,
      reviewNotes: parsed.data.reviewNotes || null,
    },
  });

  redirectWithNotice(redirectTo, "success", "Review notes updated.");
}

export async function approveApplicationAction(formData: FormData) {
  const redirectTo = resolveReturnPath(formData, "/admin/applications");
  const { user } = await requireApplicationReviewer(redirectTo);
  const parsed = getReviewInput(formData);

  if (!parsed.success) {
    redirectWithNotice(
      redirectTo,
      "error",
      parsed.error.issues[0]?.message ?? "Unable to approve the application.",
    );
  }

  const reviewNotes = parsed.data.reviewNotes || null;
  const now = new Date();
  let alreadyApproved = false;

  try {
    await db.$transaction(
      async (tx) => {
        const application = await tx.membershipApplication.findUnique({
          where: {
            id: parsed.data.applicationId,
          },
          include: {
            applicantUser: {
              include: {
                membership: true,
              },
            },
          },
        });

        if (!application) {
          throw new ApplicationActionError("Application not found.");
        }

        if (application.status === MembershipApplicationStatus.APPROVED) {
          alreadyApproved = true;
          return;
        }

        if (!REVIEWABLE_STATUSES.includes(application.status)) {
          throw new ApplicationActionError(
            "Only submitted, under-review, or waitlisted applications can be approved.",
          );
        }

        if (!application.applicantUserId || !application.applicantUser) {
          throw new ApplicationActionError(
            "This application is missing its applicant account.",
          );
        }

        const updated = await tx.membershipApplication.updateMany({
          where: {
            id: application.id,
            status: {
              in: [...REVIEWABLE_STATUSES],
            },
          },
          data: {
            status: MembershipApplicationStatus.APPROVED,
            reviewedAt: now,
            reviewedById: user.id,
            reviewNotes,
          },
        });

        if (updated.count !== 1) {
          const latest = await tx.membershipApplication.findUnique({
            where: {
              id: application.id,
            },
            select: {
              status: true,
              welcomePostId: true,
            },
          });

          if (
            latest?.status === MembershipApplicationStatus.APPROVED &&
            latest.welcomePostId
          ) {
            alreadyApproved = true;
            return;
          }

          throw new ApplicationActionError(
            "That application was changed by another reviewer. Refresh and try again.",
          );
        }

        const applicant = application.applicantUser;
        const userRole = preserveStrongerRole(
          applicant.systemRole,
          SystemRole.MEMBER,
        );
        const membershipRole = preserveStrongerRole(
          applicant.membership?.role ?? SystemRole.MEMBER,
          SystemRole.MEMBER,
        );
        const shouldRefreshJoinedAt =
          applicant.membership?.status !== MembershipStatus.ACTIVE;

        await tx.user.update({
          where: {
            id: applicant.id,
          },
          data: {
            systemRole: userRole,
          },
        });

        await tx.membership.upsert({
          where: {
            userId: applicant.id,
          },
          create: {
            userId: applicant.id,
            role: membershipRole,
            status: MembershipStatus.ACTIVE,
            joinedAt: now,
          },
          update: {
            role: membershipRole,
            status: MembershipStatus.ACTIVE,
            ...(shouldRefreshJoinedAt ? { joinedAt: now } : {}),
          },
        });

        await tx.memberProfile.upsert({
          where: {
            userId: applicant.id,
          },
          create: {
            userId: applicant.id,
            phoneNumber: application.phoneNumber,
            location: application.location,
            occupation: application.occupation,
            readingInterests: application.readingInterests,
            favouriteGenres: application.favouriteGenres,
            favouriteBooks: application.favouriteBooks,
          },
          update: {
            phoneNumber: application.phoneNumber,
            location: application.location,
            occupation: application.occupation,
            readingInterests: application.readingInterests,
            favouriteGenres: application.favouriteGenres,
            favouriteBooks: application.favouriteBooks,
          },
        });

        if (!application.welcomePostId) {
          const welcomePost = await tx.communityPost.create({
            data: {
              authorId: applicant.id,
              postType: CommunityPostType.NEW_MEMBER_WELCOME,
              body: `Welcome ${application.fullName} to Sonder. We are glad to have another reader in the room.`,
            },
            select: {
              id: true,
            },
          });

          await tx.membershipApplication.update({
            where: {
              id: application.id,
            },
            data: {
              welcomePostId: welcomePost.id,
            },
          });
        }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  } catch (error) {
    if (error instanceof ApplicationActionError) {
      redirectWithNotice(redirectTo, "error", error.message);
    }

    if (isKnownPrismaError(error, "P2002")) {
      redirectWithNotice(
        redirectTo,
        "error",
        "This approval would duplicate an existing welcome post or membership record.",
      );
    }

    if (isKnownPrismaError(error, "P2034")) {
      redirectWithNotice(
        redirectTo,
        "error",
        "That application changed while you were approving it. Refresh and try again.",
      );
    }

    throw error;
  }

  redirectWithNotice(
    redirectTo,
    "success",
    alreadyApproved
      ? "Application was already approved."
      : "Application approved and membership activated.",
  );
}
