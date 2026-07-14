-- Extend existing enums.
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'CONFIRMED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'INVOICE_CREATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_RECORDED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_CONFIRMED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_FAILED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_PAST_DUE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_WAIVED';

-- Create billing enums.
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL', 'ONE_TIME');
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED', 'WAIVED');
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PARTIALLY_PAID', 'PAID', 'VOID', 'OVERDUE');

-- Extend notification preferences for billing updates.
ALTER TABLE "notification_preferences"
  ADD COLUMN "inAppBillingUpdates" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "emailBillingUpdates" BOOLEAN NOT NULL DEFAULT true;

-- Create membership plans.
CREATE TABLE "membership_plans" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "amountMinor" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'ZMW',
    "billingInterval" "BillingInterval" NOT NULL,
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "membership_plans_amountMinor_check" CHECK ("amountMinor" > 0),
    CONSTRAINT "membership_plans_intervalCount_check" CHECK ("intervalCount" > 0),
    CONSTRAINT "membership_plans_currency_check" CHECK ("currency" = upper("currency") AND length("currency") = 3),
    CONSTRAINT "membership_plans_default_active_check" CHECK ("isDefault" = false OR "isActive" = true)
);

-- Create member subscriptions.
CREATE TABLE "member_subscriptions" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "nextBillingAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "waiverReason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_subscriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "member_subscriptions_period_check" CHECK ("currentPeriodEnd" > "currentPeriodStart"),
    CONSTRAINT "member_subscriptions_waiver_reason_check" CHECK ("status" <> 'WAIVED' OR "waiverReason" IS NOT NULL)
);

-- Create invoices.
CREATE TABLE "membership_invoices" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "invoiceNumber" VARCHAR(40) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "description" VARCHAR(240) NOT NULL,
    "amountDueMinor" BIGINT NOT NULL,
    "amountPaidMinor" BIGINT NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'ZMW',
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_invoices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "membership_invoices_amounts_check" CHECK ("amountDueMinor" >= 0 AND "amountPaidMinor" >= 0 AND "amountPaidMinor" <= "amountDueMinor"),
    CONSTRAINT "membership_invoices_currency_check" CHECK ("currency" = upper("currency") AND length("currency") = 3),
    CONSTRAINT "membership_invoices_period_check" CHECK ("periodEnd" IS NULL OR "periodStart" IS NULL OR "periodEnd" > "periodStart"),
    CONSTRAINT "membership_invoices_paid_status_check" CHECK ("status" <> 'PAID' OR "amountPaidMinor" = "amountDueMinor"),
    CONSTRAINT "membership_invoices_void_status_check" CHECK ("status" <> 'VOID' OR "voidedAt" IS NOT NULL)
);

-- Evolve existing membership payments safely.
ALTER TABLE "membership_payments"
  ADD COLUMN "invoiceId" TEXT,
  ADD COLUMN "amountMinor" BIGINT,
  ADD COLUMN "internalReference" VARCHAR(80),
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "confirmedById" TEXT,
  ADD COLUMN "idempotencyKey" VARCHAR(160);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "membership_payments"
    WHERE "amount" IS NULL OR "amount" <= 0
  ) THEN
    RAISE EXCEPTION 'Cannot backfill membership_payments.amountMinor while legacy amount is null, zero, or negative.';
  END IF;
END $$;

-- Existing legacy payment rows are expected to be ZMW. Preserve each row's
-- existing currency value for historical accuracy, normalizing ISO casing
-- before enabling the currency constraint.
UPDATE "membership_payments"
SET "currency" = UPPER(TRIM("currency"))
WHERE "currency" IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "membership_payments"
    WHERE "currency" IS NULL
       OR "currency" <> upper("currency")
       OR length("currency") <> 3
  ) THEN
    RAISE EXCEPTION 'Cannot enable billing currency constraints while legacy membership_payments.currency is null or invalid.';
  END IF;
END $$;

-- Legacy payment amounts were stored with two decimal places. Preserve each
-- row's normalized currency and convert major units to minor units by explicit
-- rounding to the nearest minor unit: K100.00 -> 10000, K100.55 -> 10055.
UPDATE "membership_payments"
SET "amountMinor" = ROUND(("amount" * 100))::BIGINT
WHERE "amountMinor" IS NULL;

UPDATE "membership_payments"
SET "internalReference" = CONCAT('PAY-', UPPER(SUBSTRING(REPLACE("id", '-', ''), 1, 12)))
WHERE "internalReference" IS NULL;

UPDATE "membership_payments"
SET "paidAt" = COALESCE("paidAt", "createdAt")
WHERE "status" = 'PAID'::"PaymentStatus"
  AND "paidAt" IS NULL;

