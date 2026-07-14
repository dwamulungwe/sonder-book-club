"use server";

import {
  CommunityPostType,
  ContentReportStatus,
  PostReactionType,
} from "@prisma/client";

import {
  commentSchema,
  communityPostSchema,
  contentReportSchema,
  reactionSchema,
  reportReviewSchema,
} from "@/features/community/schemas";
import {
  notifyCommunityComment,
  notifyCommunityReaction,
  notifyCommunityReply,
} from "@/features/notifications/service";
import { db } from "@/lib/db";
import { getOptionalString, getString } from "@/lib/form-data";
import { redirectWithNotice, resolveReturnPath } from "@/lib/navigation";
import {
  canModerateClub,
  canParticipateInClub,
} from "@/lib/permissions";
import { requireMembershipContext } from "@/lib/session";

async function requireCommunityParticipant(redirectTo: string) {
  const { user, membership } = await requireMembershipContext();

  if (!canParticipateInClub(user, membership)) {
    redirectWithNotice(
      redirectTo,
      "error",
      "Only active members can participate in the community feed.",
    );
  }

  return { user, membership };
}

async function requireCommunityModerator(redirectTo: string) {
  const { user, membership } = await requireMembershipContext();

  if (!canModerateClub(user, membership)) {
    redirectWithNotice(
      redirectTo,
      "error",
      "You do not have permission to moderate community content.",
    );
  }

  return { user, membership };
}

async function ensureRelatedBookExists(
  relatedBookId: string | undefined,
  redirectTo: string,
) {
  if (!relatedBookId) {
    return;
  }

  const book = await db.book.findFirst({
    where: {
      id: relatedBookId,
      deletedAt: null,
    },
    select: {
      id: true,
    },
  });

  if (!book) {
    redirectWithNotice(redirectTo, "error", "Related book not found.");
  }
}

function getCommunityPostInput(formData: FormData, postType?: CommunityPostType) {
  return {
    postType: postType ?? getString(formData, "postType"),
    body: getOptionalString(formData, "body"),
    relatedBookId: getOptionalString(formData, "relatedBookId"),
    listeningTitle: getOptionalString(formData, "listeningTitle"),
    listeningCreator: getOptionalString(formData, "listeningCreator"),
    listeningUrl: getOptionalString(formData, "listeningUrl"),
  };
}

function getCheckbox(formData: FormData, field: string) {
  return formData.get(field) === "on";
}

export async function createCommunityPostAction(formData: FormData) {
  const redirectTo = resolveReturnPath(formData, "/community");
  const { user, membership } = await requireCommunityParticipant(redirectTo);
  const parsed = communityPostSchema.safeParse(getCommunityPostInput(formData));

  if (!parsed.success) {
    redirectWithNotice(
      redirectTo,
      "error",
      parsed.error.issues[0]?.message ?? "Unable to share the post.",
    );
  }

  if (
    parsed.data.postType === CommunityPostType.ANNOUNCEMENT &&
    !canModerateClub(user, membership)
  ) {
    redirectWithNotice(
      redirectTo,
      "error",
      "Only moderators and admins can share announcement posts.",
    );
  }

  if (parsed.data.postType === CommunityPostType.NEW_MEMBER_WELCOME) {
    redirectWithNotice(
      redirectTo,
      "error",
      "Welcome posts are created by the membership approval flow.",
    );
  }

  await ensureRelatedBookExists(parsed.data.relatedBookId, redirectTo);

  await db.communityPost.create({
    data: {
      authorId: user.id,
      body: parsed.data.body ?? "",
      postType: parsed.data.postType as CommunityPostType,
      relatedBookId: parsed.data.relatedBookId,
      listeningTitle: parsed.data.listeningTitle,
      listeningCreator: parsed.data.listeningCreator,
      listeningUrl: parsed.data.listeningUrl,
    },
  });

  redirectWithNotice(redirectTo, "success", "Post shared with the community.");
}

