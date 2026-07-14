-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('APPLICATION_SUBMITTED', 'APPLICATION_UNDER_REVIEW', 'APPLICATION_APPROVED', 'APPLICATION_REJECTED', 'APPLICATION_WAITLISTED', 'COMMUNITY_COMMENT', 'COMMUNITY_REPLY', 'COMMUNITY_REACTION', 'ANNOUNCEMENT_PUBLISHED', 'MEETING_UPDATED', 'NEW_MEMBER_WELCOME');

-- CreateEnum
CREATE TYPE "EmailOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "href" VARCHAR(500),
    "entityType" VARCHAR(80),
    "entityId" VARCHAR(120),
    "dedupeKey" VARCHAR(240),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "userId" TEXT NOT NULL,
    "inAppCommunityActivity" BOOLEAN NOT NULL DEFAULT true,
    "inAppAnnouncements" BOOLEAN NOT NULL DEFAULT true,
    "inAppApplicationUpdates" BOOLEAN NOT NULL DEFAULT true,
    "emailCommunityActivity" BOOLEAN NOT NULL DEFAULT false,
    "emailAnnouncements" BOOLEAN NOT NULL DEFAULT false,
    "emailApplicationUpdates" BOOLEAN NOT NULL DEFAULT true,
    "emailMeetingUpdates" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "email_outbox" (
    "id" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "toEmail" VARCHAR(255) NOT NULL,
    "templateKey" VARCHAR(120) NOT NULL,
    "subject" VARCHAR(240) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "EmailOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "dedupeKey" VARCHAR(240) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMP(3),
    "processingStartedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "providerMessageId" VARCHAR(255),
    "lastError" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupeKey_key" ON "notifications"("dedupeKey");

-- CreateIndex
CREATE INDEX "notifications_recipientId_readAt_createdAt_idx" ON "notifications"("recipientId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_recipientId_createdAt_idx" ON "notifications"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_actorId_createdAt_idx" ON "notifications"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_type_createdAt_idx" ON "notifications"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "email_outbox_dedupeKey_key" ON "email_outbox"("dedupeKey");

-- CreateIndex
CREATE INDEX "email_outbox_status_nextAttemptAt_idx" ON "email_outbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "email_outbox_status_createdAt_idx" ON "email_outbox"("status", "createdAt");

-- CreateIndex
CREATE INDEX "email_outbox_createdAt_idx" ON "email_outbox"("createdAt");

-- CreateIndex
CREATE INDEX "email_outbox_recipientUserId_createdAt_idx" ON "email_outbox"("recipientUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
