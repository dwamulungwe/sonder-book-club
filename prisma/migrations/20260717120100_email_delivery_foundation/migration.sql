-- Change Set 8, phase 2: durable provider-independent email delivery.
-- This migration is additive and preserves every existing email_outbox row.

CREATE TYPE "EmailDeliveryClass" AS ENUM (
  'TRANSACTIONAL',
  'PREFERENCE_CONTROLLED'
);

CREATE TYPE "EmailDeliveryAttemptOutcome" AS ENUM (
  'PROCESSING',
  'ACCEPTED',
  'RETRYABLE_FAILURE',
  'PERMANENT_FAILURE',
  'UNCERTAIN',
  'SUPPRESSED'
);

CREATE TYPE "EmailWebhookProcessingStatus" AS ENUM (
  'RECEIVED',
  'PROCESSED',
  'IGNORED',
  'FAILED',
  'REVIEW_REQUIRED'
);

CREATE TYPE "EmailSuppressionReason" AS ENUM (
  'HARD_BOUNCE',
  'COMPLAINT',
  'PROVIDER_SUPPRESSION',
  'ADMINISTRATIVE',
  'INVALID_ADDRESS'
);

ALTER TABLE "email_outbox"
  ADD COLUMN "normalizedToEmail" VARCHAR(255),
  ADD COLUMN "templateVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "textBody" TEXT,
  ADD COLUMN "htmlBody" TEXT,
  ADD COLUMN "deliveryClass" "EmailDeliveryClass" NOT NULL DEFAULT 'TRANSACTIONAL',
  ADD COLUMN "provider" VARCHAR(32),
  ADD COLUMN "providerIdempotencyKey" VARCHAR(256),
  ADD COLUMN "providerIdempotencyKeyIssuedAt" TIMESTAMP(3),
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "leaseOwner" VARCHAR(120),
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "deliveryDelayedAt" TIMESTAMP(3),
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "failedAt" TIMESTAMP(3),
  ADD COLUMN "bouncedAt" TIMESTAMP(3),
  ADD COLUMN "complainedAt" TIMESTAMP(3),
  ADD COLUMN "suppressedAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "reviewRequiredAt" TIMESTAMP(3),
  ADD COLUMN "uncertainSince" TIMESTAMP(3),
  ADD COLUMN "lastDeliveryEventAt" TIMESTAMP(3),
  ADD COLUMN "lastDeliveryEventType" VARCHAR(80),
  ADD COLUMN "lastFailureCategory" VARCHAR(80),
  ADD COLUMN "lastFailureCode" VARCHAR(120),
  ADD COLUMN "lastFailureRetryable" BOOLEAN;

UPDATE "email_outbox"
SET
  "normalizedToEmail" = lower(trim("toEmail")),
  "textBody" = COALESCE(NULLIF("payload" ->> 'textBody', ''), "subject"),
  "htmlBody" = COALESCE(NULLIF("payload" ->> 'htmlBody', ''), ''),
  "deliveryClass" = CASE
    WHEN "templateKey" IN (
      'community_comment',
      'community_reply',
      'announcement_published',
      'meeting_updated'
    ) THEN 'PREFERENCE_CONTROLLED'::"EmailDeliveryClass"
    ELSE 'TRANSACTIONAL'::"EmailDeliveryClass"
  END,
  "provider" = CASE
    WHEN "status" = 'SENT'::"EmailOutboxStatus" OR "providerMessageId" IS NOT NULL
      THEN 'legacy'
    ELSE NULL
  END,
  "lastAttemptAt" = CASE WHEN "attempts" > 0 THEN "updatedAt" ELSE NULL END,
  "sentAt" = CASE
    WHEN "status" = 'SENT'::"EmailOutboxStatus"
      THEN COALESCE("sentAt", "updatedAt")
    ELSE "sentAt"
  END,
  "failedAt" = CASE
    WHEN "status" = 'FAILED'::"EmailOutboxStatus" THEN "updatedAt"
    ELSE NULL
  END,
  "cancelledAt" = CASE
    WHEN "status" = 'CANCELLED'::"EmailOutboxStatus" THEN "updatedAt"
    ELSE NULL
  END,
  "lastFailureCategory" = CASE
    WHEN "status" = 'FAILED'::"EmailOutboxStatus" THEN 'legacy_failure'
    ELSE NULL
  END,
  "lastFailureCode" = CASE
    WHEN "status" = 'FAILED'::"EmailOutboxStatus" THEN 'legacy_failure'
    ELSE NULL
  END,
  "leaseOwner" = CASE
    WHEN "status" = 'PROCESSING'::"EmailOutboxStatus" THEN 'legacy-migration'
    ELSE NULL
  END,
  "leaseExpiresAt" = CASE
    WHEN "status" = 'PROCESSING'::"EmailOutboxStatus"
      THEN COALESCE("processingStartedAt", "updatedAt") + INTERVAL '15 minutes'
    ELSE NULL
  END,
  "processingStartedAt" = CASE
    WHEN "status" = 'PROCESSING'::"EmailOutboxStatus"
      THEN COALESCE("processingStartedAt", "updatedAt")
    ELSE NULL
  END,
  "nextAttemptAt" = CASE
    WHEN "status" = 'PENDING'::"EmailOutboxStatus" AND "nextAttemptAt" IS NOT NULL
      THEN GREATEST("nextAttemptAt", "createdAt")
    ELSE NULL
  END;

