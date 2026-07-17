-- Change Set 7: provider-neutral online payment attempts, webhook event
-- idempotency, and reconciliation foundations. This migration is additive and
-- must remain pending during implementation.

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ONLINE_PAYMENT_REVIEW_REQUIRED';

CREATE TYPE "OnlinePaymentProvider" AS ENUM ('FLUTTERWAVE');
CREATE TYPE "OnlinePaymentAttemptStatus" AS ENUM (
  'CREATED',
  'CHECKOUT_READY',
  'PROCESSING',
  'VERIFIED',
  'SETTLED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'REVIEW_REQUIRED'
);
CREATE TYPE "ProviderWebhookEventStatus" AS ENUM (
  'RECEIVED',
  'PROCESSED',
  'DUPLICATE',
  'FAILED',
  'IGNORED'
);

CREATE TABLE "online_payment_attempts" (
  "id" TEXT NOT NULL,
  "provider" "OnlinePaymentProvider" NOT NULL,
  "sonderReference" VARCHAR(80) NOT NULL,
  "membershipId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "status" "OnlinePaymentAttemptStatus" NOT NULL DEFAULT 'CREATED',
  "providerTransactionId" VARCHAR(120),
  "providerReference" VARCHAR(160),
  "providerCheckoutId" VARCHAR(160),
  "checkoutUrl" VARCHAR(1000),
  "checkoutExpiresAt" TIMESTAMP(3),
  "checkoutIdempotencyKey" VARCHAR(128),
  "settledPaymentId" TEXT,
  "failureReason" VARCHAR(120),
  "reviewReason" VARCHAR(120),
  "providerStatus" VARCHAR(80),
  "verifiedAt" TIMESTAMP(3),
  "settledAt" TIMESTAMP(3),
  "lastStatusCheckedAt" TIMESTAMP(3),
  "sanitizedStatus" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "online_payment_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "online_payment_attempts_amount_check" CHECK ("amountMinor" > 0),
  CONSTRAINT "online_payment_attempts_currency_check" CHECK ("currency" = upper("currency") AND length("currency") = 3),
  CONSTRAINT "online_payment_attempts_non_empty_provider_values_check" CHECK (
    ("providerTransactionId" IS NULL OR length(trim("providerTransactionId")) > 0) AND
    ("providerReference" IS NULL OR length(trim("providerReference")) > 0) AND
    ("providerCheckoutId" IS NULL OR length(trim("providerCheckoutId")) > 0) AND
    ("checkoutUrl" IS NULL OR length(trim("checkoutUrl")) > 0) AND
    ("checkoutIdempotencyKey" IS NULL OR length(trim("checkoutIdempotencyKey")) > 0)
  ),
  CONSTRAINT "online_payment_attempts_checkout_ready_check" CHECK ("status" <> 'CHECKOUT_READY' OR "checkoutUrl" IS NOT NULL),
  CONSTRAINT "online_payment_attempts_settled_timestamp_check" CHECK ("status" <> 'SETTLED' OR ("verifiedAt" IS NOT NULL AND "settledAt" IS NOT NULL AND "settledPaymentId" IS NOT NULL)),
  CONSTRAINT "online_payment_attempts_settled_state_check" CHECK ("settledAt" IS NULL OR ("status" = 'SETTLED' AND "settledPaymentId" IS NOT NULL)),
  CONSTRAINT "online_payment_attempts_settled_payment_state_check" CHECK ("settledPaymentId" IS NULL OR "status" = 'SETTLED'),
  CONSTRAINT "online_payment_attempts_verified_timestamp_check" CHECK ("status" NOT IN ('VERIFIED', 'SETTLED') OR "verifiedAt" IS NOT NULL),
  CONSTRAINT "online_payment_attempts_failed_unverified_check" CHECK ("status" NOT IN ('FAILED', 'CANCELLED', 'EXPIRED') OR "verifiedAt" IS NULL),
  CONSTRAINT "online_payment_attempts_review_reason_check" CHECK ("status" <> 'REVIEW_REQUIRED' OR "reviewReason" IS NOT NULL),
  CONSTRAINT "online_payment_attempts_failure_reason_check" CHECK ("status" NOT IN ('FAILED', 'CANCELLED', 'EXPIRED') OR "failureReason" IS NOT NULL),
  CONSTRAINT "online_payment_attempts_settled_order_check" CHECK ("settledAt" IS NULL OR "verifiedAt" IS NULL OR "settledAt" >= "verifiedAt")
);

