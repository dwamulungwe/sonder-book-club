import { z } from "zod";

export const nominationSchema = z.object({
  reason: z
    .string()
    .max(400, "Nomination reason must be 400 characters or fewer.")
    .optional(),
});

export const pollSchema = z.object({
  title: z
    .string()
    .min(3, "Poll title must be at least 3 characters.")
    .max(120, "Poll title must be 120 characters or fewer."),
  description: z
    .string()
    .max(400, "Poll description must be 400 characters or fewer.")
    .optional(),
  opensOn: z.iso.date("Choose a valid poll open date."),
  opensAt: z.string().min(1, "Choose a poll opening time."),
  closesOn: z.iso.date("Choose a valid poll close date."),
  closesAt: z.string().min(1, "Choose a poll closing time."),
});
