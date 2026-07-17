import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import {
  AttendanceStatus,
  BillingInterval,
  BookStatus,
  CommunityPostType,
  EmailDeliveryClass,
  EmailOutboxStatus,
  InvoiceStatus,
  MembershipApplicationStatus,
  MembershipStatus,
  NotificationType,
  PaymentMethod,
  PaymentStatus,
  PollStatus,
  PostReactionType,
  PrismaClient,
  RsvpStatus,
  SubscriptionStatus,
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
      notificationPreference: {
        create: {},
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

  await prisma.contentReport.deleteMany();
  await prisma.emailOutbox.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.membershipApplication.deleteMany();
  await prisma.postBookmark.deleteMany();
  await prisma.postReaction.deleteMany();
  await prisma.postComment.deleteMany();
  await prisma.communityPost.deleteMany();
  await prisma.pollVote.deleteMany();
  await prisma.pollOption.deleteMany();
  await prisma.poll.deleteMany();
  await prisma.bookNomination.deleteMany();
  await prisma.meetingAttendance.deleteMany();
  await prisma.meetingRsvp.deleteMany();
  await prisma.meetingNote.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.readingProgress.deleteMany();
  await prisma.readingTarget.deleteMany();
  await prisma.readingPlan.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.membershipPayment.deleteMany();
  await prisma.membershipInvoice.deleteMany();
  await prisma.memberSubscription.deleteMany();
  await prisma.membershipPlan.deleteMany();
  await prisma.book.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.memberProfile.deleteMany();
  await prisma.notificationPreference.deleteMany();
  await prisma.clubSettings.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.user.deleteMany();

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

  const guest = await createUserWithMembership({
    name: "Mwila Banda",
    email: "guest@bookclub.dev",
    passwordHash: sharedPassword,
    role: SystemRole.GUEST,
  });

  const submittedApplicant = await createUserWithMembership({
    name: "Amina Sitali",
    email: "amina.applicant@bookclub.dev",
    passwordHash: sharedPassword,
    role: SystemRole.GUEST,
    status: MembershipStatus.PENDING,
  });

  const reviewApplicant = await createUserWithMembership({
    name: "Tadala Nkonde",
    email: "tadala.review@bookclub.dev",
    passwordHash: sharedPassword,
    role: SystemRole.GUEST,
    status: MembershipStatus.PENDING,
  });

  const waitlistedApplicant = await createUserWithMembership({
    name: "Misozi Lungu",
    email: "misozi.waitlist@bookclub.dev",
    passwordHash: sharedPassword,
    role: SystemRole.GUEST,
    status: MembershipStatus.PENDING,
  });

  await prisma.notificationPreference.update({
    where: {
      userId: member.id,
    },
    data: {
      emailCommunityActivity: true,
      emailAnnouncements: true,
      emailMeetingUpdates: true,
    },
  });

  await prisma.notificationPreference.update({
    where: {
      userId: memberTwo.id,
    },
    data: {
      emailAnnouncements: true,
    },
  });

  const adminMembership = await prisma.membership.findUniqueOrThrow({
    where: {
      userId: admin.id,
    },
  });
  const memberMembership = await prisma.membership.findUniqueOrThrow({
    where: {
      userId: member.id,
    },
  });
  const memberTwoMembership = await prisma.membership.findUniqueOrThrow({
    where: {
      userId: memberTwo.id,
    },
  });

  const monthlyPlan = await prisma.membershipPlan.create({
    data: {
      name: "Monthly membership",
      description: "Standard monthly Sonder membership dues.",
      amountMinor: BigInt(25000),
      currency: "ZMW",
      billingInterval: BillingInterval.MONTHLY,
      intervalCount: 1,
      isActive: true,
      isDefault: true,
      createdById: admin.id,
    },
  });

  await prisma.membershipPlan.create({
    data: {
      name: "Annual membership",
      description: "Annual Sonder membership dues for members paying ahead.",
      amountMinor: BigInt(270000),
      currency: "ZMW",
      billingInterval: BillingInterval.ANNUAL,
      intervalCount: 1,
      isActive: true,
      isDefault: false,
      createdById: admin.id,
    },
  });

  await prisma.membershipPlan.create({
    data: {
      name: "Founding member historical",
      description: "Inactive historical dues plan retained for billing history.",
      amountMinor: BigInt(18000),
      currency: "ZMW",
      billingInterval: BillingInterval.MONTHLY,
      intervalCount: 1,
      isActive: false,
      isDefault: false,
      createdById: admin.id,
    },
  });

  await prisma.memberSubscription.create({
    data: {
      membershipId: adminMembership.id,
      planId: monthlyPlan.id,
      status: SubscriptionStatus.ACTIVE,
      startedAt: addDays(now, -35),
      currentPeriodStart: addDays(now, -5),
      currentPeriodEnd: addDays(now, 25),
      nextBillingAt: addDays(now, 25),
    },
  });

  const activeSubscription = await prisma.memberSubscription.create({
    data: {
      membershipId: memberMembership.id,
      planId: monthlyPlan.id,
      status: SubscriptionStatus.ACTIVE,
      startedAt: addDays(now, -45),
      currentPeriodStart: addDays(now, -15),
      currentPeriodEnd: addDays(now, 15),
      nextBillingAt: addDays(now, 15),
    },
  });

  await prisma.memberSubscription.create({
    data: {
      membershipId: memberTwoMembership.id,
      planId: monthlyPlan.id,
      status: SubscriptionStatus.WAIVED,
      startedAt: addDays(now, -40),
      currentPeriodStart: addDays(now, -10),
      currentPeriodEnd: addDays(now, 20),
      nextBillingAt: null,
      waiverReason: "Community scholarship for the current cycle.",
    },
  });

  const openInvoice = await prisma.membershipInvoice.create({
    data: {
      membershipId: memberMembership.id,
      subscriptionId: activeSubscription.id,
      invoiceNumber: "INV-SEED-OPEN",
      status: InvoiceStatus.OPEN,
      description: "Monthly membership dues",
      amountDueMinor: BigInt(25000),
      amountPaidMinor: BigInt(0),
      currency: "ZMW",
      periodStart: activeSubscription.currentPeriodStart,
      periodEnd: activeSubscription.currentPeriodEnd,
      dueAt: addDays(now, 7),
      createdById: admin.id,
    },
  });

  const paidInvoice = await prisma.membershipInvoice.create({
    data: {
      membershipId: memberMembership.id,
      subscriptionId: activeSubscription.id,
      invoiceNumber: "INV-SEED-PAID",
      status: InvoiceStatus.PAID,
      description: "Previous monthly membership dues",
      amountDueMinor: BigInt(25000),
      amountPaidMinor: BigInt(25000),
      currency: "ZMW",
      periodStart: addDays(activeSubscription.currentPeriodStart, -30),
      periodEnd: activeSubscription.currentPeriodStart,
      dueAt: addDays(now, -20),
      paidAt: addDays(now, -14),
      createdById: admin.id,
    },
  });

  const overdueInvoice = await prisma.membershipInvoice.create({
    data: {
      membershipId: memberMembership.id,
      subscriptionId: activeSubscription.id,
      invoiceNumber: "INV-SEED-OVERDUE",
      status: InvoiceStatus.OVERDUE,
      description: "Older monthly membership dues",
      amountDueMinor: BigInt(25000),
      amountPaidMinor: BigInt(5000),
      currency: "ZMW",
      periodStart: addDays(activeSubscription.currentPeriodStart, -60),
      periodEnd: addDays(activeSubscription.currentPeriodStart, -30),
      dueAt: addDays(now, -35),
      createdById: admin.id,
    },
  });

  await prisma.membershipPayment.createMany({
    data: [
      {
        membershipId: memberMembership.id,
        invoiceId: openInvoice.id,
        amountMinor: BigInt(25000),
        currency: "ZMW",
        status: PaymentStatus.PENDING,
        method: PaymentMethod.BANK_TRANSFER,
        externalReference: "BANK-SEED-PENDING",
        internalReference: "PAY-SEED-PENDING",
        dueAt: openInvoice.dueAt,
        paidAt: addDays(now, -1),
        periodStart: openInvoice.periodStart,
        periodEnd: openInvoice.periodEnd,
        notes: "Awaiting bank statement verification.",
        recordedById: admin.id,
        idempotencyKey: "seed:payment:pending",
      },
      {
        membershipId: memberMembership.id,
        invoiceId: paidInvoice.id,
        amountMinor: BigInt(15000),
        currency: "ZMW",
        status: PaymentStatus.CONFIRMED,
        method: PaymentMethod.CASH,
        externalReference: "CASH-SEED-001",
        internalReference: "PAY-SEED-CASH",
        dueAt: paidInvoice.dueAt,
        paidAt: addDays(now, -15),
        confirmedAt: addDays(now, -14),
        confirmedById: admin.id,
        periodStart: paidInvoice.periodStart,
        periodEnd: paidInvoice.periodEnd,
        notes: "Cash received at meeting.",
        recordedById: admin.id,
        idempotencyKey: "seed:payment:cash",
      },
      {
        membershipId: memberMembership.id,
        invoiceId: paidInvoice.id,
        amountMinor: BigInt(10000),
        currency: "ZMW",
        status: PaymentStatus.CONFIRMED,
        method: PaymentMethod.MOBILE_MONEY,
        externalReference: "MM-SEED-001",
        internalReference: "PAY-SEED-MOBILE",
        dueAt: paidInvoice.dueAt,
        paidAt: addDays(now, -14),
        confirmedAt: addDays(now, -14),
        confirmedById: admin.id,
        periodStart: paidInvoice.periodStart,
        periodEnd: paidInvoice.periodEnd,
        notes: "Mobile-money confirmation reviewed.",
        recordedById: admin.id,
        idempotencyKey: "seed:payment:mobile",
      },
      {
        membershipId: memberMembership.id,
        invoiceId: overdueInvoice.id,
        amountMinor: BigInt(5000),
        currency: "ZMW",
        status: PaymentStatus.CONFIRMED,
        method: PaymentMethod.CASH,
        externalReference: "CASH-SEED-PARTIAL",
        internalReference: "PAY-SEED-PARTIAL",
        dueAt: overdueInvoice.dueAt,
        paidAt: addDays(now, -28),
        confirmedAt: addDays(now, -28),
        confirmedById: admin.id,
        periodStart: overdueInvoice.periodStart,
        periodEnd: overdueInvoice.periodEnd,
        notes: "Partial cash payment; balance remains overdue.",
        recordedById: admin.id,
        idempotencyKey: "seed:payment:partial",
      },
    ],
  });

  await prisma.memberProfile.createMany({
    data: [
      {
        userId: admin.id,
        bio: "Founder of the Sonder reading room, drawn to books that make people linger after the last page.",
        phoneNumber: "+260 97 555 0142",
        location: "Lusaka",
        occupation: "Product strategist",
        profileImageUrl:
          "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80",
        favouriteGenres: ["Literary fiction", "African literature", "Memoir"],
        favouriteBooks: "Homegoing, Open City, The Memory of Love",
        readingInterests:
          "Memory, friendship, cities, and the quiet architecture of belonging.",
        currentlyReadingText: "Tomorrow, and Tomorrow, and Tomorrow",
        currentlyListeningTitle: "The Moth",
        currentlyListeningCreator: "The Moth Podcast",
        currentlyListeningUrl: "https://themoth.org/podcast",
      },
      {
        userId: moderator.id,
        bio: "Keeps discussions generous, precise, and a little mischievous when the room gets too quiet.",
        phoneNumber: "+260 96 555 0188",
        location: "Kabulonga",
        occupation: "Literature teacher",
        profileImageUrl:
          "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=600&q=80",
        favouriteGenres: ["Speculative fiction", "Poetry", "Short stories"],
        favouriteBooks: "Beloved, The Left Hand of Darkness, A Mercy",
        readingInterests:
          "Worldbuilding, voice, feminist classics, and books that reward rereading.",
        currentlyReadingText: "Sea of Tranquility",
        currentlyListeningTitle: "On Being",
        currentlyListeningCreator: "Krista Tippett",
        currentlyListeningUrl: "https://onbeing.org/series/podcast/",
      },
      {
        userId: member.id,
        bio: "A steady highlighter of strange sentences and an enthusiastic recommender of short novels.",
        phoneNumber: "+260 95 555 0131",
        location: "Roma",
        occupation: "Architect",
        favouriteGenres: ["Science fiction", "Novellas", "Essays"],
        favouriteBooks: "The Dispossessed, Small Things Like These, Braiding Sweetgrass",
        readingInterests:
          "Climate, design, friendship, and books with careful structures.",
        currentlyReadingText: "The Left Hand of Darkness",
        currentlyListeningTitle: "Heavyweight",
        currentlyListeningCreator: "Gimlet",
        currentlyListeningUrl: "https://gimletmedia.com/shows/heavyweight",
      },
      {
        userId: memberTwo.id,
        bio: "Usually arrives with a passage marked, a playlist queued, and a question that opens the room.",
        phoneNumber: "+260 97 555 0194",
        location: "Woodlands",
        occupation: "Brand designer",
        profileImageUrl:
          "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=600&q=80",
        favouriteGenres: ["Historical fiction", "Contemporary romance", "Food writing"],
        favouriteBooks: "Hamnet, The Vanishing Half, Like Water for Chocolate",
        readingInterests:
          "Family stories, sensory writing, migration, and books with memorable meals.",
        currentlyReadingText: "Tomorrow, and Tomorrow, and Tomorrow",
        currentlyListeningTitle: "Song Exploder",
        currentlyListeningCreator: "Hrishikesh Hirway",
        currentlyListeningUrl: "https://songexploder.net/",
      },
      {
        userId: guest.id,
        bio: "New to the circle and browsing the shelves before joining the next live discussion.",
        location: "Longacres",
        occupation: "Graduate student",
        favouriteGenres: ["Mystery", "African literature"],
        favouriteBooks: "The Shadow King, My Sister, the Serial Killer",
        readingInterests:
          "Sharp plots, contemporary African writing, and books that move quickly.",
        currentlyReadingText: "My Sister, the Serial Killer",
      },
      {
        userId: submittedApplicant.id,
        phoneNumber: "+260 96 555 0211",
        location: "Lusaka",
        occupation: "Journalist",
        favouriteGenres: ["Memoir", "Literary fiction", "Essays"],
        favouriteBooks: "Stay True, Nervous Conditions, The Year of Magical Thinking",
        readingInterests:
          "Personal essays, books about memory, and stories that make ordinary days feel charged.",
      },
      {
        userId: reviewApplicant.id,
        phoneNumber: "+260 97 555 0212",
        location: "Kabwe",
        occupation: "Civil engineer",
        favouriteGenres: ["Historical fiction", "African literature"],
        favouriteBooks: "The Old Drift, Homegoing",
        readingInterests:
          "Zambian writing, historical fiction, and books that open conversations about place.",
      },
      {
        userId: waitlistedApplicant.id,
        phoneNumber: "+260 95 555 0213",
        location: "Ndola",
        occupation: "Counsellor",
        favouriteGenres: ["Poetry", "Short stories", "Psychology"],
        favouriteBooks: "The Prophet, What It Means When a Man Falls from the Sky",
        readingInterests:
          "Short forms, reflective nonfiction, and books that help people speak honestly.",
      },
    ],
  });

  const currentBook = await prisma.book.create({
    data: {
      createdById: admin.id,
      title: "Tomorrow, and Tomorrow, and Tomorrow",
      author: "Gabrielle Zevin",
      genre: "Literary fiction",
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

  const generalPost = await prisma.communityPost.create({
    data: {
      authorId: memberTwo.id,
      postType: CommunityPostType.GENERAL,
      body: "This week I keep thinking about how friendship changes when people start building things together. What line stayed with everyone else?",
    },
  });

  const readingUpdatePost = await prisma.communityPost.create({
    data: {
      authorId: admin.id,
      postType: CommunityPostType.READING_UPDATE,
      relatedBookId: currentBook.id,
      body: "I am through the midpoint and the creative partnership is getting thornier in the best way. Logging my progress before Sunday's check-in.",
      isPinned: true,
    },
  });

  const recommendationPost = await prisma.communityPost.create({
    data: {
      authorId: moderator.id,
      postType: CommunityPostType.BOOK_RECOMMENDATION,
      relatedBookId: backlogBook.id,
      body: "Recommending this for a shorter speculative month. It has enough tenderness and structure to carry a very good discussion.",
    },
  });

  const listeningPost = await prisma.communityPost.create({
    data: {
      authorId: member.id,
      postType: CommunityPostType.CURRENTLY_LISTENING,
      body: "Pairing this episode with the current read because it keeps circling memory, art, and what collaboration asks from people.",
      listeningTitle: "Heavyweight",
      listeningCreator: "Gimlet",
      listeningUrl: "https://gimletmedia.com/shows/heavyweight",
    },
  });

  const chipoWelcomePost = await prisma.communityPost.create({
    data: {
      authorId: memberTwo.id,
      postType: CommunityPostType.NEW_MEMBER_WELCOME,
      body: "Welcome Chipo Mwanza to Sonder. We are glad to have another reader in the room.",
      createdAt: addDays(now, -12),
    },
  });

  await prisma.membershipApplication.createMany({
    data: [
      {
        applicantUserId: submittedApplicant.id,
        fullName: "Amina Sitali",
        normalizedEmail: "amina.applicant@bookclub.dev",
        email: "amina.applicant@bookclub.dev",
        phoneNumber: "+260 96 555 0211",
        location: "Lusaka",
        occupation: "Journalist",
        readingInterests:
          "Personal essays, books about memory, and stories that make ordinary days feel charged.",
        favouriteGenres: ["Memoir", "Literary fiction", "Essays"],
        favouriteBooks: "Stay True, Nervous Conditions, The Year of Magical Thinking",
        reasonForJoining:
          "I miss being in a room where people take books seriously without making the conversation stiff.",
        referralSource: "Instagram",
        acceptedCommunityRules: true,
        acceptedPrivacyPolicy: true,
        status: MembershipApplicationStatus.SUBMITTED,
        submittedAt: addDays(now, -2),
      },
      {
        applicantUserId: reviewApplicant.id,
        fullName: "Tadala Nkonde",
        normalizedEmail: "tadala.review@bookclub.dev",
        email: "tadala.review@bookclub.dev",
        phoneNumber: "+260 97 555 0212",
        location: "Kabwe",
        occupation: "Civil engineer",
        readingInterests:
          "Zambian writing, historical fiction, and books that open conversations about place.",
        favouriteGenres: ["Historical fiction", "African literature"],
        favouriteBooks: "The Old Drift, Homegoing",
        reasonForJoining:
          "I want a consistent reading practice and a community that can help me discover more regional writing.",
        referralSource: "Friend referral",
        acceptedCommunityRules: true,
        acceptedPrivacyPolicy: true,
        status: MembershipApplicationStatus.UNDER_REVIEW,
        submittedAt: addDays(now, -5),
        reviewedAt: addDays(now, -1),
        reviewedById: moderator.id,
        reviewNotes:
          "Thoughtful application. Ask about Saturday availability before approval.",
      },
      {
        applicantUserId: waitlistedApplicant.id,
        fullName: "Misozi Lungu",
        normalizedEmail: "misozi.waitlist@bookclub.dev",
        email: "misozi.waitlist@bookclub.dev",
        phoneNumber: "+260 95 555 0213",
        location: "Ndola",
        occupation: "Counsellor",
        readingInterests:
          "Short forms, reflective nonfiction, and books that help people speak honestly.",
        favouriteGenres: ["Poetry", "Short stories", "Psychology"],
        favouriteBooks: "The Prophet, What It Means When a Man Falls from the Sky",
        reasonForJoining:
          "The club feels like the kind of gentle accountability I need to read beyond work material.",
        referralSource: "Public event",
        acceptedCommunityRules: true,
        acceptedPrivacyPolicy: true,
        status: MembershipApplicationStatus.WAITLISTED,
        submittedAt: addDays(now, -10),
        reviewedAt: addDays(now, -4),
        reviewedById: admin.id,
        reviewNotes:
          "Strong fit, but waitlist until the next intake window opens.",
      },
      {
        applicantUserId: memberTwo.id,
        fullName: "Chipo Mwanza",
        normalizedEmail: "chipo@bookclub.dev",
        email: "chipo@bookclub.dev",
        phoneNumber: "+260 97 555 0194",
        location: "Woodlands",
        occupation: "Brand designer",
        readingInterests:
          "Family stories, sensory writing, migration, and books with memorable meals.",
        favouriteGenres: ["Historical fiction", "Contemporary romance", "Food writing"],
        favouriteBooks: "Hamnet, The Vanishing Half, Like Water for Chocolate",
        reasonForJoining:
          "I wanted a thoughtful local reading rhythm and a group that notices style as much as plot.",
        referralSource: "Founder invitation",
        acceptedCommunityRules: true,
        acceptedPrivacyPolicy: true,
        status: MembershipApplicationStatus.APPROVED,
        submittedAt: addDays(now, -21),
        reviewedAt: addDays(now, -12),
        reviewedById: admin.id,
        reviewNotes:
          "Approved during the community foundation intake. Welcome post linked.",
        welcomePostId: chipoWelcomePost.id,
      },
    ],
  });

  const firstComment = await prisma.postComment.create({
    data: {
      postId: generalPost.id,
      authorId: moderator.id,
      body: "The bit about ambition feeling generous and selfish at the same time. I marked it twice.",
    },
  });

  const replyComment = await prisma.postComment.create({
    data: {
      postId: generalPost.id,
      authorId: member.id,
      parentCommentId: firstComment.id,
      body: "Same. It made the studio scenes feel much less tidy.",
    },
  });

  const recommendationComment = await prisma.postComment.create({
    data: {
      postId: recommendationPost.id,
      authorId: memberTwo.id,
      body: "I would absolutely read this next. It sounds like a good bridge after the current book.",
    },
  });

  await prisma.postReaction.createMany({
    data: [
      {
        postId: generalPost.id,
        userId: admin.id,
        reactionType: PostReactionType.MADE_ME_THINK,
      },
      {
        postId: generalPost.id,
        userId: moderator.id,
        reactionType: PostReactionType.INSIGHTFUL,
      },
      {
        postId: readingUpdatePost.id,
        userId: member.id,
        reactionType: PostReactionType.I_AGREE,
      },
      {
        postId: recommendationPost.id,
        userId: memberTwo.id,
        reactionType: PostReactionType.ADDING_TO_MY_LIST,
      },
      {
        postId: listeningPost.id,
        userId: admin.id,
        reactionType: PostReactionType.APPLAUSE,
      },
    ],
  });

  await prisma.postBookmark.create({
    data: {
      postId: recommendationPost.id,
      userId: member.id,
    },
  });

  await prisma.notification.createMany({
    data: [
      {
        recipientId: member.id,
        actorId: admin.id,
        type: NotificationType.ANNOUNCEMENT_PUBLISHED,
        title: "New announcement",
        message: "New Sonder announcement: Bring your favorite quote",
        href: "/announcements",
        entityType: "announcement",
        entityId: "seed-announcement-quote",
        dedupeKey: "seed:notification:announcement:member",
      },
      {
        recipientId: member.id,
        actorId: moderator.id,
        type: NotificationType.MEETING_UPDATED,
        title: "Meeting update",
        message: "There is a Sonder meeting update for Midpoint discussion.",
        href: "/meetings",
        entityType: "meeting",
        entityId: upcomingMeeting.id,
        dedupeKey: "seed:notification:meeting:member",
        readAt: addDays(now, -1),
      },
      {
        recipientId: reviewApplicant.id,
        type: NotificationType.APPLICATION_UNDER_REVIEW,
        title: "Application under review",
        message: "Your Sonder application is now under review.",
        href: "/application-status",
        entityType: "membership_application",
        entityId: "seed-application-under-review",
        dedupeKey: "seed:notification:application:review",
      },
      {
        recipientId: moderator.id,
        actorId: member.id,
        type: NotificationType.COMMUNITY_REPLY,
        title: "New reply",
        message: "Lukundo Phiri replied to your comment.",
        href: "/community",
        entityType: "post_comment",
        entityId: replyComment.id,
        dedupeKey: "seed:notification:community:reply",
      },
      {
        recipientId: moderator.id,
        actorId: memberTwo.id,
        type: NotificationType.COMMUNITY_COMMENT,
        title: "New comment",
        message: "Chipo Mwanza commented on your community post.",
        href: "/community",
        entityType: "post_comment",
        entityId: recommendationComment.id,
        dedupeKey: "seed:notification:community:comment",
      },
    ],
  });

  await prisma.emailOutbox.createMany({
    data: [
      {
        recipientUserId: submittedApplicant.id,
        toEmail: submittedApplicant.email,
        normalizedToEmail: submittedApplicant.email.toLowerCase(),
        templateKey: "application_received",
        subject: "Sonder received your application",
        textBody:
          "Thank you for applying to join Sonder Book Club. You can check your status at /application-status.",
        htmlBody:
          "<p>Thank you for applying to join Sonder Book Club.</p><p>You can check your status at /application-status.</p>",
        payload: {
          textBody:
            "Thank you for applying to join Sonder Book Club. You can check your status at /application-status.",
          htmlBody:
            "<p>Thank you for applying to join Sonder Book Club.</p><p>You can check your status at /application-status.</p>",
          statusHref: "/application-status",
        },
        status: EmailOutboxStatus.PENDING,
        dedupeKey: "seed:email:application:received",
      },
      {
        recipientUserId: member.id,
        toEmail: member.email,
        normalizedToEmail: member.email.toLowerCase(),
        templateKey: "announcement_published",
        subject: "Sonder announcement: Reading plan update",
        textBody:
          "A new Sonder announcement was published. Read it at /announcements.",
        htmlBody:
          "<p>A new Sonder announcement was published.</p><p>Read it at /announcements.</p>",
        deliveryClass: EmailDeliveryClass.PREFERENCE_CONTROLLED,
        payload: {
          textBody:
            "A new Sonder announcement was published. Read it at /announcements.",
          htmlBody:
            "<p>A new Sonder announcement was published.</p><p>Read it at /announcements.</p>",
          announcementHref: "/announcements",
        },
        status: EmailOutboxStatus.FAILED,
        attempts: 5,
        maxAttempts: 5,
        failedAt: now,
        lastFailureCategory: "seed_failure",
        lastFailureCode: "provider_unavailable",
        lastFailureRetryable: true,
        lastError: "Development provider unavailable.",
        dedupeKey: "seed:email:announcement:failed",
      },
      {
        recipientUserId: memberTwo.id,
        toEmail: memberTwo.email,
        normalizedToEmail: memberTwo.email.toLowerCase(),
        templateKey: "meeting_updated",
        subject: "Sonder meeting update: Midpoint discussion",
        textBody:
          "There is a meeting update for Midpoint discussion. Open /meetings.",
        htmlBody:
          "<p>There is a meeting update for Midpoint discussion.</p><p>Open /meetings.</p>",
        deliveryClass: EmailDeliveryClass.PREFERENCE_CONTROLLED,
        payload: {
          textBody:
            "There is a meeting update for Midpoint discussion. Open /meetings.",
          htmlBody:
            "<p>There is a meeting update for Midpoint discussion.</p><p>Open /meetings.</p>",
          meetingHref: "/meetings",
        },
        status: EmailOutboxStatus.SENT,
        attempts: 1,
        sentAt: addDays(now, -1),
        provider: "legacy",
        providerMessageId: "dev-seed-message",
        dedupeKey: "seed:email:meeting:sent",
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
