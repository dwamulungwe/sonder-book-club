import type { Metadata } from "next";
import Link from "next/link";
import {
  Bookmark,
  BookmarkCheck,
  BookOpenText,
  Flag,
  Headphones,
  MessageCircle,
  Pin,
  PinOff,
  Send,
  Trash2,
} from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { MemberAvatar } from "@/components/app/member-avatar";
import { SectionHeading } from "@/components/app/section-heading";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createCommunityPostAction,
  createPostCommentAction,
  editCommunityPostAction,
  editPostCommentAction,
  reactToPostAction,
  removePostReactionAction,
  reportCommunityPostAction,
  reportPostCommentAction,
  setPostPinnedAction,
  softDeleteCommunityPostAction,
  softDeletePostCommentAction,
  togglePostBookmarkAction,
} from "@/features/community/actions";
import {
  COMMUNITY_FEED_LIMIT,
  getCommunityPageData,
} from "@/features/community/queries";
import {
  communityPostTypeValues,
  postReactionTypeValues,
} from "@/features/community/schemas";
import { formatDateTime } from "@/lib/formatters";
import {
  canModerateClub,
  canParticipateInClub,
} from "@/lib/permissions";
import { requireSessionUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Community",
};

type CommunityPageData = Awaited<ReturnType<typeof getCommunityPageData>>;
type FeedPost = CommunityPageData["posts"][number];
type FeedComment = FeedPost["comments"][number];
type FeedReply = FeedComment["replies"][number];
type BookOption = CommunityPageData["books"][number];

const postTypeLabels = {
  GENERAL: "General",
  READING_UPDATE: "Reading update",
  BOOK_RECOMMENDATION: "Book recommendation",
  CURRENTLY_LISTENING: "Currently listening",
  ANNOUNCEMENT: "Announcement",
  NEW_MEMBER_WELCOME: "New member welcome",
};

const reactionLabels = {
  INSIGHTFUL: "Insightful",
  BEAUTIFULLY_SAID: "Beautifully said",
  ADDING_TO_MY_LIST: "Adding to my list",
  I_AGREE: "I agree",
  MADE_ME_THINK: "Made me think",
  APPLAUSE: "Applause",
};

const reportReasons = [
  "Harassment or abuse",
  "Spoiler without warning",
  "Private information",
  "Spam or irrelevant",
  "Other concern",
];

function formatLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

function getSafeHttpUrl(value?: string | null) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function getAuthorHref(authorId: string, viewerId: string) {
  return authorId === viewerId ? "/profile" : "/members";
}

