"use server";

import { memberProfileSchema } from "@/features/profiles/schemas";
import { db } from "@/lib/db";
import { getOptionalString, getString } from "@/lib/form-data";
import { redirectWithNotice, resolveReturnPath } from "@/lib/navigation";
import { requireSessionUser } from "@/lib/session";

function getDelimitedList(formData: FormData, field: string) {
  return getString(formData, field)
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function updateMyProfileAction(formData: FormData) {
  const redirectTo = resolveReturnPath(formData, "/profile");
  const user = await requireSessionUser();
  const parsed = memberProfileSchema.safeParse({
    bio: getOptionalString(formData, "bio"),
    phoneNumber: getOptionalString(formData, "phoneNumber"),
    location: getOptionalString(formData, "location"),
    occupation: getOptionalString(formData, "occupation"),
    profileImageUrl: getOptionalString(formData, "profileImageUrl"),
    favouriteGenres: getDelimitedList(formData, "favouriteGenres"),
    favouriteBooks: getOptionalString(formData, "favouriteBooks"),
    readingInterests: getOptionalString(formData, "readingInterests"),
    currentlyReadingText: getOptionalString(formData, "currentlyReadingText"),
    currentlyListeningTitle: getOptionalString(
      formData,
      "currentlyListeningTitle",
    ),
    currentlyListeningCreator: getOptionalString(
      formData,
      "currentlyListeningCreator",
    ),
    currentlyListeningUrl: getOptionalString(
      formData,
      "currentlyListeningUrl",
    ),
  });

  if (!parsed.success) {
    redirectWithNotice(
      redirectTo,
      "error",
      parsed.error.issues[0]?.message ?? "Unable to update your profile.",
    );
  }

  await db.memberProfile.upsert({
    where: {
      userId: user.id,
    },
    update: parsed.data,
    create: {
      userId: user.id,
      ...parsed.data,
    },
  });

  redirectWithNotice(redirectTo, "success", "Profile updated.");
}
