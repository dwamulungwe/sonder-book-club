import { z } from "zod";

export const clubSettingsSchema = z.object({
  name: z
    .string()
    .min(3, "Club name must be at least 3 characters.")
    .max(80, "Club name must be 80 characters or fewer."),
  description: z
    .string()
    .max(500, "Description must be 500 characters or fewer.")
    .optional(),
  meetingFrequency: z
    .string()
    .max(80, "Meeting frequency must be 80 characters or fewer.")
    .optional(),
  location: z
    .string()
    .max(120, "Location must be 120 characters or fewer.")
    .optional(),
  contactEmail: z.email("Enter a valid contact email address.").optional(),
  contactPhone: z
    .string()
    .max(40, "Contact phone must be 40 characters or fewer.")
    .optional(),
  logoUrl: z.url("Logo URL must be a valid URL.").optional(),
  bannerUrl: z.url("Banner URL must be a valid URL.").optional(),
});

export const membershipUpdateSchema = z.object({
  role: z.enum(["ADMIN", "MODERATOR", "MEMBER", "GUEST"]),
  status: z.enum(["ACTIVE", "SUSPENDED", "LEFT"]),
});
