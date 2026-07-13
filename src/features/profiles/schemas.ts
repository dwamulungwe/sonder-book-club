import { z } from "zod";

function optionalUrl(label: string) {
  return z
    .string()
    .max(500, `${label} URL must be 500 characters or fewer.`)
    .refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    }, `${label} URL must be a valid HTTP URL.`)
    .optional();
}

export const memberProfileSchema = z.object({
  bio: z
    .string()
    .max(800, "Biography must be 800 characters or fewer.")
    .optional(),
  phoneNumber: z
    .string()
    .max(40, "Phone number must be 40 characters or fewer.")
    .optional(),
  location: z
    .string()
    .max(120, "Location must be 120 characters or fewer.")
    .optional(),
  occupation: z
    .string()
    .max(120, "Occupation must be 120 characters or fewer.")
    .optional(),
  profileImageUrl: optionalUrl("Profile image"),
  favouriteGenres: z
    .array(
      z
        .string()
        .min(1, "Favourite genres cannot be blank.")
        .max(40, "Each favourite genre must be 40 characters or fewer."),
    )
    .max(12, "Choose 12 favourite genres or fewer."),
  favouriteBooks: z
    .string()
    .max(800, "Favourite books must be 800 characters or fewer.")
    .optional(),
  readingInterests: z
    .string()
    .max(800, "Reading interests must be 800 characters or fewer.")
    .optional(),
  currentlyReadingText: z
    .string()
    .max(240, "Currently reading must be 240 characters or fewer.")
    .optional(),
  currentlyListeningTitle: z
    .string()
    .max(180, "Currently listening title must be 180 characters or fewer.")
    .optional(),
  currentlyListeningCreator: z
    .string()
    .max(180, "Currently listening creator must be 180 characters or fewer.")
    .optional(),
  currentlyListeningUrl: optionalUrl("Currently listening"),
});
