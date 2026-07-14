import { MembershipApplicationStatus } from "@prisma/client";
import { z } from "zod";

export const unresolvedApplicationStatuses = [
  MembershipApplicationStatus.DRAFT,
  MembershipApplicationStatus.SUBMITTED,
  MembershipApplicationStatus.UNDER_REVIEW,
  MembershipApplicationStatus.WAITLISTED,
] as const;

export const applicationStatusFilterValues = [
  MembershipApplicationStatus.DRAFT,
  MembershipApplicationStatus.SUBMITTED,
  MembershipApplicationStatus.UNDER_REVIEW,
  MembershipApplicationStatus.APPROVED,
  MembershipApplicationStatus.REJECTED,
  MembershipApplicationStatus.WAITLISTED,
] as const;

export const applicationStatusFilterSchema = z.enum(
  applicationStatusFilterValues,
);

export const joinApplicationSchema = z
  .object({
    fullName: z
      .string()
      .min(2, "Full name must be at least 2 characters.")
      .max(120, "Full name must be 120 characters or fewer."),
    email: z
      .email("Enter a valid email address.")
      .max(255, "Email must be 255 characters or fewer."),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters."),
    passwordConfirmation: z
      .string()
      .min(8, "Password confirmation must be at least 8 characters."),
    phoneNumber: z
      .string()
      .min(3, "Phone number is required.")
      .max(40, "Phone number must be 40 characters or fewer."),
    location: z
      .string()
      .min(2, "Location is required.")
      .max(120, "Location must be 120 characters or fewer."),
    occupation: z
      .string()
      .max(120, "Occupation must be 120 characters or fewer.")
      .optional(),
    readingInterests: z
      .string()
      .min(10, "Share a little more about your reading interests.")
      .max(800, "Reading interests must be 800 characters or fewer."),
    favouriteGenres: z
      .array(
        z
          .string()
          .min(1, "Favourite genres cannot be blank.")
          .max(40, "Each favourite genre must be 40 characters or fewer."),
      )
      .min(1, "Add at least one favourite genre.")
      .max(12, "Choose 12 favourite genres or fewer."),
    favouriteBooks: z
      .string()
      .max(800, "Favourite books must be 800 characters or fewer.")
      .optional(),
    reasonForJoining: z
      .string()
      .min(20, "Share a little more about why you want to join.")
      .max(1200, "Reason for joining must be 1200 characters or fewer."),
    referralSource: z
      .string()
      .max(200, "Referral source must be 200 characters or fewer.")
      .optional(),
    acceptedCommunityRules: z
      .boolean()
      .refine(Boolean, "Please accept the community rules."),
    acceptedPrivacyPolicy: z
      .boolean()
      .refine(Boolean, "Please accept the privacy notice."),
  })
  .superRefine((data, context) => {
    if (data.password !== data.passwordConfirmation) {
      context.addIssue({
        code: "custom",
        path: ["passwordConfirmation"],
        message: "Passwords must match.",
      });
    }
  });

export const reviewNotesSchema = z.object({
  applicationId: z
    .string()
    .min(1, "Application id is required.")
    .max(128, "Application id is invalid."),
  reviewNotes: z
    .string()
    .max(2000, "Review notes must be 2000 characters or fewer.")
    .optional(),
});