export async function editCommunityPostAction(formData: FormData) {
  const postId = getString(formData, "postId");
  const redirectTo = resolveReturnPath(formData, "/community");
  const { user } = await requireCommunityParticipant(redirectTo);
  const post = await db.communityPost.findFirst({
    where: {
      id: postId,
      deletedAt: null,
    },
  });

  if (!post) {
    redirectWithNotice(redirectTo, "error", "Post not found.");
  }

  if (post.authorId !== user.id) {
    redirectWithNotice(redirectTo, "error", "You can only edit your own posts.");
  }

  const parsed = communityPostSchema.safeParse(
    getCommunityPostInput(formData, post.postType),
  );

  if (!parsed.success) {
    redirectWithNotice(
      redirectTo,
      "error",
      parsed.error.issues[0]?.message ?? "Unable to update the post.",
    );
  }

  await ensureRelatedBookExists(parsed.data.relatedBookId, redirectTo);

  await db.communityPost.update({
    where: {
      id: postId,
    },
    data: {
      body: parsed.data.body ?? "",
      relatedBookId: parsed.data.relatedBookId,
      listeningTitle: parsed.data.listeningTitle,
      listeningCreator: parsed.data.listeningCreator,
      listeningUrl: parsed.data.listeningUrl,
      editedAt: new Date(),
    },
  });

  redirectWithNotice(redirectTo, "success", "Post updated.");
}

export async function softDeleteCommunityPostAction(formData: FormData) {
  const postId = getString(formData, "postId");
  const redirectTo = resolveReturnPath(formData, "/community");
  const { user, membership } = await requireMembershipContext();
  const post = await db.communityPost.findFirst({
    where: {
      id: postId,
      deletedAt: null,
    },
  });

  if (!post) {
    redirectWithNotice(redirectTo, "error", "Post not found.");
  }

  const canDelete =
    canModerateClub(user, membership) ||
    (canParticipateInClub(user, membership) && post.authorId === user.id);

  if (!canDelete) {
    redirectWithNotice(
      redirectTo,
      "error",
      "You do not have permission to remove this post.",
    );
  }

  await db.communityPost.update({
    where: {
      id: postId,
    },
    data: {
      deletedAt: new Date(),
      isPinned: false,
    },
  });

  redirectWithNotice(redirectTo, "success", "Post removed from the feed.");
}

