import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import {
  AttendanceStatus,
  BookStatus,
  MembershipStatus,
  PollStatus,
  PrismaClient,
  RsvpStatus,
  SystemRole,
  TargetMode,
} from "@prisma/client";
import { hash } from "bcryptjs";

const CLUB_SETTINGS_ID = "main-club";
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

async function createUserWithMembership(input: {
  name: string;
  email: string;
  passwordHash: string;
  role: SystemRole;
  status?: MembershipStatus;
}) {
  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash: input.passwordHash,
      systemRole: input.role,
      membership: {
        create: {
          role: input.role,
          status: input.status ?? MembershipStatus.ACTIVE,
        },
      },
    },
  });
}

async function main() {
  const sharedPassword = await hash("Password123!", 12);
  const now = new Date();
  const nextWeek = addDays(now, 7);
  const twoWeeksOut = addDays(now, 14);
  const lastWeek = addDays(now, -7);

  await prisma.$transaction([
    prisma.pollVote.deleteMany(),
    prisma.pollOption.deleteMany(),
    prisma.poll.deleteMany(),
    prisma.bookNomination.deleteMany(),
    prisma.meetingAttendance.deleteMany(),
    prisma.meetingRsvp.deleteMany(),
    prisma.meetingNote.deleteMany(),
    prisma.meeting.deleteMany(),
    prisma.readingProgress.deleteMany(),
    prisma.readingTarget.deleteMany(),
    prisma.readingPlan.deleteMany(),
    prisma.announcement.deleteMany(),
    prisma.membershipPayment.deleteMany(),
    prisma.book.deleteMany(),
    prisma.membership.deleteMany(),
    prisma.clubSettings.deleteMany(),
    prisma.session.deleteMany(),
    prisma.account.deleteMany(),
    prisma.verificationToken.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  await prisma.clubSettings.create({
    data: {
      id: CLUB_SETTINGS_ID,
      name: "Sonder Book Club",
      description:
        "A warm, minimal reading club with an editorial feel, built for thoughtful books and steady conversation.",
      meetingFrequency: "Every other Saturday at 15:00",
      location: "Longacres Coffee House, Lusaka",
      contactEmail: "hello@sonderbookclub.dev",
      contactPhone: "+260 97 555 0142",
      logoUrl: "/sonder-book-club-logo-cropped.png",
      bannerUrl: null,
    },
  });

  const admin = await createUserWithMembership({
    name: "David Wamulungwe",
    email: "admin@bookclub.dev",
    passwordHash: sharedPassword,
    role: SystemRole.ADMIN,
  });

  const moderator = await createUserWithMembership({
    name: "Ruth Tembo",
    email: "moderator@bookclub.dev",
    passwordHash: sharedPassword,
    role: SystemRole.MODERATOR,
  });

  const member = await createUserWithMembership({
    name: "Lukundo Phiri",
    email: "member@bookclub.dev",
    passwordHash: sharedPassword,
    role: SystemRole.MEMBER,
  });

  const memberTwo = await createUserWithMembership({
    name: "Chipo Mwanza",
    email: "chipo@bookclub.dev",
    passwordHash: sharedPassword,
    role: SystemRole.MEMBER,
  });

  await createUserWithMembership({
    name: "Mwila Banda",
    email: "guest@bookclub.dev",
    passwordHash: sharedPassword,
    role: SystemRole.GUEST,
  });

  const currentBook = await prisma.book.create({
    data: {
      createdById: admin.id,
      title: "Tomorrow, and Tomorrow, and Tomorrow",
      author: "Gabrielle Zevin",
      genre: "Literary fiction",
      isbn: "9780593321201",
      pageCount: 416,
      coverUrl:
        "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=900&q=80",
      summary:
        "A decades-long friendship, creative partnership, and game-making obsession told with warmth and velocity.",
      status: BookStatus.CURRENT,
    },
  });

  const backlogBook = await prisma.book.create({
    data: {
      createdById: moderator.id,
      title: "Sea of Tranquility",
      author: "Emily St. John Mandel",
      genre: "Speculative fiction",
      isbn: "9780593321447",
      pageCount: 272,
      summary:
        "A compact, time-bending novel about plague years, memory, and the echoes that travel with us.",
      status: BookStatus.NOMINATED,
    },
  });

  const secondNominee = await prisma.book.create({
    data: {
      createdById: member.id,
      title: "The Left Hand of Darkness",
      author: "Ursula K. Le Guin",
      genre: "Science fiction",
      isbn: "9780441478125",
      pageCount: 304,
      summary:
        "A diplomatic mission unfolds on a world where politics, climate, and gender all unsettle easy assumptions.",
      status: BookStatus.BACKLOG,
    },
  });

  await prisma.book.create({
    data: {
      createdById: admin.id,
      title: "Hamnet",
      author: "Maggie O'Farrell",
      genre: "Historical fiction",
      pageCount: 320,
      summary:
        "An intimate family portrait threaded through grief, love, and the world around Shakespeare.",
      status: BookStatus.ARCHIVED,
      archivedAt: addDays(now, -45),
    },
  });

  const readingPlan = await prisma.readingPlan.create({
    data: {
      bookId: currentBook.id,
      createdById: admin.id,
      title: "April reading sprint",
      targetMode: TargetMode.PAGES,
      weekCount: 4,
      startsOn: addDays(now, -7),
      endsOn: addDays(now, 20),
      targets: {
        create: [
          {
            sequence: 1,
            label: "Week 1: pages 1-104",
            mode: TargetMode.PAGES,
            startPage: 1,
            endPage: 104,
            startsOn: addDays(now, -7),
            endsOn: addDays(now, -1),
            status: "COMPLETED",
          },
          {
            sequence: 2,
            label: "Week 2: pages 105-208",
            mode: TargetMode.PAGES,
            startPage: 105,
            endPage: 208,
            startsOn: now,
            endsOn: addDays(now, 6),
            status: "IN_PROGRESS",
          },
          {
            sequence: 3,
            label: "Week 3: pages 209-312",
            mode: TargetMode.PAGES,
            startPage: 209,
            endPage: 312,
            startsOn: addDays(now, 7),
            endsOn: addDays(now, 13),
          },
          {
            sequence: 4,
            label: "Week 4: pages 313-416",
            mode: TargetMode.PAGES,
            startPage: 313,
            endPage: 416,
            startsOn: addDays(now, 14),
            endsOn: addDays(now, 20),
          },
        ],
      },
    },
    include: {
      targets: true,
    },
  });

  await prisma.readingProgress.createMany({
    data: [
      {
        targetId: readingPlan.targets[0].id,
        memberId: admin.id,
        percent: 100,
        completedAt: addDays(now, -2),
      },
      {
        targetId: readingPlan.targets[0].id,
        memberId: member.id,
        percent: 100,
        completedAt: addDays(now, -1),
      },
      {
        targetId: readingPlan.targets[1].id,
        memberId: admin.id,
        percent: 82,
        notes: "Just one long section left.",
      },
      {
        targetId: readingPlan.targets[1].id,
        memberId: member.id,
        percent: 45,
        notes: "Will catch up before the weekend.",
      },
      {
        targetId: readingPlan.targets[1].id,
        memberId: memberTwo.id,
        percent: 66,
        notes: "On track and highlighting key passages.",
      },
    ],
  });

  const upcomingMeeting = await prisma.meeting.create({
    data: {
      createdById: moderator.id,
      title: "Midpoint discussion",
      agenda:
        "Character arcs, creative ambition, and what the game studio reveals about loyalty.",
      startsAt: nextWeek,
      location: "Longacres Coffee House",
      meetingLink: "https://meet.google.com/book-club-midpoint",
    },
  });

  const strategyMeeting = await prisma.meeting.create({
    data: {
      createdById: admin.id,
      title: "May shortlist planning",
      agenda: "Refine nomination themes and decide whether to keep alternating genres.",
      startsAt: twoWeeksOut,
      location: "Clubhouse room 3",
    },
  });

  const previousMeeting = await prisma.meeting.create({
    data: {
      createdById: admin.id,
      title: "Kickoff session",
      agenda: "Set expectations, weekly cadence, and discussion roles.",
      startsAt: lastWeek,
      location: "Clubhouse room 3",
      notes:
        "Everyone agreed to a four-week pacing plan and to rotate quote selection each meeting.",
      status: "COMPLETED",
    },
  });

  await prisma.meetingRsvp.createMany({
    data: [
      {
        meetingId: upcomingMeeting.id,
        memberId: admin.id,
        status: RsvpStatus.GOING,
      },
      {
        meetingId: upcomingMeeting.id,
        memberId: moderator.id,
        status: RsvpStatus.GOING,
      },
      {
        meetingId: upcomingMeeting.id,
        memberId: member.id,
        status: RsvpStatus.MAYBE,
      },
      {
        meetingId: strategyMeeting.id,
        memberId: admin.id,
        status: RsvpStatus.GOING,
      },
      {
        meetingId: strategyMeeting.id,
        memberId: moderator.id,
        status: RsvpStatus.GOING,
      },
    ],
  });

  await prisma.meetingAttendance.createMany({
    data: [
      {
        meetingId: previousMeeting.id,
        memberId: admin.id,
        status: AttendanceStatus.ATTENDED,
        recordedById: moderator.id,
      },
      {
        meetingId: previousMeeting.id,
        memberId: moderator.id,
        status: AttendanceStatus.ATTENDED,
        recordedById: admin.id,
      },
      {
        meetingId: previousMeeting.id,
        memberId: member.id,
        status: AttendanceStatus.EXCUSED,
        recordedById: admin.id,
      },
      {
        meetingId: previousMeeting.id,
        memberId: memberTwo.id,
        status: AttendanceStatus.ATTENDED,
        recordedById: admin.id,
      },
    ],
  });

  await prisma.announcement.createMany({
    data: [
      {
        createdById: admin.id,
        title: "Bring your favorite quote",
        body: "For the next meeting, bring one line that captures what ambition costs in the novel.",
      },
      {
        createdById: moderator.id,
        title: "Reading plan update",
        body: "Week two is live. Please log your progress before Sunday so the dashboard stays honest.",
      },
      {
        createdById: admin.id,
        title: "New member welcome",
        body: "Please say hello to Chipo in the members area and add your preferred discussion prompt style.",
      },
    ],
  });

  const nominationOne = await prisma.bookNomination.create({
    data: {
      bookId: backlogBook.id,
      nominatorId: member.id,
      reason: "Compact, emotional, and perfect for a shorter speculative month.",
    },
  });

  const nominationTwo = await prisma.bookNomination.create({
    data: {
      bookId: secondNominee.id,
      nominatorId: moderator.id,
      reason: "A classic that gives us plenty to talk about beyond plot.",
    },
  });

  const openPoll = await prisma.poll.create({
    data: {
      createdById: moderator.id,
      title: "May pick",
      description: "Choose the next club read.",
      status: PollStatus.OPEN,
      opensAt: now,
      closesAt: addDays(now, 3),
      options: {
        create: [
          {
            nominationId: nominationOne.id,
            bookId: backlogBook.id,
          },
          {
            nominationId: nominationTwo.id,
            bookId: secondNominee.id,
          },
        ],
      },
    },
    include: {
      options: true,
    },
  });

  await prisma.pollVote.createMany({
    data: [
      {
        pollId: openPoll.id,
        optionId: openPoll.options[0].id,
        voterId: admin.id,
      },
      {
        pollId: openPoll.id,
        optionId: openPoll.options[1].id,
        voterId: member.id,
      },
      {
        pollId: openPoll.id,
        optionId: openPoll.options[1].id,
        voterId: memberTwo.id,
      },
    ],
  });

  const closedPoll = await prisma.poll.create({
    data: {
      createdById: admin.id,
      title: "March pick",
      description: "Closed archive example.",
      status: PollStatus.CLOSED,
      opensAt: addDays(now, -20),
      closesAt: addDays(now, -14),
      closedAt: addDays(now, -14),
      winningBookId: currentBook.id,
      options: {
        create: [
          {
            nominationId: nominationOne.id,
            bookId: backlogBook.id,
          },
          {
            nominationId: nominationTwo.id,
            bookId: currentBook.id,
          },
        ],
      },
    },
    include: {
      options: true,
    },
  });

  await prisma.pollVote.createMany({
    data: [
      {
        pollId: closedPoll.id,
        optionId: closedPoll.options[1].id,
        voterId: admin.id,
      },
      {
        pollId: closedPoll.id,
        optionId: closedPoll.options[1].id,
        voterId: moderator.id,
      },
      {
        pollId: closedPoll.id,
        optionId: closedPoll.options[0].id,
        voterId: member.id,
      },
    ],
  });

  console.log("Seed complete.");
  console.log("Admin: admin@bookclub.dev / Password123!");
  console.log("Moderator: moderator@bookclub.dev / Password123!");
  console.log("Member: member@bookclub.dev / Password123!");
  console.log("Guest: guest@bookclub.dev / Password123!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
