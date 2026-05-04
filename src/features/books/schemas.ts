import { z } from "zod";

export const bookSchema = z.object({
  title: z
    .string()
    .min(1, "Book title is required.")
    .max(120, "Book title must be 120 characters or fewer."),
  author: z
    .string()
    .min(1, "Author is required.")
    .max(120, "Author must be 120 characters or fewer."),
  genre: z
    .string()
    .max(80, "Genre must be 80 characters or fewer.")
    .optional(),
  isbn: z
    .string()
    .max(32, "ISBN must be 32 characters or fewer.")
    .optional(),
  pageCount: z
    .number()
    .int()
    .positive("Page count must be a positive number.")
    .optional(),
  coverUrl: z.url("Cover URL must be a valid URL.").optional(),
  summary: z
    .string()
    .max(1200, "Summary must be 1200 characters or fewer.")
    .optional(),
  status: z.enum(["NOMINATED", "BACKLOG", "CURRENT", "COMPLETED", "ARCHIVED"]),
});