UPDATE "membership_payments"
SET "confirmedAt" = COALESCE("confirmedAt", "paidAt", "createdAt")
WHERE "status" = 'PAID'::"PaymentStatus"
  AND "confirmedAt" IS NULL;

ALTER TABLE "membership_payments"
  ALTER COLUMN "amountMinor" SET NOT NULL,
  ALTER COLUMN "amount" DROP NOT NULL,
  ALTER COLUMN "currency" SET DEFAULT 'ZMW',
  ALTER COLUMN "dueAt" DROP NOT NULL,
  ALTER COLUMN "internalReference" SET NOT NULL;

ALTER TABLE "membership_payments"
  ADD CONSTRAINT "membership_payments_amountMinor_check" CHECK ("amountMinor" > 0),
  ADD CONSTRAINT "membership_payments_currency_check" CHECK ("currency" = upper("currency") AND length("currency") = 3),
  ADD CONSTRAINT "membership_payments_confirmed_timestamp_check" CHECK ("status" NOT IN ('PAID'::"PaymentStatus", 'CONFIRMED'::"PaymentStatus") OR ("paidAt" IS NOT NULL AND "confirmedAt" IS NOT NULL)),
  ADD CONSTRAINT "membership_payments_confirmation_order_check" CHECK ("confirmedAt" IS NULL OR "paidAt" IS NULL OR "confirmedAt" >= "paidAt");

-- Preserve financial audit history by preventing membership deletion while billing rows exist.
ALTER TABLE "membership_payments" DROP CONSTRAINT "membership_payments_membershipId_fkey";

-- Indexes and uniqueness.
CREATE INDEX "membership_plans_isActive_isDefault_idx" ON "membership_plans"("isActive", "isDefault");
CREATE INDEX "membership_plans_billingInterval_idx" ON "membership_plans"("billingInterval");
CREATE INDEX "membership_plans_createdById_idx" ON "membership_plans"("createdById");
CREATE UNIQUE INDEX "membership_plans_one_active_default_key" ON "membership_plans"("isDefault") WHERE "isActive" = true AND "isDefault" = true;

CREATE INDEX "member_subscriptions_membershipId_status_idx" ON "member_subscriptions"("membershipId", "status");
CREATE INDEX "member_subscriptions_planId_status_idx" ON "member_subscriptions"("planId", "status");
CREATE INDEX "member_subscriptions_nextBillingAt_idx" ON "member_subscriptions"("nextBillingAt");
CREATE INDEX "member_subscriptions_currentPeriodEnd_idx" ON "member_subscriptions"("currentPeriodEnd");
CREATE UNIQUE INDEX "member_subscriptions_one_current_per_membership_key" ON "member_subscriptions"("membershipId") WHERE "status" IN ('PENDING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'WAIVED');

CREATE UNIQUE INDEX "membership_invoices_invoiceNumber_key" ON "membership_invoices"("invoiceNumber");
CREATE INDEX "membership_invoices_membershipId_status_idx" ON "membership_invoices"("membershipId", "status");
CREATE INDEX "membership_invoices_status_dueAt_idx" ON "membership_invoices"("status", "dueAt");
CREATE INDEX "membership_invoices_dueAt_idx" ON "membership_invoices"("dueAt");
CREATE INDEX "membership_invoices_subscriptionId_periodStart_periodEnd_idx" ON "membership_invoices"("subscriptionId", "periodStart", "periodEnd");
CREATE UNIQUE INDEX "membership_invoices_subscription_period_key" ON "membership_invoices"("subscriptionId", "periodStart", "periodEnd") WHERE "subscriptionId" IS NOT NULL AND "periodStart" IS NOT NULL AND "periodEnd" IS NOT NULL;
CREATE INDEX "membership_invoices_createdById_idx" ON "membership_invoices"("createdById");

CREATE UNIQUE INDEX "membership_payments_internalReference_key" ON "membership_payments"("internalReference");
CREATE UNIQUE INDEX "membership_payments_idempotencyKey_key" ON "membership_payments"("idempotencyKey");
CREATE INDEX "membership_payments_invoiceId_status_idx" ON "membership_payments"("invoiceId", "status");
CREATE INDEX "membership_payments_confirmedAt_idx" ON "membership_payments"("confirmedAt");

-- Foreign keys.
ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "member_subscriptions" ADD CONSTRAINT "member_subscriptions_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "member_subscriptions" ADD CONSTRAINT "member_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "membership_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "membership_invoices" ADD CONSTRAINT "membership_invoices_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_invoices" ADD CONSTRAINT "membership_invoices_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "member_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "membership_invoices" ADD CONSTRAINT "membership_invoices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "membership_payments" ADD CONSTRAINT "membership_payments_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_payments" ADD CONSTRAINT "membership_payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "membership_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "membership_payments" ADD CONSTRAINT "membership_payments_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
