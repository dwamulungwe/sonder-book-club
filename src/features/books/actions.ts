"use server";

import { BookStatus } from "@prisma/client";

import { bookSchema } from "@/features/books/schemas";
import { db } from "@/lib/db";
import { getInt, getOptionalString, getString } from "@/lib/form-data";
import { redirectWithNotice, resolveReturnPath } from "@/lib/navigation";
import { canModerateClub } from "@/lib/permissions";
import { requireMembershipContext } from "@/lib/session";

async function requireBookModerator(redirectTo: string) {
  const { user, membership } = await requireMembershipContext();

  if (!canModerateClub(user, membership)) {
    redirectWithNotice(
      redirectTo,
      "error",
      "You do not have permission to manage books.",
    );
  }

  return { user };
}

async function syncCurrentBook(nextBookId: string) {
  await db.book.updateMany({
    where: {
      status: BookStatus.CURRENT,
      id: {
        not: nextBookId,
      },
    },
    data: {
      status: BookStatus.COMPLETED,
    },
  });
}

export async function createBookAction(formData: FormData) {
  const redirectTo = resolveReturnPath(formData, "/books");
  const { user } = await requireBookModerator(redirectTo);
  const parsed = bookSchema.safeParse({
    title: getString(formData, "title"),
    author: getString(formData, "author"),
    genre: getOptionalString(formData, "genre"),
    pageCount: getInt(formData, "pageCount"),
    coverUrl: getOptionalString(formData, "coverUrl"),
    summary: getOptionalString(formData, "summary"),
    status: getString(formData, "status") || "BACKLOG",
  });

  if (!parsed.success) {
    redirectWithNotice(
      redirectTo,
      "error",
      parsed.error.issues[0]?.message ?? "Unable to add the book.",
    );
  }

  const book = await db.book.create({
    data: {
      createdById: user.id,
      title: parsed.data.title,
      author: parsed.data.author,
      genre: parsed.data.genre,
      pageCount: parsed.data.pageCount,
      coverUrl: parsed.data.coverUrl,
      summary: parsed.data.summary,
      status: parsed.data.status as BookStatus,
      archivedAt:
        parsed.data.status === BookStatus.ARCHIVED ? new Date() : null,
    },
  });

  if (parsed.data.status === BookStatus.CURRENT) {
    await syncCurrentBook(book.id);
  }

  redirectWithNotice(redirectTo, "success", "Book added.");
}

export async function updateBookAction(formData: FormData) {
  const bookId = getString(formData, "bookId");
  const redirectTo = resolveReturnPath(formData, "/books");
  await requireBookModerator(redirectTo);
  const parsed = bookSchema.safeParse({
    title: getString(formData, "title"),
    author: getString(formData, "author"),
    genre: getOptionalString(formData, "genre"),
    pageCount: getInt(formData, "pageCount"),
    coverUrl: getOptionalString(formData, "coverUrl"),
    summary: getOptionalString(formData, "summary"),
    status: getString(formData, "status"),
  });

  if (!parsed.success) {
    redirectWithNotice(
      redirectTo,
      "error",
      parsed.error.issues[0]?.message ?? "Unable to update the book.",
    );
  }

  await db.book.update({
    where: { id: bookId },
    data: {
      title: parsed.data.title,
      author: parsed.data.author,
      genre: parsed.data.genre,
      pageCount: parsed.data.pageCount,
      coverUrl: parsed.data.coverUrl,
      summary: parsed.data.summary,
      status: parsed.data.status as BookStatus,
      archivedAt:
        parsed.data.status === BookStatus.ARCHIVED ? new Date() : null,
    },
  });

  if (parsed.data.status === BookStatus.CURRENT) {
    await syncCurrentBook(bookId);
  }

  redirectWithNotice(redirectTo, "success", "Book updated.");
}

export async function archiveBookAction(formData: FormData) {
  const bookId = getString(formData, "bookId");
  const redirectTo = resolveReturnPath(formData, "/books");
  await requireBookModerator(redirectTo);

  await db.book.update({
    where: { id: bookId },
    data: {
      status: BookStatus.ARCHIVED,
      archivedAt: new Date(),
    },
  });

  redirectWithNotice(redirectTo, "success", "Book archived.");
}
