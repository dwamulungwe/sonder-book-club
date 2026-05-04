import { z } from "zod";

export const announcementSchema = z.object({
  title: z
    .string()
    .min(3, "Announcement title must be at least 3 characters.")
    .max(120, "Announcement title must be 120 characters or fewer."),
  body: z
    .string()
    .min(8, "Announcement body must be at least 8 characters.")
    .max(1200, "Announcement body must be 1200 characters or fewer."),
});