ALTER TABLE "email_outbox"
  ALTER COLUMN "normalizedToEmail" SET NOT NULL,
  ALTER COLUMN "textBody" SET NOT NULL,
  ALTER COLUMN "htmlBody" SET NOT NULL;

CREATE TABLE "email_delivery_attempts" (
  "id" TEXT NOT NULL,
  "outboxId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "provider" VARCHAR(32) NOT NULL,
  "providerIdempotencyKey" VARCHAR(256) NOT NULL,
  "providerMessageId" VARCHAR(255),
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "outcome" "EmailDeliveryAttemptOutcome" NOT NULL DEFAULT 'PROCESSING',
  "httpStatus" INTEGER,
  "failureCode" VARCHAR(120),
  "retryable" BOOLEAN,
  "uncertainDelivery" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "email_delivery_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_delivery_attempts_attempt_number_check" CHECK ("attemptNumber" > 0),
  CONSTRAINT "email_delivery_attempts_provider_check" CHECK (
    "provider" = lower("provider") AND "provider" ~ '^[a-z][a-z0-9_-]{0,31}$'
  ),
  CONSTRAINT "email_delivery_attempts_idempotency_key_check" CHECK (
    length(trim("providerIdempotencyKey")) BETWEEN 1 AND 256
  ),
  CONSTRAINT "email_delivery_attempts_http_status_check" CHECK (
    "httpStatus" IS NULL OR "httpStatus" BETWEEN 100 AND 599
  ),
  CONSTRAINT "email_delivery_attempts_completion_check" CHECK (
    ("outcome" = 'PROCESSING' AND "completedAt" IS NULL) OR
    ("outcome" <> 'PROCESSING' AND "completedAt" IS NOT NULL)
  ),
  CONSTRAINT "email_delivery_attempts_time_order_check" CHECK (
    "completedAt" IS NULL OR "completedAt" >= "startedAt"
  ),
  CONSTRAINT "email_delivery_attempts_uncertain_check" CHECK (
    ("outcome" = 'UNCERTAIN') = "uncertainDelivery"
  )
);

CREATE TABLE "email_provider_webhook_events" (
  "id" TEXT NOT NULL,
  "provider" VARCHAR(32) NOT NULL,
  "providerEventId" VARCHAR(160) NOT NULL,
  "providerMessageId" VARCHAR(255),
  "eventType" VARCHAR(80) NOT NULL,
  "eventTimestamp" TIMESTAMP(3) NOT NULL,
  "payloadHash" VARCHAR(64) NOT NULL,
  "status" "EmailWebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
  "processedAt" TIMESTAMP(3),
  "failureReason" VARCHAR(120),
  "outboxId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "email_provider_webhook_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_provider_webhook_events_provider_check" CHECK (
    "provider" = lower("provider") AND "provider" ~ '^[a-z][a-z0-9_-]{0,31}$'
  ),
  CONSTRAINT "email_provider_webhook_events_identity_check" CHECK (
    length(trim("providerEventId")) > 0 AND
    length(trim("eventType")) > 0 AND
    ("providerMessageId" IS NULL OR length(trim("providerMessageId")) > 0)
  ),
  CONSTRAINT "email_provider_webhook_events_payload_hash_check" CHECK (
    "payloadHash" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "email_provider_webhook_events_processed_timestamp_check" CHECK (
    ("status" IN ('PROCESSED', 'IGNORED', 'REVIEW_REQUIRED') AND "processedAt" IS NOT NULL) OR
    ("status" IN ('RECEIVED', 'FAILED') AND "processedAt" IS NULL)
  )
);