CREATE TABLE "provider_webhook_events" (
  "id" TEXT NOT NULL,
  "provider" "OnlinePaymentProvider" NOT NULL,
  "eventKey" VARCHAR(160) NOT NULL,
  "providerEventId" VARCHAR(160),
  "eventType" VARCHAR(120),
  "providerTransactionId" VARCHAR(120),
  "sonderReference" VARCHAR(80),
  "payloadHash" VARCHAR(64) NOT NULL,
  "status" "ProviderWebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "failureReason" VARCHAR(120),
  "attemptId" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "provider_webhook_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "provider_webhook_events_non_empty_identity_check" CHECK (
    length(trim("eventKey")) > 0 AND
    ("providerEventId" IS NULL OR length(trim("providerEventId")) > 0) AND
    ("eventType" IS NULL OR length(trim("eventType")) > 0) AND
    ("providerTransactionId" IS NULL OR length(trim("providerTransactionId")) > 0) AND
    ("sonderReference" IS NULL OR length(trim("sonderReference")) > 0)
  ),
  CONSTRAINT "provider_webhook_events_payload_hash_check" CHECK ("payloadHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "provider_webhook_events_processed_timestamp_check" CHECK ("status" <> 'PROCESSED' OR "processedAt" IS NOT NULL)
);

CREATE UNIQUE INDEX "online_payment_attempts_sonderReference_key"
  ON "online_payment_attempts"("sonderReference");

CREATE UNIQUE INDEX "online_payment_attempts_providerTransactionId_key"
  ON "online_payment_attempts"("provider", "providerTransactionId")
  WHERE "providerTransactionId" IS NOT NULL;

CREATE UNIQUE INDEX "online_payment_attempts_settledPaymentId_key"
  ON "online_payment_attempts"("settledPaymentId")
  WHERE "settledPaymentId" IS NOT NULL;

CREATE UNIQUE INDEX "online_payment_attempts_checkoutIdempotencyKey_key"
  ON "online_payment_attempts"("checkoutIdempotencyKey")
  WHERE "checkoutIdempotencyKey" IS NOT NULL;

CREATE UNIQUE INDEX "online_payment_attempts_one_active_invoice_key"
  ON "online_payment_attempts"("invoiceId")
  WHERE "status" IN ('CREATED', 'CHECKOUT_READY', 'PROCESSING', 'VERIFIED');

CREATE INDEX "online_payment_attempts_membershipId_status_createdAt_idx"
  ON "online_payment_attempts"("membershipId", "status", "createdAt");

CREATE INDEX "online_payment_attempts_invoiceId_status_createdAt_idx"
  ON "online_payment_attempts"("invoiceId", "status", "createdAt");

CREATE INDEX "online_payment_attempts_provider_status_lastStatusCheckedAt_idx"
  ON "online_payment_attempts"("provider", "status", "lastStatusCheckedAt");

CREATE INDEX "online_payment_attempts_providerTransactionId_idx"
  ON "online_payment_attempts"("providerTransactionId");

CREATE INDEX "online_payment_attempts_settledPaymentId_idx"
  ON "online_payment_attempts"("settledPaymentId");

CREATE UNIQUE INDEX "provider_webhook_events_provider_eventKey_key"
  ON "provider_webhook_events"("provider", "eventKey");

CREATE INDEX "provider_webhook_events_provider_status_receivedAt_idx"
  ON "provider_webhook_events"("provider", "status", "receivedAt");

CREATE INDEX "provider_webhook_events_providerTransactionId_idx"
  ON "provider_webhook_events"("providerTransactionId");

CREATE INDEX "provider_webhook_events_sonderReference_idx"
  ON "provider_webhook_events"("sonderReference");

CREATE INDEX "provider_webhook_events_attemptId_idx"
  ON "provider_webhook_events"("attemptId");

ALTER TABLE "online_payment_attempts"
  ADD CONSTRAINT "online_payment_attempts_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "online_payment_attempts"
  ADD CONSTRAINT "online_payment_attempts_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "membership_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "online_payment_attempts"
  ADD CONSTRAINT "online_payment_attempts_settledPaymentId_fkey"
  FOREIGN KEY ("settledPaymentId") REFERENCES "membership_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "provider_webhook_events"
  ADD CONSTRAINT "provider_webhook_events_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "online_payment_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