function AuthorIdentity({
  author,
  viewerId,
  timestamp,
}: {
  author: FeedPost["author"] | FeedComment["author"] | FeedReply["author"];
  viewerId: string;
  timestamp?: Date;
}) {
  return (
    <Link
      href={getAuthorHref(author.id, viewerId)}
      className="group flex min-w-0 items-center gap-3 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-stone-300/60"
    >
      <MemberAvatar
        name={author.name}
        imageUrl={author.profile?.profileImageUrl}
        size="sm"
      />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-stone-950 group-hover:underline">
          {author.name}
        </span>
        {timestamp ? (
          <span className="block text-xs text-stone-500">
            {formatDateTime(timestamp)}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

function PostComposer({
  books,
  canModerate,
}: {
  books: BookOption[];
  canModerate: boolean;
}) {
  return (
    <Card className="border-zinc-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-zinc-950">
          <Send className="size-4 text-stone-500" />
          Share with the club
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={createCommunityPostAction} className="space-y-4">
          <input type="hidden" name="redirectTo" value="/community" />
          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <div className="space-y-2">
              <Label htmlFor="post-type">Post type</Label>
              <select
                id="post-type"
                name="postType"
                defaultValue="GENERAL"
                className="flex h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
              >
                {communityPostTypeValues
                  .filter(
                    (postType) =>
                      postType !== "NEW_MEMBER_WELCOME" &&
                      (canModerate || postType !== "ANNOUNCEMENT"),
                  )
                  .map((postType) => (
                    <option key={postType} value={postType}>
                      {postTypeLabels[postType]}
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="related-book">Related book</Label>
              <select
                id="related-book"
                name="relatedBookId"
                defaultValue=""
                className="flex h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
              >
                <option value="">No related book</option>
                {books.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.title} by {book.author}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="post-body">Post text</Label>
            <Textarea
              id="post-body"
              name="body"
              rows={5}
              placeholder="Share a reflection, reading update, recommendation, or listening note."
            />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="listening-title">Listening title</Label>
              <Input id="listening-title" name="listeningTitle" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="listening-creator">Creator</Label>
              <Input id="listening-creator" name="listeningCreator" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="listening-url">Listening URL</Label>
              <Input
                id="listening-url"
                name="listeningUrl"
                type="url"
                placeholder="https://..."
              />
            </div>
          </div>
          <p className="text-xs leading-5 text-stone-500">
            Listening fields are used for currently-listening posts. Book
            recommendations need a related book and recommendation text.
          </p>
          <button
            type="submit"
            className="min-h-11 w-full rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-stone-300 sm:w-auto"
          >
            Share post
          </button>
        </form>
      </CardContent>
    </Card>
  );
}

function ReportForm({
  targetId,
  targetType,
}: {
  targetId: string;
  targetType: "post" | "comment";
}) {
  const action =
    targetType === "post" ? reportCommunityPostAction : reportPostCommentAction;

  return (
    <details className="rounded-xl border border-stone-200 bg-stone-50/70 p-3">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
        Report
      </summary>
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="redirectTo" value="/community" />
        <input
          type="hidden"
          name={targetType === "post" ? "postId" : "commentId"}
          value={targetId}
        />
        <div className="space-y-2">
          <Label htmlFor={`report-reason-${targetId}`}>Reason</Label>
          <select
            id={`report-reason-${targetId}`}
            name="reason"
            className="flex h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
          >
            {reportReasons.map((reason) => (
              <option key={reason} value={reason}>
                {reason}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`report-details-${targetId}`}>Details</Label>
          <Textarea id={`report-details-${targetId}`} name="details" rows={3} />
        </div>
        <button
          type="submit"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-amber-200/70"
        >
          <Flag className="size-4" />
          Send report
        </button>
      </form>
    </details>
  );
}

function ReactionControls({
  post,
  viewerId,
  canParticipate,
}: {
  post: FeedPost;
  viewerId: string;
  canParticipate: boolean;
}) {
  const viewerReaction = post.reactions.find(
    (reaction) => reaction.userId === viewerId,
  )?.reactionType;
  const counts = post.reactions.reduce<Record<string, number>>(
    (summary, reaction) => {
      summary[reaction.reactionType] = (summary[reaction.reactionType] ?? 0) + 1;
      return summary;
    },
    {},
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {postReactionTypeValues.map((reactionType) => {
          const selected = viewerReaction === reactionType;

          return (
            <form key={reactionType} action={reactToPostAction}>
              <input type="hidden" name="redirectTo" value="/community" />
              <input type="hidden" name="postId" value={post.id} />
              <input type="hidden" name="reactionType" value={reactionType} />
              <button
                type="submit"
                disabled={!canParticipate}
                aria-label={`${reactionLabels[reactionType]} reaction`}
                className={
                  selected
                    ? "min-h-10 rounded-full border border-stone-900 bg-stone-900 px-3 py-1.5 text-xs font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-stone-300 disabled:cursor-not-allowed disabled:opacity-50"
                    : "min-h-10 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:border-stone-300 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-stone-200 disabled:cursor-not-allowed disabled:opacity-50"
                }
              >
                {reactionLabels[reactionType]}
                {counts[reactionType] ? ` ${counts[reactionType]}` : ""}
              </button>
            </form>
          );
        })}
      </div>
      {viewerReaction && canParticipate ? (
        <form action={removePostReactionAction}>
          <input type="hidden" name="redirectTo" value="/community" />
          <input type="hidden" name="postId" value={post.id} />
          <button
            type="submit"
            className="text-xs font-medium text-stone-500 underline-offset-4 hover:text-stone-900 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-stone-200"
          >
            Remove my reaction
          </button>
        </form>
      ) : null}
    </div>
  );
}

function PostManagement({
  post,
  viewerId,
  canModerate,
  canParticipate,
  books,
}: {
  post: FeedPost;
  viewerId: string;
  canModerate: boolean;
  canParticipate: boolean;
  books: BookOption[];
}) {
  const isAuthor = post.authorId === viewerId;
  const authorCanManage = isAuthor && canParticipate;

  if (!authorCanManage && !canModerate) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50/70 p-3">
      <div className="flex flex-wrap gap-2">
        {canModerate ? (
          <>
            <form action={setPostPinnedAction}>
              <input type="hidden" name="redirectTo" value="/community" />
              <input type="hidden" name="postId" value={post.id} />
              <input
                type="hidden"
                name="isPinned"
                value={post.isPinned ? "false" : "true"}
              />
              <button
                type="submit"
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-stone-300 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-stone-200"
              >
                {post.isPinned ? (
                  <PinOff className="size-4" />
                ) : (
                  <Pin className="size-4" />
                )}
                {post.isPinned ? "Unpin" : "Pin"}
              </button>
            </form>
          </>
        ) : null}
        {(authorCanManage || canModerate) ? (
          <form action={softDeleteCommunityPostAction}>
            <input type="hidden" name="redirectTo" value="/community" />
            <input type="hidden" name="postId" value={post.id} />
            <button
              type="submit"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-rose-200"
            >
              <Trash2 className="size-4" />
              Remove
            </button>
          </form>
        ) : null}
      </div>
      {authorCanManage ? (
        <details>
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
            Edit post
          </summary>
          <form action={editCommunityPostAction} className="mt-3 space-y-3">
            <input type="hidden" name="redirectTo" value="/community" />
            <input type="hidden" name="postId" value={post.id} />
            <div className="space-y-2">
              <Label htmlFor={`edit-body-${post.id}`}>Post text</Label>
              <Textarea
                id={`edit-body-${post.id}`}
                name="body"
                rows={4}
                defaultValue={post.body}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`edit-book-${post.id}`}>Related book</Label>
                <select
                  id={`edit-book-${post.id}`}
                  name="relatedBookId"
                  defaultValue={post.relatedBookId ?? ""}
                  className="flex h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                >
                  <option value="">No related book</option>
                  {books.map((book) => (
                    <option key={book.id} value={book.id}>
                      {book.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`edit-listening-title-${post.id}`}>
                  Listening title
                </Label>
                <Input
                  id={`edit-listening-title-${post.id}`}
                  name="listeningTitle"
                  defaultValue={post.listeningTitle ?? ""}
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`edit-listening-creator-${post.id}`}>
                  Listening creator
                </Label>
                <Input
                  id={`edit-listening-creator-${post.id}`}
                  name="listeningCreator"
                  defaultValue={post.listeningCreator ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`edit-listening-url-${post.id}`}>
                  Listening URL
                </Label>
                <Input
                  id={`edit-listening-url-${post.id}`}
                  name="listeningUrl"
                  type="url"
                  defaultValue={post.listeningUrl ?? ""}
                />
              </div>
            </div>
            <button
              type="submit"
              className="min-h-10 rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-stone-300"
            >
              Save post
            </button>
          </form>
        </details>
      ) : null}
    </div>
  );
}

function CommentComposer({
  postId,
  parentCommentId,
  label,
}: {
  postId: string;
  parentCommentId?: string;
  label: string;
}) {
  const fieldId = `comment-${parentCommentId ?? postId}`;

  return (
    <form action={createPostCommentAction} className="space-y-2">
      <input type="hidden" name="redirectTo" value="/community" />
      <input type="hidden" name="postId" value={postId} />
      {parentCommentId ? (
        <input type="hidden" name="parentCommentId" value={parentCommentId} />
      ) : null}
      <Label htmlFor={fieldId}>{label}</Label>
      <Textarea
        id={fieldId}
        name="body"
        rows={3}
      />
      <button
        type="submit"
        className="min-h-10 rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-stone-300"
      >
        Comment
      </button>
    </form>
  );
}

function CommentItem({
  comment,
  postId,
  viewerId,
  canModerate,
  canParticipate,
  isReply = false,
}: {
  comment: FeedComment | FeedReply;
  postId: string;
  viewerId: string;
  canModerate: boolean;
  canParticipate: boolean;
  isReply?: boolean;
}) {
  const isAuthor = comment.authorId === viewerId;
  const authorCanManage = isAuthor && canParticipate;

  return (
    <div
      className={
        isReply
          ? "ml-6 rounded-xl border border-stone-200 bg-white p-3"
          : "rounded-xl border border-stone-200 bg-[rgba(255,251,244,0.75)] p-3"
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <AuthorIdentity
          author={comment.author}
          viewerId={viewerId}
          timestamp={comment.createdAt}
        />
        {comment.editedAt ? (
          <span className="text-xs text-stone-500">edited</span>
        ) : null}
      </div>
      <p className="mt-3 whitespace-pre-line text-sm leading-6 text-stone-700">
        {comment.body}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {authorCanManage ? (
          <details className="w-full rounded-lg border border-stone-200 bg-white p-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
              Edit comment
            </summary>
            <form action={editPostCommentAction} className="mt-3 space-y-2">
              <input type="hidden" name="redirectTo" value="/community" />
              <input type="hidden" name="commentId" value={comment.id} />
              <Label htmlFor={`edit-comment-${comment.id}`}>Comment</Label>
              <Textarea
                id={`edit-comment-${comment.id}`}
                name="body"
                rows={3}
                defaultValue={comment.body}
              />
              <button
                type="submit"
                className="min-h-10 rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-stone-300"
              >
                Save comment
              </button>
            </form>
          </details>
        ) : null}
        {(authorCanManage || canModerate) ? (
          <form action={softDeletePostCommentAction}>
            <input type="hidden" name="redirectTo" value="/community" />
            <input type="hidden" name="commentId" value={comment.id} />
            <button
              type="submit"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-rose-200"
            >
              <Trash2 className="size-4" />
              Remove
            </button>
          </form>
        ) : null}
      </div>
      {canParticipate ? (
        <div className="mt-3">
          <ReportForm targetType="comment" targetId={comment.id} />
        </div>
      ) : null}
      {!isReply && canParticipate ? (
        <div className="mt-4 border-t border-stone-200 pt-4">
          <CommentComposer
            postId={postId}
            parentCommentId={comment.id}
            label="Reply"
          />
        </div>
      ) : null}
      {"replies" in comment && comment.replies.length > 0 ? (
        <div className="mt-4 space-y-3">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              postId={postId}
              viewerId={viewerId}
              canModerate={canModerate}
              canParticipate={canParticipate}
              isReply
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FeedPostCard({
  post,
  viewerId,
  canModerate,
  canParticipate,
  books,
}: {
  post: FeedPost;
  viewerId: string;
  canModerate: boolean;
  canParticipate: boolean;
  books: BookOption[];
}) {
  const listeningUrl = getSafeHttpUrl(post.listeningUrl);
  const hasBookmark = post.bookmarks.length > 0;

  return (
    <Card className="border-zinc-200 bg-white shadow-sm">
      <CardContent className="space-y-5 pt-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-3">
            <AuthorIdentity
              author={post.author}
              viewerId={viewerId}
              timestamp={post.createdAt}
            />
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={post.isPinned ? "amber" : "sky"}>
                {post.isPinned ? "pinned" : formatLabel(post.postType)}
              </StatusBadge>
              {post.editedAt ? <StatusBadge>edited</StatusBadge> : null}
            </div>
          </div>
          {canParticipate ? (
            <form action={togglePostBookmarkAction}>
              <input type="hidden" name="redirectTo" value="/community" />
              <input type="hidden" name="postId" value={post.id} />
              <button
                type="submit"
                aria-label={hasBookmark ? "Remove bookmark" : "Bookmark post"}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-stone-300 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-stone-200"
              >
                {hasBookmark ? (
                  <BookmarkCheck className="size-4" />
                ) : (
                  <Bookmark className="size-4" />
                )}
                {hasBookmark ? "Saved" : "Save"}
              </button>
            </form>
          ) : null}
        </div>

        {post.body ? (
          <p className="whitespace-pre-line text-base leading-7 text-stone-800">
            {post.body}
          </p>
        ) : null}

        {post.relatedBook ? (
          <div className="rounded-xl border border-stone-200 bg-[rgba(255,251,244,0.75)] p-4">
            <div className="flex items-start gap-3">
              <BookOpenText className="mt-0.5 size-4 shrink-0 text-stone-500" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                  Related book
                </p>
                <p className="mt-1 text-sm font-medium text-stone-900">
                  {post.relatedBook.title}
                </p>
                <p className="text-sm text-stone-600">
                  {post.relatedBook.author}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {post.listeningTitle ? (
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
            <div className="flex items-start gap-3">
              <Headphones className="mt-0.5 size-4 shrink-0 text-stone-500" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                  Currently listening
                </p>
                <p className="mt-1 text-sm font-medium text-stone-900">
                  {post.listeningTitle}
                </p>
                {post.listeningCreator ? (
                  <p className="text-sm text-stone-600">
                    {post.listeningCreator}
                  </p>
                ) : null}
                {listeningUrl ? (
                  <a
                    href={listeningUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex text-sm font-medium text-stone-950 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-stone-200"
                  >
                    Open listening link
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <ReactionControls
          post={post}
          viewerId={viewerId}
          canParticipate={canParticipate}
        />

        <PostManagement
          post={post}
          viewerId={viewerId}
          canModerate={canModerate}
          canParticipate={canParticipate}
          books={books}
        />

        {canParticipate ? (
          <ReportForm targetType="post" targetId={post.id} />
        ) : null}

        <section className="space-y-4 border-t border-stone-200 pt-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
            <MessageCircle className="size-4 text-stone-500" />
            Comments
          </div>
          {post.comments.length > 0 ? (
            <div className="space-y-3">
              {post.comments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  postId={post.id}
                  viewerId={viewerId}
                  canModerate={canModerate}
                  canParticipate={canParticipate}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-500">
              No comments yet. The first thoughtful reply can change the room.
            </p>
          )}
          {canParticipate ? (
            <CommentComposer postId={post.id} label="Add a comment" />
          ) : null}
        </section>
      </CardContent>
    </Card>
  );
}

export default async function CommunityPage() {
  const user = await requireSessionUser();
  const data = await getCommunityPageData(user.id);
  const canParticipate = canParticipateInClub(user, data.viewerMembership);
  const canModerate = canModerateClub(user, data.viewerMembership);

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm sm:p-6">
        <SectionHeading
          eyebrow="Community"
          title="Club feed"
          description="A shared room for reading updates, recommendations, listening notes, and the small sparks that keep Sonder alive between meetings."
          action={
            canModerate ? (
              <Link
                href="/community/moderation"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-stone-300 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-stone-200"
              >
                Moderation
              </Link>
            ) : null
          }
        />
      </section>

      {!canParticipate ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm">
          Guests can browse the community feed. Active members can post,
          comment, react, bookmark, and report.
        </section>
      ) : null}

      {canParticipate ? (
        <PostComposer books={data.books} canModerate={canModerate} />
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-stone-950">
              Latest from the room
            </h2>
            <p className="text-sm text-stone-600">
              Showing pinned posts first, then the {COMMUNITY_FEED_LIMIT} most
              recent visible posts.
            </p>
          </div>
        </div>
        {data.posts.length > 0 ? (
          <div className="space-y-4">
            {data.posts.map((post) => (
              <FeedPostCard
                key={post.id}
                post={post}
                viewerId={user.id}
                canModerate={canModerate}
                canParticipate={canParticipate}
                books={data.books}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No community posts yet"
            description="When members start sharing reflections, recommendations, and listening notes, they will appear here."
          />
        )}
      </section>
    </div>
  );
}
