import { z } from "zod";

export const meetingSchema = z.object({
  title: z
    .string()
    .min(3, "Meeting title must be at least 3 characters.")
    .max(120, "Meeting title must be 120 characters or fewer."),
  agenda: z
    .string()
    .max(1200, "Agenda must be 1200 characters or fewer.")
    .optional(),
  date: z.iso.date("Choose a valid meeting date."),
  time: z.string().min(1, "Choose a meeting time."),
  location: z
    .string()
    .max(120, "Location must be 120 characters or fewer.")
    .optional(),
  meetingLink: z.url("Meeting link must be a valid URL.").optional(),
});