CREATE TABLE "email_suppressions" (
  "id" TEXT NOT NULL,
  "normalizedEmail" VARCHAR(255) NOT NULL,
  "reason" "EmailSuppressionReason" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "provider" VARCHAR(32),
  "source" VARCHAR(80) NOT NULL,
  "firstOccurredAt" TIMESTAMP(3) NOT NULL,
  "lastOccurredAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" TEXT,
  "resolutionNote" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "email_suppressions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_suppressions_normalized_email_check" CHECK (
    length(trim("normalizedEmail")) > 0 AND
    "normalizedEmail" = lower(trim("normalizedEmail"))
  ),
  CONSTRAINT "email_suppressions_provider_check" CHECK (
    "provider" IS NULL OR (
      "provider" = lower("provider") AND "provider" ~ '^[a-z][a-z0-9_-]{0,31}$'
    )
  ),
  CONSTRAINT "email_suppressions_source_check" CHECK (length(trim("source")) > 0),
  CONSTRAINT "email_suppressions_occurrence_order_check" CHECK (
    "lastOccurredAt" >= "firstOccurredAt"
  ),
  CONSTRAINT "email_suppressions_resolution_check" CHECK (
    ("active" AND "resolvedAt" IS NULL AND "resolvedById" IS NULL AND "resolutionNote" IS NULL) OR
    (NOT "active" AND "resolvedAt" IS NOT NULL)
  )
);

ALTER TABLE "email_outbox"
  ADD CONSTRAINT "email_outbox_attempt_counts_check" CHECK (
    "attempts" >= 0 AND "maxAttempts" > 0
  ),
  ADD CONSTRAINT "email_outbox_template_version_check" CHECK ("templateVersion" > 0),
  ADD CONSTRAINT "email_outbox_recipient_subject_check" CHECK (
    length(trim("toEmail")) > 0 AND
    length(trim("normalizedToEmail")) > 0 AND
    "normalizedToEmail" = lower(trim("normalizedToEmail")) AND
    length(trim("subject")) > 0
  ),
  ADD CONSTRAINT "email_outbox_provider_check" CHECK (
    "provider" IS NULL OR (
      "provider" = lower("provider") AND "provider" ~ '^[a-z][a-z0-9_-]{0,31}$'
    )
  ),
  ADD CONSTRAINT "email_outbox_provider_message_check" CHECK (
    "providerMessageId" IS NULL OR (
      "provider" IS NOT NULL AND length(trim("providerMessageId")) > 0
    )
  ),
  ADD CONSTRAINT "email_outbox_idempotency_pair_check" CHECK (
    ("providerIdempotencyKey" IS NULL AND "providerIdempotencyKeyIssuedAt" IS NULL) OR
    (length(trim("providerIdempotencyKey")) BETWEEN 1 AND 256 AND "providerIdempotencyKeyIssuedAt" IS NOT NULL)
  ),
  ADD CONSTRAINT "email_outbox_lease_pair_check" CHECK (
    ("leaseOwner" IS NULL AND "leaseExpiresAt" IS NULL) OR
    (length(trim("leaseOwner")) > 0 AND "leaseExpiresAt" IS NOT NULL)
  ),
  ADD CONSTRAINT "email_outbox_processing_lease_check" CHECK (
    ("status" = 'PROCESSING' AND "processingStartedAt" IS NOT NULL AND "leaseOwner" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL) OR
    ("status" <> 'PROCESSING' AND "processingStartedAt" IS NULL AND "leaseOwner" IS NULL AND "leaseExpiresAt" IS NULL)
  ),
  ADD CONSTRAINT "email_outbox_lease_time_check" CHECK (
    "leaseExpiresAt" IS NULL OR "leaseExpiresAt" > "processingStartedAt"
  ),
  ADD CONSTRAINT "email_outbox_next_attempt_check" CHECK (
    ("nextAttemptAt" IS NULL OR "nextAttemptAt" >= "createdAt") AND
    ("status" <> 'RETRY_SCHEDULED' OR "nextAttemptAt" IS NOT NULL) AND
    ("status" IN ('PENDING', 'RETRY_SCHEDULED') OR "nextAttemptAt" IS NULL)
  ),
  ADD CONSTRAINT "email_outbox_status_timestamp_check" CHECK (
    ("status" <> 'SENT' OR "sentAt" IS NOT NULL) AND
    ("status" <> 'DELIVERED' OR ("sentAt" IS NOT NULL AND "deliveredAt" IS NOT NULL)) AND
    ("status" <> 'DELIVERY_DELAYED' OR ("sentAt" IS NOT NULL AND "deliveryDelayedAt" IS NOT NULL)) AND
    ("status" NOT IN ('FAILED', 'PERMANENTLY_FAILED') OR "failedAt" IS NOT NULL) AND
    ("status" <> 'BOUNCED' OR "bouncedAt" IS NOT NULL) AND
    ("status" <> 'COMPLAINED' OR "complainedAt" IS NOT NULL) AND
    ("status" <> 'SUPPRESSED' OR "suppressedAt" IS NOT NULL) AND
    ("status" <> 'CANCELLED' OR "cancelledAt" IS NOT NULL) AND
    ("status" <> 'REVIEW_REQUIRED' OR "reviewRequiredAt" IS NOT NULL)
  );

