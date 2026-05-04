import type { Metadata } from "next";

import { BookStatus } from "@prisma/client";

import { EmptyState } from "@/components/app/empty-state";
import { SectionHeading } from "@/components/app/section-heading";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  archiveBookAction,
  createBookAction,
  updateBookAction,
} from "@/features/books/actions";
import { getBooksPageData } from "@/features/club/queries";
import { formatBookStatus, formatDate } from "@/lib/formatters";
import { canModerateClub } from "@/lib/permissions";
import { requireSessionUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Books",
};

function bookTone(status: BookStatus) {
  if (status === BookStatus.CURRENT) {
    return "emerald" as const;
  }

  if (status === BookStatus.NOMINATED) {
    return "sky" as const;
  }

  if (status === BookStatus.ARCHIVED) {
    return "neutral" as const;
  }

  return "amber" as const;
}

const statusOptions = [
  "NOMINATED",
  "BACKLOG",
  "CURRENT",
  "COMPLETED",
  "ARCHIVED",
] as const;

export default async function BooksPage() {
  const user = await requireSessionUser();
  const data = await getBooksPageData(user.id);
  const canModerate = canModerateClub(user, data.viewerMembership);

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm sm:p-6">
        <SectionHeading
          eyebrow="Books"
          title="Library and current read"
          description="Keep the library tidy, spotlight the active read, and retire finished titles without extra admin clutter."
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:gap-6">
        {canModerate ? (
          <Card className="border-zinc-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg text-zinc-950">Add a book</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createBookAction} className="space-y-4">
                <input type="hidden" name="redirectTo" value="/books" />
                <div className="space-y-2">
                  <Label htmlFor="book-title">Title</Label>
                  <Input id="book-title" name="title" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="book-author">Author</Label>
                  <Input id="book-author" name="author" required />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="book-genre">Genre</Label>
                    <Input id="book-genre" name="genre" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="book-pages">Page count</Label>
                    <Input id="book-pages" name="pageCount" type="number" min="1" />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="book-isbn">ISBN</Label>
                    <Input id="book-isbn" name="isbn" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="book-status">Status</Label>
                    <select
                      id="book-status"
                      name="status"
                      defaultValue="BACKLOG"
                      className="flex h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                    >
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>
                          {formatBookStatus(status)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="book-cover">Cover URL</Label>
                  <Input id="book-cover" name="coverUrl" type="url" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="book-summary">Summary</Label>
                  <Textarea id="book-summary" name="summary" rows={5} />
                </div>
                <button
                  type="submit"
                  className="min-h-11 w-full rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-800 sm:w-auto"
                >
                  Save book
                </button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-zinc-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg text-zinc-950">Current focus</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-zinc-600">
              <p>
                Guests and members can browse the library here. Moderators and admins can add or update titles.
              </p>
              <p>
                The current book drives the reading plan and keeps the dashboard aligned.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {data.books.length > 0 ? (
            data.books.map((book) => (
              <Card key={book.id} className="border-zinc-200 bg-white shadow-sm">
                <CardContent className="space-y-4 pt-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-lg font-semibold text-zinc-950 sm:text-xl">
                          {book.title}
                        </h3>
                        <StatusBadge tone={bookTone(book.status)}>
                          {formatBookStatus(book.status)}
                        </StatusBadge>
                      </div>
                      <p className="text-sm text-zinc-600">{book.author}</p>
                      <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
                        {book.genre ? <span>{book.genre}</span> : null}
                        {book.pageCount ? <span>{book.pageCount} pages</span> : null}
                        <span>Updated {formatDate(book.updatedAt)}</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-sm leading-6 text-zinc-600">
                    {book.summary ?? "No summary has been added yet."}
                  </p>

                  {canModerate ? (
                    <div className="grid gap-4 xl:grid-cols-[1fr_auto]">
                      <form action={updateBookAction} className="grid gap-4 md:grid-cols-2">
                        <input type="hidden" name="bookId" value={book.id} />
                        <input type="hidden" name="redirectTo" value="/books" />
                        <div className="space-y-2">
                          <Label htmlFor={`title-${book.id}`}>Title</Label>
                          <Input
                            id={`title-${book.id}`}
                            name="title"
                            defaultValue={book.title}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`author-${book.id}`}>Author</Label>
                          <Input
                            id={`author-${book.id}`}
                            name="author"
                            defaultValue={book.author}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`genre-${book.id}`}>Genre</Label>
                          <Input
                            id={`genre-${book.id}`}
                            name="genre"
                            defaultValue={book.genre ?? ""}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`pages-${book.id}`}>Page count</Label>
                          <Input
                            id={`pages-${book.id}`}
                            name="pageCount"
                            type="number"
                            min="1"
                            defaultValue={book.pageCount ?? undefined}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`isbn-${book.id}`}>ISBN</Label>
                          <Input
                            id={`isbn-${book.id}`}
                            name="isbn"
                            defaultValue={book.isbn ?? ""}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`status-${book.id}`}>Status</Label>
                          <select
                            id={`status-${book.id}`}
                            name="status"
                            defaultValue={book.status}
                            className="flex h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                          >
                            {statusOptions.map((status) => (
                              <option key={status} value={status}>
                                {formatBookStatus(status)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label htmlFor={`cover-${book.id}`}>Cover URL</Label>
                          <Input
                            id={`cover-${book.id}`}
                            name="coverUrl"
                            type="url"
                            defaultValue={book.coverUrl ?? ""}
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label htmlFor={`summary-${book.id}`}>Summary</Label>
                          <Textarea
                            id={`summary-${book.id}`}
                            name="summary"
                            rows={4}
                            defaultValue={book.summary ?? ""}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <button
                            type="submit"
                            className="min-h-11 w-full rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 sm:w-auto"
                          >
                            Update book
                          </button>
                        </div>
                      </form>

                      <form action={archiveBookAction} className="self-start xl:justify-self-end">
                        <input type="hidden" name="bookId" value={book.id} />
                        <input type="hidden" name="redirectTo" value="/books" />
                        <button
                          type="submit"
                          className="min-h-11 w-full rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 sm:w-auto"
                        >
                          Archive
                        </button>
                      </form>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))
          ) : (
            <EmptyState
              title="No books yet"
              description="Add the first title to begin building the club library."
            />
          )}
        </div>
      </section>
    </div>
  );
}
