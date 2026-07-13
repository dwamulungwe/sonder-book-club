import { ContentReportStatus, BookStatus } from "@prisma/client";

import { getClubSettings } from "@/lib/club";
import { db } from "@/lib/db";
import { getMembershipForUser } from "@/lib/session";

export const COMMUNITY_FEED_LIMIT = 20;
export const RECENT_COMMUNITY_POST_LIMIT = 3;
export const MODERATION_REPORT_LIMIT = 30;

function communityPostInclude(userId: string) {
  return {
    author: {
      include: {
        profile: true,
      },
    },
    relatedBook: true,
    reactions: true,
    bookmarks: {
      where: {
        userId,
      },
    },
    comments: {
      where: {
        deletedAt: null,
        parentCommentId: null,
      },
      include: {
        author: {
          include: {
            profile: true,
          },
        },
        replies: {
          where: {
            deletedAt: null,
          },
          include: {
            author: {
              include: {
                profile: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc" as const,
          },
        },
      },
      orderBy: {
        createdAt: "asc" as const,
      },
    },
  };
}

function recentCommunityPostInclude() {
  return {
    author: {
      include: {
        profile: true,
      },
    },
    relatedBook: true,
  };
}

export async function getCommunityPageData(userId: string) {
  const [club, viewerMembership, books, posts] = await Promise.all([
    getClubSettings(),
    getMembershipForUser(userId),
    db.book.findMany({
      where: {
        deletedAt: null,
        status: {
          not: BookStatus.ARCHIVED,
        },
      },
      orderBy: [
        { status: "asc" },
        { title: "asc" },
      ],
    }),
    db.communityPost.findMany({
      where: {
        deletedAt: null,
      },
      include: communityPostInclude(userId),
      orderBy: [
        { isPinned: "desc" },
        { createdAt: "desc" },
      ],
      take: COMMUNITY_FEED_LIMIT,
    }),
  ]);

  return {
    club,
    viewerMembership,
    books,
    posts,
    limit: COMMUNITY_FEED_LIMIT,
  };
}

export async function getRecentCommunityPosts() {
  return db.communityPost.findMany({
    where: {
      deletedAt: null,
    },
    include: recentCommunityPostInclude(),
    orderBy: [
      { isPinned: "desc" },
      { createdAt: "desc" },
    ],
    take: RECENT_COMMUNITY_POST_LIMIT,
  });
}

export async function getCommunityModerationData(userId: string) {
  const [club, viewerMembership, reports] = await Promise.all([
    getClubSettings(),
    getMembershipForUser(userId),
    db.contentReport.findMany({
      where: {
        status: {
          in: [ContentReportStatus.OPEN, ContentReportStatus.REVIEWING],
        },
      },
      include: {
        reporter: {
          include: {
            profile: true,
          },
        },
        reviewedBy: {
          include: {
            profile: true,
          },
        },
        post: {
          include: {
            author: {
              include: {
                profile: true,
              },
            },
            relatedBook: true,
          },
        },
        comment: {
          include: {
            author: {
              include: {
                profile: true,
              },
            },
            post: {
              include: {
                author: {
                  include: {
                    profile: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: MODERATION_REPORT_LIMIT,
    }),
  ]);

  return {
    club,
    viewerMembership,
    reports,
    limit: MODERATION_REPORT_LIMIT,
  };
}
