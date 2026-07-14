-- AlterEnum
ALTER TYPE "MembershipStatus" ADD VALUE 'PENDING';

-- AlterEnum
ALTER TYPE "CommunityPostType" ADD VALUE 'NEW_MEMBER_WELCOME';

-- CreateEnum
CREATE TYPE "MembershipApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WAITLISTED');

-- CreateTable
CREATE TABLE "membership_applications" (
    "id" TEXT NOT NULL,
    "applicantUserId" TEXT,
    "fullName" VARCHAR(120) NOT NULL,
    "normalizedEmail" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phoneNumber" VARCHAR(40) NOT NULL,
    "location" VARCHAR(120) NOT NULL,
    "occupation" VARCHAR(120),
    "readingInterests" VARCHAR(800) NOT NULL,
    "favouriteGenres" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "favouriteBooks" VARCHAR(800),
    "reasonForJoining" VARCHAR(1200) NOT NULL,
    "referralSource" VARCHAR(200),
    "acceptedCommunityRules" BOOLEAN NOT NULL,
    "acceptedPrivacyPolicy" BOOLEAN NOT NULL,
    "status" "MembershipApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewNotes" VARCHAR(2000),
    "welcomePostId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "membership_applications_welcomePostId_key" ON "membership_applications"("welcomePostId");

-- CreateIndex
CREATE UNIQUE INDEX "membership_applications_unresolved_email_key" ON "membership_applications"("normalizedEmail") WHERE "status" IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'WAITLISTED');

-- CreateIndex
CREATE INDEX "membership_applications_normalizedEmail_status_idx" ON "membership_applications"("normalizedEmail", "status");

-- CreateIndex
CREATE INDEX "membership_applications_status_submittedAt_idx" ON "membership_applications"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "membership_applications_applicantUserId_createdAt_idx" ON "membership_applications"("applicantUserId", "createdAt");

-- CreateIndex
CREATE INDEX "membership_applications_reviewedById_reviewedAt_idx" ON "membership_applications"("reviewedById", "reviewedAt");

-- AddForeignKey
ALTER TABLE "membership_applications" ADD CONSTRAINT "membership_applications_applicantUserId_fkey" FOREIGN KEY ("applicantUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_applications" ADD CONSTRAINT "membership_applications_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_applications" ADD CONSTRAINT "membership_applications_welcomePostId_fkey" FOREIGN KEY ("welcomePostId") REFERENCES "community_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
