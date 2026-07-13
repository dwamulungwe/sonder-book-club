import {
  BookStatus,
  MembershipStatus,
  PollStatus,
} from "@prisma/client";

import { getRecentCommunityPosts } from "@/features/community/queries";
import { getClubSettings } from "@/lib/club";
import { db } from "@/lib/db";
import { getProgressState } from "@/lib/progress";
import { getMembershipForUser } from "@/lib/session";

export async function getClubShellData() {
  return getClubSettings();
}

export async function getDashboardData(userId: string) {
  const [club, viewerMembership, memberCount, currentBook, nextMeeting, activePlan, recentAnnouncements, openPollCount, recentCommunityPosts] =
    await Promise.all([
      getClubSettings(),
      getMembershipForUser(userId),
      db.membership.count({
        where: {
          status: MembershipStatus.ACTIVE,
        },
      }),
      db.book.findFirst({
        where: {
          status: BookStatus.CURRENT,
        },
        orderBy: {
          updatedAt: "desc",
        },
      }),
      db.meeting.findFirst({
        where: {
          startsAt: {
            gte: new Date(),
          },
        },
        include: {
          rsvps: true,
        },
        orderBy: {
          startsAt: "asc",
        },
      }),
      db.readingPlan.findFirst({
        where: {
          isActive: true,
        },
        include: {
          book: true,
          targets: {
            include: {
              progresses: {
                where: {
                  memberId: userId,
                },
                take: 1,
              },
            },
            orderBy: {
              sequence: "asc",
            },
          },
        },
        orderBy: {
          startsOn: "desc",
        },
      }),
      db.announcement.findMany({
        include: {
          createdBy: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 4,
      }),
      db.poll.count({
        where: {
          status: {
            in: [PollStatus.DRAFT, PollStatus.OPEN],
          },
        },
      }),
      getRecentCommunityPosts(),
    ]);

  const progressSummary =
    activePlan?.targets.reduce(
      (summary, target) => {
        const state = getProgressState(target.endsOn, target.progresses[0]);

        summary.total += 1;

        if (state === "completed") {
          summary.completed += 1;
        } else if (state === "behind") {
          summary.behind += 1;
        } else {
          summary.onTrack += 1;
        }

        return summary;
      },
      {
        total: 0,
        completed: 0,
        behind: 0,
        onTrack: 0,
      },
    ) ?? {
      total: 0,
      completed: 0,
      behind: 0,
      onTrack: 0,
    };

  return {
    club,
    viewerMembership,
    memberCount,
    currentBook,
    nextMeeting,
    activePlan,
    recentAnnouncements,
    openPollCount,
    recentCommunityPosts,
    progressSummary,
  };
}

export async function getBooksPageData(userId: string) {
  const [club, viewerMembership, books] = await Promise.all([
    getClubSettings(),
    getMembershipForUser(userId),
    db.book.findMany({
      orderBy: [
        { status: "asc" },
        { createdAt: "desc" },
      ],
    }),
  ]);

  return {
    club,
    viewerMembership,
    books,
  };
}

export async function getReadingPlansPageData(userId: string) {
  const [club, viewerMembership, books, plans] = await Promise.all([
    getClubSettings(),
    getMembershipForUser(userId),
    db.book.findMany({
      where: {
        status: {
          not: BookStatus.ARCHIVED,
        },
      },
      orderBy: [
        { status: "asc" },
        { title: "asc" },
      ],
    }),
    db.readingPlan.findMany({
      include: {
        book: true,
        targets: {
          include: {
            progresses: {
              where: {
                memberId: userId,
              },
              take: 1,
            },
          },
          orderBy: {
            sequence: "asc",
          },
        },
      },
      orderBy: [
        { isActive: "desc" },
        { startsOn: "desc" },
      ],
    }),
  ]);

  return {
    club,
    viewerMembership,
    books,
    plans,
  };
}

export async function getMeetingsPageData(userId: string) {
  const [club, viewerMembership, meetings, members] = await Promise.all([
    getClubSettings(),
    getMembershipForUser(userId),
    db.meeting.findMany({
      include: {
        rsvps: true,
        attendances: true,
      },
      orderBy: {
        startsAt: "asc",
      },
    }),
    db.membership.findMany({
      where: {
        status: MembershipStatus.ACTIVE,
      },
      include: {
        user: true,
      },
      orderBy: {
        joinedAt: "asc",
      },
    }),
  ]);

  return {
    club,
    viewerMembership,
    meetings,
    members,
  };
}

export async function getVotingPageData(userId: string) {
  const [club, viewerMembership, books, nominations, polls] = await Promise.all([
    getClubSettings(),
    getMembershipForUser(userId),
    db.book.findMany({
      where: {
        status: {
          not: BookStatus.ARCHIVED,
        },
      },
      orderBy: [
        { status: "asc" },
        { title: "asc" },
      ],
    }),
    db.bookNomination.findMany({
      include: {
        book: true,
        nominator: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
    db.poll.findMany({
      include: {
        options: {
          include: {
            book: true,
            votes: true,
          },
        },
        votes: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
  ]);

  return {
    club,
    viewerMembership,
    books,
    nominations,
    polls,
  };
}

export async function getAnnouncementsPageData(userId: string) {
  const [club, viewerMembership, announcements] = await Promise.all([
    getClubSettings(),
    getMembershipForUser(userId),
    db.announcement.findMany({
      include: {
        createdBy: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
  ]);

  return {
    club,
    viewerMembership,
    announcements,
  };
}

export async function getMembersPageData(userId: string) {
  const [club, viewerMembership, memberships] = await Promise.all([
    getClubSettings(),
    getMembershipForUser(userId),
    db.membership.findMany({
      include: {
        user: {
          include: {
            profile: true,
          },
        },
      },
      orderBy: [
        { role: "asc" },
        { joinedAt: "asc" },
      ],
    }),
  ]);

  return {
    club,
    viewerMembership,
    memberships,
  };
}

export async function getProfilePageData(userId: string) {
  const [club, profileUser] = await Promise.all([
    getClubSettings(),
    db.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        membership: true,
        profile: true,
      },
    }),
  ]);

  return {
    club,
    profileUser,
  };
}

export async function getAdminPageData(userId: string) {
  const [club, viewerMembership, memberships] = await Promise.all([
    getClubSettings(),
    getMembershipForUser(userId),
    db.membership.findMany({
      include: {
        user: true,
      },
      orderBy: [
        { role: "asc" },
        { joinedAt: "asc" },
      ],
    }),
  ]);

  return {
    club,
    viewerMembership,
    memberships,
  };
}