export async function setPostPinnedAction(formData: FormData) {
  const postId = getString(formData, "postId");
  const redirectTo = resolveReturnPath(formData, "/community");
  await requireCommunityModerator(redirectTo);
  const post = await db.communityPost.findFirst({
    where: {
      id: postId,
      deletedAt: null,
    },
    select: {
      id: true,
      author: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });

  if (!post) {
    redirectWithNotice(redirectTo, "error", "Post not found.");
  }

  await db.communityPost.update({
    where: {
      id: postId,
    },
    data: {
      isPinned: getString(formData, "isPinned") === "true",
    },
  });

  redirectWithNotice(redirectTo, "success", "Post pin updated.");
}

export async function createPostCommentAction(formData: FormData) {
  const postId = getString(formData, "postId");
  const parentCommentId = getOptionalString(formData, "parentCommentId");
  const redirectTo = resolveReturnPath(formData, "/community");
  const { user } = await requireCommunityParticipant(redirectTo);
  const parsed = commentSchema.safeParse({
    body: getString(formData, "body"),
  });

  if (!parsed.success) {
    redirectWithNotice(
      redirectTo,
      "error",
      parsed.error.issues[0]?.message ?? "Unable to comment.",
    );
  }

  const post = await db.communityPost.findFirst({
    where: {
      id: postId,
      deletedAt: null,
    },
    select: {
      id: true,
      author: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });

  if (!post) {
    redirectWithNotice(redirectTo, "error", "Post not found.");
  }

  let parentComment:
    | {
        id: string;
        postId: string;
        parentCommentId: string | null;
        author: {
          id: string;
          email: string | null;
          name: string | null;
        };
      }
    | null = null;

  if (parentCommentId) {
    parentComment = await db.postComment.findFirst({
      where: {
        id: parentCommentId,
        deletedAt: null,
      },
      select: {
        id: true,
        postId: true,
        parentCommentId: true,
        author: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!parentComment || parentComment.postId !== postId) {
      redirectWithNotice(redirectTo, "error", "Parent comment not found.");
    }

    if (parentComment.parentCommentId) {
      redirectWithNotice(
        redirectTo,
        "error",
        "Replies can only be one level deep for now.",
      );
    }
  }

  await db.$transaction(async (tx) => {
    const comment = await tx.postComment.create({
      data: {
        postId,
        parentCommentId,
        authorId: user.id,
        body: parsed.data.body,
      },
      select: {
        id: true,
      },
    });

    if (parentComment) {
      await notifyCommunityReply(tx, {
        postId,
        commentId: comment.id,
        parentCommentId: parentComment.id,
        recipient: parentComment.author,
        actor: {
          id: user.id,
          name: user.name,
        },
      });
      return;
    }

    await notifyCommunityComment(tx, {
      postId,
      commentId: comment.id,
      recipient: post.author,
      actor: {
        id: user.id,
        name: user.name,
      },
    });
  });

  redirectWithNotice(redirectTo, "success", "Comment added.");
}

export async function editPostCommentAction(formData: FormData) {
  const commentId = getString(formData, "commentId");
  const redirectTo = resolveReturnPath(formData, "/community");
  const { user } = await requireCommunityParticipant(redirectTo);
  const parsed = commentSchema.safeParse({
    body: getString(formData, "body"),
  });

  if (!parsed.success) {
    redirectWithNotice(
      redirectTo,
      "error",
      parsed.error.issues[0]?.message ?? "Unable to update the comment.",
    );
  }

  const comment = await db.postComment.findFirst({
    where: {
      id: commentId,
      deletedAt: null,
    },
    select: {
      authorId: true,
    },
  });

  if (!comment) {
    redirectWithNotice(redirectTo, "error", "Comment not found.");
  }

  if (comment.authorId !== user.id) {
    redirectWithNotice(
      redirectTo,
      "error",
      "You can only edit your own comments.",
    );
  }

  await db.postComment.update({
    where: {
      id: commentId,
    },
    data: {
      body: parsed.data.body,
      editedAt: new Date(),
    },
  });

  redirectWithNotice(redirectTo, "success", "Comment updated.");
}

export async function softDeletePostCommentAction(formData: FormData) {
  const commentId = getString(formData, "commentId");
  const redirectTo = resolveReturnPath(formData, "/community");
  const { user, membership } = await requireMembershipContext();
  const comment = await db.postComment.findFirst({
    where: {
      id: commentId,
      deletedAt: null,
    },
    select: {
      authorId: true,
    },
  });

  if (!comment) {
    redirectWithNotice(redirectTo, "error", "Comment not found.");
  }

  const canDelete =
    canModerateClub(user, membership) ||
    (canParticipateInClub(user, membership) && comment.authorId === user.id);

  if (!canDelete) {
    redirectWithNotice(
      redirectTo,
      "error",
      "You do not have permission to remove this comment.",
    );
  }

  await db.postComment.update({
    where: {
      id: commentId,
    },
    data: {
      deletedAt: new Date(),
    },
  });

  redirectWithNotice(redirectTo, "success", "Comment removed.");
}

export async function reactToPostAction(formData: FormData) {
  const postId = getString(formData, "postId");
  const redirectTo = resolveReturnPath(formData, "/community");
  const { user } = await requireCommunityParticipant(redirectTo);
  const parsed = reactionSchema.safeParse({
    reactionType: getString(formData, "reactionType"),
  });

  if (!parsed.success) {
    redirectWithNotice(redirectTo, "error", "Choose a valid reaction.");
  }

  const post = await db.communityPost.findFirst({
    where: {
      id: postId,
      deletedAt: null,
    },
    select: {
      id: true,
      author: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });

  if (!post) {
    redirectWithNotice(redirectTo, "error", "Post not found.");
  }

  await db.$transaction(async (tx) => {
    await tx.postReaction.upsert({
      where: {
        postId_userId: {
          postId,
          userId: user.id,
        },
      },
      update: {
        reactionType: parsed.data.reactionType as PostReactionType,
        createdAt: new Date(),
      },
      create: {
        postId,
        userId: user.id,
        reactionType: parsed.data.reactionType as PostReactionType,
      },
    });

    await notifyCommunityReaction(tx, {
      postId,
      recipient: post.author,
      actor: {
        id: user.id,
        name: user.name,
      },
    });
  });

  redirectWithNotice(redirectTo, "success", "Reaction updated.");
}

export async function removePostReactionAction(formData: FormData) {
  const postId = getString(formData, "postId");
  const redirectTo = resolveReturnPath(formData, "/community");
  const { user } = await requireCommunityParticipant(redirectTo);

  await db.postReaction.deleteMany({
    where: {
      postId,
      userId: user.id,
    },
  });

  redirectWithNotice(redirectTo, "success", "Reaction removed.");
}

export async function togglePostBookmarkAction(formData: FormData) {
  const postId = getString(formData, "postId");
  const redirectTo = resolveReturnPath(formData, "/community");
  const { user } = await requireCommunityParticipant(redirectTo);
  const post = await db.communityPost.findFirst({
    where: {
      id: postId,
      deletedAt: null,
    },
    select: {
      id: true,
    },
  });

  if (!post) {
    redirectWithNotice(redirectTo, "error", "Post not found.");
  }

  const existingBookmark = await db.postBookmark.findUnique({
    where: {
      postId_userId: {
        postId,
        userId: user.id,
      },
    },
  });

  if (existingBookmark) {
    await db.postBookmark.delete({
      where: {
        id: existingBookmark.id,
      },
    });

    redirectWithNotice(redirectTo, "success", "Bookmark removed.");
  }

  await db.postBookmark.create({
    data: {
      postId,
      userId: user.id,
    },
  });

  redirectWithNotice(redirectTo, "success", "Post bookmarked.");
}

export async function reportCommunityPostAction(formData: FormData) {
  const postId = getString(formData, "postId");
  const redirectTo = resolveReturnPath(formData, "/community");
  const { user } = await requireCommunityParticipant(redirectTo);
  const parsed = contentReportSchema.safeParse({
    reason: getString(formData, "reason"),
    details: getOptionalString(formData, "details"),
  });

  if (!parsed.success) {
    redirectWithNotice(
      redirectTo,
      "error",
      parsed.error.issues[0]?.message ?? "Unable to report this post.",
    );
  }

  const post = await db.communityPost.findFirst({
    where: {
      id: postId,
      deletedAt: null,
    },
    select: {
      id: true,
    },
  });

  if (!post) {
    redirectWithNotice(redirectTo, "error", "Post not found.");
  }

  await db.contentReport.create({
    data: {
      postId,
      reporterId: user.id,
      reason: parsed.data.reason,
      details: parsed.data.details,
    },
  });

  redirectWithNotice(redirectTo, "success", "Post report submitted.");
}

export async function reportPostCommentAction(formData: FormData) {
  const commentId = getString(formData, "commentId");
  const redirectTo = resolveReturnPath(formData, "/community");
  const { user } = await requireCommunityParticipant(redirectTo);
  const parsed = contentReportSchema.safeParse({
    reason: getString(formData, "reason"),
    details: getOptionalString(formData, "details"),
  });

  if (!parsed.success) {
    redirectWithNotice(
      redirectTo,
      "error",
      parsed.error.issues[0]?.message ?? "Unable to report this comment.",
    );
  }

  const comment = await db.postComment.findFirst({
    where: {
      id: commentId,
      deletedAt: null,
      post: {
        deletedAt: null,
      },
    },
    select: {
      id: true,
    },
  });

  if (!comment) {
    redirectWithNotice(redirectTo, "error", "Comment not found.");
  }

  await db.contentReport.create({
    data: {
      commentId,
      reporterId: user.id,
      reason: parsed.data.reason,
      details: parsed.data.details,
    },
  });

  redirectWithNotice(redirectTo, "success", "Comment report submitted.");
}

export async function reviewContentReportAction(formData: FormData) {
  const reportId = getString(formData, "reportId");
  const redirectTo = resolveReturnPath(formData, "/community/moderation");
  const { user } = await requireCommunityModerator(redirectTo);
  const parsed = reportReviewSchema.safeParse({
    status: getString(formData, "status"),
    deleteReportedContent: getCheckbox(formData, "deleteReportedContent"),
  });

  if (!parsed.success) {
    redirectWithNotice(
      redirectTo,
      "error",
      parsed.error.issues[0]?.message ?? "Unable to update the report.",
    );
  }

  const report = await db.contentReport.findUnique({
    where: {
      id: reportId,
    },
    select: {
      id: true,
      postId: true,
      commentId: true,
    },
  });

  if (!report) {
    redirectWithNotice(redirectTo, "error", "Report not found.");
  }

  if (!report.postId && !report.commentId) {
    redirectWithNotice(redirectTo, "error", "Report target is missing.");
  }

  const now = new Date();

  await db.$transaction(async (tx) => {
    await tx.contentReport.update({
      where: {
        id: reportId,
      },
      data: {
        status: parsed.data.status as ContentReportStatus,
        reviewedById: user.id,
        reviewedAt: now,
      },
    });

    if (parsed.data.deleteReportedContent && report.postId) {
      await tx.communityPost.update({
        where: {
          id: report.postId,
        },
        data: {
          deletedAt: now,
          isPinned: false,
        },
      });
    }

    if (parsed.data.deleteReportedContent && report.commentId) {
      await tx.postComment.update({
        where: {
          id: report.commentId,
        },
        data: {
          deletedAt: now,
        },
      });
    }
  });

  redirectWithNotice(redirectTo, "success", "Report updated.");
}
