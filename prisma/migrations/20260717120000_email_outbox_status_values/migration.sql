-- Change Set 8, phase 1: add outbox status values in a migration that commits
-- before any later migration uses them. PostgreSQL does not allow a newly
-- added enum value to be used until the ALTER TYPE transaction commits.

ALTER TYPE "EmailOutboxStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "EmailOutboxStatus" ADD VALUE IF NOT EXISTS 'DELIVERY_DELAYED';
ALTER TYPE "EmailOutboxStatus" ADD VALUE IF NOT EXISTS 'RETRY_SCHEDULED';
ALTER TYPE "EmailOutboxStatus" ADD VALUE IF NOT EXISTS 'PERMANENTLY_FAILED';
ALTER TYPE "EmailOutboxStatus" ADD VALUE IF NOT EXISTS 'BOUNCED';
ALTER TYPE "EmailOutboxStatus" ADD VALUE IF NOT EXISTS 'COMPLAINED';
ALTER TYPE "EmailOutboxStatus" ADD VALUE IF NOT EXISTS 'SUPPRESSED';
ALTER TYPE "EmailOutboxStatus" ADD VALUE IF NOT EXISTS 'REVIEW_REQUIRED';
