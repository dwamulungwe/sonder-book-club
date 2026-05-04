import { z } from "zod";

export const readingPlanSchema = z.object({
  title: z
    .string()
    .min(3, "Plan title must be at least 3 characters.")
    .max(120, "Plan title must be 120 characters or fewer."),
  targetMode: z.enum(["PAGES", "CHAPTERS"]),
  weekCount: z
    .number()
    .int()
    .min(1, "A plan needs at least one week.")
    .max(24, "Keep plans to 24 weeks or fewer."),
  chapterCount: z
    .number()
    .int()
    .positive("Chapter count must be positive.")
    .optional(),
  startsOn: z.iso.date("Choose a valid start date."),
});

export const progressSchema = z.object({
  percent: z
    .number()
    .int()
    .min(0, "Progress cannot be negative.")
    .max(100, "Progress cannot exceed 100."),
  notes: z
    .string()
    .max(300, "Progress notes must be 300 characters or fewer.")
    .optional(),
});
