-- Allow invoice-era payments to split a single billing period across multiple
-- legitimate payment rows. Duplicate protection now belongs to scoped
-- idempotency keys, internal payment references, and pending-only confirmation
-- guards rather than period-level uniqueness.
DROP INDEX IF EXISTS "membership_payments_membershipId_periodStart_periodEnd_key";

CREATE INDEX IF NOT EXISTS "membership_payments_membershipId_periodStart_periodEnd_idx"
  ON "membership_payments"("membershipId", "periodStart", "periodEnd");

-- External references from cash, bank transfer, and mobile-money workflows are
-- supporting evidence. They are not globally unique proof of payment in this
-- provider-independent slice.
DROP INDEX IF EXISTS "membership_payments_reference_key";

CREATE INDEX IF NOT EXISTS "membership_payments_reference_idx"
  ON "membership_payments"("reference");
