-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SystemRole" AS ENUM ('ADMIN', 'MODERATOR', 'MEMBER', 'GUEST');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'LEFT');

-- CreateEnum
CREATE TYPE "BookStatus" AS ENUM ('NOMINATED', 'BACKLOG', 'CURRENT', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReadingPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TargetMode" AS ENUM ('PAGES', 'CHAPTERS');

-- CreateEnum
CREATE TYPE "ReadingPlanItemStatus" AS ENUM ('UPCOMING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "RsvpStatus" AS ENUM ('GOING', 'MAYBE', 'DECLINED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PENDING', 'ATTENDED', 'ABSENT', 'EXCUSED');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MeetingNoteVisibility" AS ENUM ('INTERNAL', 'MEMBERS_ONLY');

-- CreateEnum
CREATE TYPE "NominationStatus" AS ENUM ('ACTIVE', 'WITHDRAWN', 'SELECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PollStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'WAIVED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CARD', 'OTHER');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "passwordHash" TEXT,
    "systemRole" "SystemRole" NOT NULL DEFAULT 'GUEST',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_settings" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "meetingFrequency" TEXT,
    "location" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "logoUrl" TEXT,
    "bannerUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "SystemRole" NOT NULL DEFAULT 'MEMBER',
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "books" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "genre" TEXT,
    "isbn" TEXT,
    "pageCount" INTEGER,
    "coverUrl" TEXT,
    "summary" TEXT,
    "status" "BookStatus" NOT NULL DEFAULT 'BACKLOG',
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_plans" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "targetMode" "TargetMode" NOT NULL,
    "status" "ReadingPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "weekCount" INTEGER NOT NULL,
    "chapterCount" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reading_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_plan_items" (
    "id" TEXT NOT NULL,
    "readingPlanId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "mode" "TargetMode" NOT NULL,
    "status" "ReadingPlanItemStatus" NOT NULL DEFAULT 'UPCOMING',
    "startPage" INTEGER,
    "endPage" INTEGER,
    "startChapter" INTEGER,
    "endChapter" INTEGER,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reading_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_progress" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "percent" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "agenda" TEXT,
    "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "meetingLink" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_rsvps" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" "RsvpStatus" NOT NULL DEFAULT 'MAYBE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_rsvps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_attendance" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PENDING',
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_notes" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "visibility" "MeetingNoteVisibility" NOT NULL DEFAULT 'MEMBERS_ONLY',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_nominations" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "nominatorId" TEXT NOT NULL,
    "reason" TEXT,
    "status" "NominationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "book_nominations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "polls" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "PollStatus" NOT NULL DEFAULT 'DRAFT',
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "winningBookId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_options" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "nominationId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "poll_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votes" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_payments" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "method" "PaymentMethod",
    "reference" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "notes" TEXT,
    "recordedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_systemRole_idx" ON "users"("systemRole");

-- CreateIndex
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_userId_key" ON "memberships"("userId");

-- CreateIndex
CREATE INDEX "memberships_status_idx" ON "memberships"("status");

-- CreateIndex
CREATE INDEX "memberships_role_status_idx" ON "memberships"("role", "status");

-- CreateIndex
CREATE INDEX "books_status_idx" ON "books"("status");

-- CreateIndex
CREATE INDEX "books_createdAt_idx" ON "books"("createdAt");

-- CreateIndex
CREATE INDEX "books_deletedAt_idx" ON "books"("deletedAt");

-- CreateIndex
CREATE INDEX "reading_plans_status_idx" ON "reading_plans"("status");

-- CreateIndex
CREATE INDEX "reading_plans_isActive_idx" ON "reading_plans"("isActive");

-- CreateIndex
CREATE INDEX "reading_plans_bookId_idx" ON "reading_plans"("bookId");

-- CreateIndex
CREATE INDEX "reading_plans_deletedAt_idx" ON "reading_plans"("deletedAt");

-- CreateIndex
CREATE INDEX "reading_plan_items_readingPlanId_startsOn_idx" ON "reading_plan_items"("readingPlanId", "startsOn");

-- CreateIndex
CREATE INDEX "reading_plan_items_readingPlanId_status_idx" ON "reading_plan_items"("readingPlanId", "status");

-- CreateIndex
CREATE INDEX "reading_plan_items_deletedAt_idx" ON "reading_plan_items"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "reading_plan_items_readingPlanId_sequence_key" ON "reading_plan_items"("readingPlanId", "sequence");

-- CreateIndex
CREATE INDEX "member_progress_memberId_updatedAt_idx" ON "member_progress"("memberId", "updatedAt");

-- CreateIndex
CREATE INDEX "member_progress_targetId_percent_idx" ON "member_progress"("targetId", "percent");

-- CreateIndex
CREATE UNIQUE INDEX "member_progress_targetId_memberId_key" ON "member_progress"("targetId", "memberId");

-- CreateIndex
CREATE INDEX "meetings_startsAt_idx" ON "meetings"("startsAt");

-- CreateIndex
CREATE INDEX "meetings_status_idx" ON "meetings"("status");

-- CreateIndex
CREATE INDEX "meetings_deletedAt_idx" ON "meetings"("deletedAt");

-- CreateIndex
CREATE INDEX "meeting_rsvps_meetingId_status_idx" ON "meeting_rsvps"("meetingId", "status");

-- CreateIndex
CREATE INDEX "meeting_rsvps_memberId_status_idx" ON "meeting_rsvps"("memberId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_rsvps_meetingId_memberId_key" ON "meeting_rsvps"("meetingId", "memberId");

-- CreateIndex
CREATE INDEX "meeting_attendance_meetingId_status_idx" ON "meeting_attendance"("meetingId", "status");

-- CreateIndex
CREATE INDEX "meeting_attendance_memberId_status_idx" ON "meeting_attendance"("memberId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_attendance_meetingId_memberId_key" ON "meeting_attendance"("meetingId", "memberId");

-- CreateIndex
CREATE INDEX "meeting_notes_meetingId_createdAt_idx" ON "meeting_notes"("meetingId", "createdAt");

-- CreateIndex
CREATE INDEX "meeting_notes_authorId_createdAt_idx" ON "meeting_notes"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "meeting_notes_deletedAt_idx" ON "meeting_notes"("deletedAt");

-- CreateIndex
CREATE INDEX "announcements_createdAt_idx" ON "announcements"("createdAt");

-- CreateIndex
CREATE INDEX "announcements_status_idx" ON "announcements"("status");

-- CreateIndex
CREATE INDEX "announcements_deletedAt_idx" ON "announcements"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "book_nominations_bookId_key" ON "book_nominations"("bookId");

-- CreateIndex
CREATE INDEX "book_nominations_createdAt_idx" ON "book_nominations"("createdAt");

-- CreateIndex
CREATE INDEX "book_nominations_status_idx" ON "book_nominations"("status");

-- CreateIndex
CREATE INDEX "polls_status_idx" ON "polls"("status");

-- CreateIndex
CREATE INDEX "polls_opensAt_idx" ON "polls"("opensAt");

-- CreateIndex
CREATE INDEX "polls_closesAt_idx" ON "polls"("closesAt");

-- CreateIndex
CREATE INDEX "polls_deletedAt_idx" ON "polls"("deletedAt");

-- CreateIndex
CREATE INDEX "poll_options_pollId_idx" ON "poll_options"("pollId");

-- CreateIndex
CREATE UNIQUE INDEX "poll_options_pollId_bookId_key" ON "poll_options"("pollId", "bookId");

-- CreateIndex
CREATE INDEX "votes_optionId_createdAt_idx" ON "votes"("optionId", "createdAt");

-- CreateIndex
CREATE INDEX "votes_voterId_createdAt_idx" ON "votes"("voterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "votes_pollId_voterId_key" ON "votes"("pollId", "voterId");

-- CreateIndex
CREATE UNIQUE INDEX "membership_payments_reference_key" ON "membership_payments"("reference");

-- CreateIndex
CREATE INDEX "membership_payments_membershipId_status_idx" ON "membership_payments"("membershipId", "status");

-- CreateIndex
CREATE INDEX "membership_payments_dueAt_status_idx" ON "membership_payments"("dueAt", "status");

-- CreateIndex
CREATE INDEX "membership_payments_deletedAt_idx" ON "membership_payments"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "membership_payments_membershipId_periodStart_periodEnd_key" ON "membership_payments"("membershipId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_plans" ADD CONSTRAINT "reading_plans_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_plans" ADD CONSTRAINT "reading_plans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_plan_items" ADD CONSTRAINT "reading_plan_items_readingPlanId_fkey" FOREIGN KEY ("readingPlanId") REFERENCES "reading_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_progress" ADD CONSTRAINT "member_progress_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "reading_plan_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_progress" ADD CONSTRAINT "member_progress_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_rsvps" ADD CONSTRAINT "meeting_rsvps_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_rsvps" ADD CONSTRAINT "meeting_rsvps_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendance" ADD CONSTRAINT "meeting_attendance_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendance" ADD CONSTRAINT "meeting_attendance_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendance" ADD CONSTRAINT "meeting_attendance_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_nominations" ADD CONSTRAINT "book_nominations_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_nominations" ADD CONSTRAINT "book_nominations_nominatorId_fkey" FOREIGN KEY ("nominatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "polls" ADD CONSTRAINT "polls_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "polls" ADD CONSTRAINT "polls_winningBookId_fkey" FOREIGN KEY ("winningBookId") REFERENCES "books"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_nominationId_fkey" FOREIGN KEY ("nominationId") REFERENCES "book_nominations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "poll_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_payments" ADD CONSTRAINT "membership_payments_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_payments" ADD CONSTRAINT "membership_payments_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