CREATE UNIQUE INDEX "email_outbox_providerIdempotencyKey_key"
  ON "email_outbox"("providerIdempotencyKey")
  WHERE "providerIdempotencyKey" IS NOT NULL;

CREATE UNIQUE INDEX "email_outbox_provider_providerMessageId_key"
  ON "email_outbox"("provider", "providerMessageId")
  WHERE "providerMessageId" IS NOT NULL;

CREATE INDEX "email_outbox_status_nextAttemptAt_leaseExpiresAt_idx"
  ON "email_outbox"("status", "nextAttemptAt", "leaseExpiresAt");

CREATE INDEX "email_outbox_provider_status_idx"
  ON "email_outbox"("provider", "status");

CREATE INDEX "email_outbox_provider_providerMessageId_idx"
  ON "email_outbox"("provider", "providerMessageId");

CREATE INDEX "email_outbox_normalizedToEmail_status_idx"
  ON "email_outbox"("normalizedToEmail", "status");

CREATE INDEX "email_outbox_lastDeliveryEventAt_idx"
  ON "email_outbox"("lastDeliveryEventAt");

CREATE UNIQUE INDEX "email_delivery_attempts_outboxId_attemptNumber_key"
  ON "email_delivery_attempts"("outboxId", "attemptNumber");

CREATE INDEX "email_delivery_attempts_provider_providerMessageId_idx"
  ON "email_delivery_attempts"("provider", "providerMessageId");

CREATE INDEX "email_delivery_attempts_outcome_startedAt_idx"
  ON "email_delivery_attempts"("outcome", "startedAt");

CREATE UNIQUE INDEX "email_provider_webhook_events_provider_providerEventId_key"
  ON "email_provider_webhook_events"("provider", "providerEventId");

CREATE INDEX "email_provider_webhook_events_provider_providerMessageId_idx"
  ON "email_provider_webhook_events"("provider", "providerMessageId");

CREATE INDEX "email_provider_webhook_events_payloadHash_idx"
  ON "email_provider_webhook_events"("payloadHash");

CREATE INDEX "email_provider_webhook_events_status_createdAt_idx"
  ON "email_provider_webhook_events"("status", "createdAt");

CREATE INDEX "email_provider_webhook_events_outboxId_eventTimestamp_idx"
  ON "email_provider_webhook_events"("outboxId", "eventTimestamp");

CREATE UNIQUE INDEX "email_suppressions_normalizedEmail_key"
  ON "email_suppressions"("normalizedEmail");

CREATE INDEX "email_suppressions_active_reason_lastOccurredAt_idx"
  ON "email_suppressions"("active", "reason", "lastOccurredAt");

CREATE INDEX "email_suppressions_provider_active_idx"
  ON "email_suppressions"("provider", "active");

CREATE INDEX "email_suppressions_resolvedById_idx"
  ON "email_suppressions"("resolvedById");

ALTER TABLE "email_delivery_attempts"
  ADD CONSTRAINT "email_delivery_attempts_outboxId_fkey"
  FOREIGN KEY ("outboxId") REFERENCES "email_outbox"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "email_provider_webhook_events"
  ADD CONSTRAINT "email_provider_webhook_events_outboxId_fkey"
  FOREIGN KEY ("outboxId") REFERENCES "email_outbox"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "email_suppressions"
  ADD CONSTRAINT "email_suppressions_resolvedById_fkey"
  FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
