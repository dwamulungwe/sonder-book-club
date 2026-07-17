import { createHash, randomUUID } from "node:crypto";
import {
  EmailDeliveryAttemptOutcome,
  EmailOutboxStatus,
  EmailSuppressionReason,
} from "@prisma/client";

import type {
  EmailProvider,
  EmailProviderSendResult,
} from "@/features/email/provider";
import { getEmailProvider } from "@/features/email/provider";
import { getEmailProviderConfig } from "@/features/email/server-config";
import { upsertEmailSuppression } from "@/features/email/suppression";
import { db } from "@/lib/db";

const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 50;
const DEFAULT_LEASE_SECONDS = 120;
const MAX_BACKOFF_MS = 6 * 60 * 60 * 1_000;
const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1_000;
const IDEMPOTENCY_SAFETY_MARGIN_MS = 60 * 1_000;

export type ClaimedEmail = {
  id: string;
  recipientUserId: string | null;
  toEmail: string;
  normalizedToEmail: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  templateKey: string;
  attempts: number;
  maxAttempts: number;
  providerIdempotencyKey: string;
  providerIdempotencyKeyIssuedAt: Date;
  uncertainSince: Date | null;
  leaseOwner: string;
  leaseExpiresAt: Date;
};

export type PrepareAttemptResult =
  | "ready"
  | "suppressed"
  | "review_required"
  | "skipped";

export type RecordedEmailResult =
  | "accepted"
  | "retry_scheduled"
  | "permanently_failed"
  | "review_required"
  | "skipped";

export type EmailOutboxRepository = {
  claimEligible(input: {
    batchSize: number;
    provider: string;
    workerId: string;
    leaseSeconds: number;
    now: Date;
  }): Promise<ClaimedEmail[]>;
  prepareAttempt(email: ClaimedEmail, now: Date): Promise<PrepareAttemptResult>;
  recordResult(
    email: ClaimedEmail,
    result: EmailProviderSendResult,
    now: Date,
  ): Promise<RecordedEmailResult>;
};

export type ProcessEmailOutboxResult = {
  claimed: number;
  accepted: number;
  retryScheduled: number;
  permanentlyFailed: number;
  suppressed: number;
  reviewRequired: number;
  skipped: number;
  provider: string;
  disabled: boolean;
};

function boundedBatchSize(batchSize: number) {
  if (!Number.isFinite(batchSize)) {
    return DEFAULT_BATCH_SIZE;
  }

  return Math.max(1, Math.min(Math.floor(batchSize), MAX_BATCH_SIZE));
}

export function providerIdempotencyKey(outboxId: string) {
  return `sonder-email/${outboxId}`.slice(0, 256);
}

export function calculateBackoffMs(input: {
  attemptNumber: number;
  seed: string;
  retryAfterMs?: number;
}) {
  const attempt = Math.max(1, Math.floor(input.attemptNumber));
  const exponential = Math.min(MAX_BACKOFF_MS, 60_000 * 2 ** (attempt - 1));
  const digest = createHash("sha256")
    .update(`${input.seed}:${attempt}`)
    .digest();
  const jitterRatio = digest.readUInt16BE(0) / 65_535;
  const jittered = Math.min(
    MAX_BACKOFF_MS,
    exponential + Math.floor(exponential * 0.2 * jitterRatio),
  );

  return Math.min(
    MAX_BACKOFF_MS,
    Math.max(jittered, input.retryAfterMs ?? 0),
  );
}

export function uncertaintyRetryDecision(input: {
  now: Date;
  idempotencyKeyIssuedAt: Date;
  attemptNumber: number;
  maxAttempts: number;
  outboxId: string;
}) {
  const expiresAt = new Date(
    input.idempotencyKeyIssuedAt.getTime() + IDEMPOTENCY_WINDOW_MS,
  );
  const retryAt = new Date(
    input.now.getTime() +
      calculateBackoffMs({
        attemptNumber: input.attemptNumber,
        seed: input.outboxId,
      }),
  );
  const safeRetryDeadline = new Date(
    expiresAt.getTime() - IDEMPOTENCY_SAFETY_MARGIN_MS,
  );

  if (input.attemptNumber >= input.maxAttempts || retryAt >= safeRetryDeadline) {
    return {
      action: "review_required" as const,
      expiresAt,
    };
  }

  return {
    action: "retry" as const,
    retryAt,
    expiresAt,
  };
}

function clearedLease() {
  return {
    processingStartedAt: null,
    leaseOwner: null,
    leaseExpiresAt: null,
  };
}

const prismaEmailOutboxRepository: EmailOutboxRepository = {
  async claimEligible({ batchSize, provider, workerId, leaseSeconds, now }) {
    const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1_000);

    return db.$transaction(async (tx) => {
      await tx.$executeRaw`
        WITH stale AS (
          SELECT email."id"
          FROM "email_outbox" AS email
          WHERE email."status" = 'PROCESSING'::"EmailOutboxStatus"
            AND email."leaseExpiresAt" <= ${now}
          ORDER BY email."leaseExpiresAt" ASC, email."id" ASC
          LIMIT ${batchSize}
          FOR UPDATE OF email SKIP LOCKED
        )
        UPDATE "email_delivery_attempts" AS attempt
        SET
          "outcome" = 'UNCERTAIN'::"EmailDeliveryAttemptOutcome",
          "completedAt" = ${now},
          "failureCode" = 'stale_lease_recovered',
          "retryable" = true,
          "uncertainDelivery" = true
        FROM stale
        WHERE attempt."outboxId" = stale."id"
          AND attempt."outcome" = 'PROCESSING'::"EmailDeliveryAttemptOutcome"
      `;

      await tx.$executeRaw`
        WITH stale AS (
          SELECT email."id"
          FROM "email_outbox" AS email
          WHERE email."status" = 'PROCESSING'::"EmailOutboxStatus"
            AND email."leaseExpiresAt" <= ${now}
          ORDER BY email."leaseExpiresAt" ASC, email."id" ASC
          LIMIT ${batchSize}
          FOR UPDATE OF email SKIP LOCKED
        )
        UPDATE "email_outbox" AS email
        SET "uncertainSince" = COALESCE(email."uncertainSince", ${now})
        FROM stale
        WHERE email."id" = stale."id"
      `;

      await tx.$executeRaw`
        WITH candidates AS (
          SELECT email."id"
          FROM "email_outbox" AS email
          JOIN "email_suppressions" AS suppression
            ON suppression."normalizedEmail" = email."normalizedToEmail"
            AND suppression."active" = true
          WHERE (
              email."status" IN (
                'PENDING'::"EmailOutboxStatus",
                'RETRY_SCHEDULED'::"EmailOutboxStatus"
              )
              OR (
                email."status" = 'PROCESSING'::"EmailOutboxStatus"
                AND email."leaseExpiresAt" <= ${now}
              )
            )
            AND (email."nextAttemptAt" IS NULL OR email."nextAttemptAt" <= ${now})
          ORDER BY email."createdAt" ASC, email."id" ASC
          LIMIT ${batchSize}
          FOR UPDATE OF email SKIP LOCKED
        )
        UPDATE "email_outbox" AS email
        SET
          "status" = 'SUPPRESSED'::"EmailOutboxStatus",
          "suppressedAt" = COALESCE(email."suppressedAt", ${now}),
          "nextAttemptAt" = NULL,
          "processingStartedAt" = NULL,
          "leaseOwner" = NULL,
          "leaseExpiresAt" = NULL,
          "lastFailureCategory" = 'recipient_suppression',
          "lastFailureCode" = 'active_suppression',
          "lastFailureRetryable" = false,
          "updatedAt" = ${now}
        FROM candidates
        WHERE candidates."id" = email."id"
      `;

      await tx.$executeRaw`
        WITH candidates AS (
          SELECT email."id"
          FROM "email_outbox" AS email
          JOIN "users" AS recipient ON recipient."id" = email."recipientUserId"
          WHERE recipient."deletedAt" IS NOT NULL
            AND (
              email."status" IN (
                'PENDING'::"EmailOutboxStatus",
                'RETRY_SCHEDULED'::"EmailOutboxStatus"
              )
              OR (
                email."status" = 'PROCESSING'::"EmailOutboxStatus"
                AND email."leaseExpiresAt" <= ${now}
              )
            )
            AND (email."nextAttemptAt" IS NULL OR email."nextAttemptAt" <= ${now})
          ORDER BY email."createdAt" ASC, email."id" ASC
          LIMIT ${batchSize}
          FOR UPDATE OF email SKIP LOCKED
        )
        UPDATE "email_outbox" AS email
        SET
          "status" = 'CANCELLED'::"EmailOutboxStatus",
          "cancelledAt" = COALESCE(email."cancelledAt", ${now}),
          "nextAttemptAt" = NULL,
          "processingStartedAt" = NULL,
          "leaseOwner" = NULL,
          "leaseExpiresAt" = NULL,
          "lastFailureCategory" = 'recipient_state',
          "lastFailureCode" = 'recipient_deleted',
          "lastFailureRetryable" = false,
          "updatedAt" = ${now}
        FROM candidates
        WHERE candidates."id" = email."id"
      `;

      await tx.$executeRaw`
        WITH candidates AS (
          SELECT attempt."id"
          FROM "email_delivery_attempts" AS attempt
          JOIN "email_outbox" AS email ON email."id" = attempt."outboxId"
          WHERE attempt."outcome" = 'PROCESSING'::"EmailDeliveryAttemptOutcome"
            AND email."status" IN (
              'SUPPRESSED'::"EmailOutboxStatus",
              'CANCELLED'::"EmailOutboxStatus"
            )
            AND email."leaseOwner" IS NULL
          ORDER BY attempt."startedAt" ASC, attempt."id" ASC
          LIMIT ${batchSize}
          FOR UPDATE OF attempt SKIP LOCKED
        )
        UPDATE "email_delivery_attempts" AS attempt
        SET
          "outcome" = 'UNCERTAIN'::"EmailDeliveryAttemptOutcome",
          "completedAt" = ${now},
          "failureCode" = 'recipient_state_after_stale_lease',
          "retryable" = false,
          "uncertainDelivery" = true
        FROM candidates
        WHERE attempt."id" = candidates."id"
      `;

      await tx.$executeRaw`
        WITH candidates AS (
          SELECT email."id"
          FROM "email_outbox" AS email
          WHERE email."uncertainSince" IS NOT NULL
            AND email."status" IN (
              'PENDING'::"EmailOutboxStatus",
              'RETRY_SCHEDULED'::"EmailOutboxStatus",
              'PROCESSING'::"EmailOutboxStatus"
            )
            AND (
              (
                email."providerIdempotencyKeyIssuedAt" IS NOT NULL
                AND email."providerIdempotencyKeyIssuedAt" + INTERVAL '24 hours' <= ${now}
              )
              OR (
                email."status" = 'PROCESSING'::"EmailOutboxStatus"
                AND email."leaseExpiresAt" <= ${now}
                AND email."attempts" >= email."maxAttempts"
              )
            )
            AND (
              email."status" <> 'PROCESSING'::"EmailOutboxStatus"
              OR email."leaseExpiresAt" <= ${now}
            )
          ORDER BY email."createdAt" ASC, email."id" ASC
          LIMIT ${batchSize}
          FOR UPDATE OF email SKIP LOCKED
        )
        UPDATE "email_outbox" AS email
        SET
          "status" = 'REVIEW_REQUIRED'::"EmailOutboxStatus",
          "reviewRequiredAt" = COALESCE(email."reviewRequiredAt", ${now}),
          "nextAttemptAt" = NULL,
          "processingStartedAt" = NULL,
          "leaseOwner" = NULL,
          "leaseExpiresAt" = NULL,
          "lastFailureCategory" = 'unknown_delivery',
          "lastFailureCode" = CASE
            WHEN email."attempts" >= email."maxAttempts" THEN 'maximum_attempts_with_unknown_delivery'
            ELSE 'idempotency_window_expired'
          END,
          "lastFailureRetryable" = false,
          "updatedAt" = ${now}
        FROM candidates
        WHERE email."id" = candidates."id"
      `;

      return tx.$queryRaw<ClaimedEmail[]>`
        UPDATE "email_outbox" AS email
        SET
          "status" = 'PROCESSING'::"EmailOutboxStatus",
          "processingStartedAt" = ${now},
          "leaseOwner" = ${workerId},
          "leaseExpiresAt" = ${leaseExpiresAt},
          "provider" = ${provider},
          "providerIdempotencyKey" = COALESCE(
            email."providerIdempotencyKey",
            'sonder-email/' || email."id"
          ),
          "providerIdempotencyKeyIssuedAt" = COALESCE(
            email."providerIdempotencyKeyIssuedAt",
            ${now}
          ),
          "attempts" = email."attempts" + 1,
          "lastAttemptAt" = ${now},
          "nextAttemptAt" = NULL,
          "updatedAt" = ${now}
        WHERE email."id" IN (
          SELECT candidate."id"
          FROM "email_outbox" AS candidate
          LEFT JOIN "email_suppressions" AS suppression
            ON suppression."normalizedEmail" = candidate."normalizedToEmail"
            AND suppression."active" = true
          LEFT JOIN "users" AS recipient
            ON recipient."id" = candidate."recipientUserId"
          WHERE (
            candidate."status" IN (
              'PENDING'::"EmailOutboxStatus",
              'RETRY_SCHEDULED'::"EmailOutboxStatus"
            )
            OR (
              candidate."status" = 'PROCESSING'::"EmailOutboxStatus"
              AND candidate."leaseExpiresAt" <= ${now}
            )
          )
            AND candidate."attempts" < candidate."maxAttempts"
            AND (candidate."nextAttemptAt" IS NULL OR candidate."nextAttemptAt" <= ${now})
            AND suppression."id" IS NULL
            AND (candidate."recipientUserId" IS NULL OR recipient."deletedAt" IS NULL)
            AND NOT (
              candidate."uncertainSince" IS NOT NULL
              AND candidate."providerIdempotencyKeyIssuedAt" IS NOT NULL
              AND candidate."providerIdempotencyKeyIssuedAt" + INTERVAL '24 hours' <= ${now}
            )
          ORDER BY candidate."createdAt" ASC, candidate."id" ASC
          LIMIT ${batchSize}
          FOR UPDATE OF candidate SKIP LOCKED
        )
        RETURNING
          email."id",
          email."recipientUserId",
          email."toEmail",
          email."normalizedToEmail",
          email."subject",
          email."textBody",
          email."htmlBody",
          email."templateKey",
          email."attempts",
          email."maxAttempts",
          email."providerIdempotencyKey",
          email."providerIdempotencyKeyIssuedAt",
          email."uncertainSince",
          email."leaseOwner",
          email."leaseExpiresAt"
      `;
    });
  },

  async prepareAttempt(email, now) {
    return db.$transaction(async (tx) => {
      const current = await tx.emailOutbox.findFirst({
        where: {
          id: email.id,
          status: EmailOutboxStatus.PROCESSING,
          leaseOwner: email.leaseOwner,
        },
        include: {
          recipientUser: {
            select: {
              deletedAt: true,
            },
          },
        },
      });

      if (!current) {
        return "skipped";
      }

      const suppression = await tx.emailSuppression.findUnique({
        where: {
          normalizedEmail: current.normalizedToEmail,
        },
        select: {
          active: true,
        },
      });

      if (current.recipientUser?.deletedAt || suppression?.active) {
        await tx.emailDeliveryAttempt.create({
          data: {
            outboxId: current.id,
            attemptNumber: current.attempts,
            provider: current.provider ?? "unknown",
            providerIdempotencyKey: current.providerIdempotencyKey ?? providerIdempotencyKey(current.id),
            startedAt: now,
            completedAt: now,
            outcome: EmailDeliveryAttemptOutcome.SUPPRESSED,
            failureCode: current.recipientUser?.deletedAt
              ? "recipient_deleted"
              : "active_suppression",
            retryable: false,
          },
        });

        await tx.emailOutbox.update({
          where: { id: current.id },
          data: current.recipientUser?.deletedAt
            ? {
                status: EmailOutboxStatus.CANCELLED,
                cancelledAt: now,
                lastFailureCategory: "recipient_state",
                lastFailureCode: "recipient_deleted",
                lastFailureRetryable: false,
                nextAttemptAt: null,
                ...clearedLease(),
              }
            : {
                status: EmailOutboxStatus.SUPPRESSED,
                suppressedAt: now,
                lastFailureCategory: "recipient_suppression",
                lastFailureCode: "active_suppression",
                lastFailureRetryable: false,
                nextAttemptAt: null,
                ...clearedLease(),
              },
        });

        return current.recipientUser?.deletedAt ? "skipped" : "suppressed";
      }

      if (
        current.uncertainSince &&
        current.providerIdempotencyKeyIssuedAt &&
        current.providerIdempotencyKeyIssuedAt.getTime() + IDEMPOTENCY_WINDOW_MS <=
          now.getTime()
      ) {
        await tx.emailDeliveryAttempt.create({
          data: {
            outboxId: current.id,
            attemptNumber: current.attempts,
            provider: current.provider ?? "unknown",
            providerIdempotencyKey: current.providerIdempotencyKey ?? providerIdempotencyKey(current.id),
            startedAt: now,
            completedAt: now,
            outcome: EmailDeliveryAttemptOutcome.UNCERTAIN,
            failureCode: "idempotency_window_expired",
            retryable: false,
            uncertainDelivery: true,
          },
        });
        await tx.emailOutbox.update({
          where: { id: current.id },
          data: {
            status: EmailOutboxStatus.REVIEW_REQUIRED,
            reviewRequiredAt: now,
            lastFailureCategory: "unknown_delivery",
            lastFailureCode: "idempotency_window_expired",
            lastFailureRetryable: false,
            nextAttemptAt: null,
            ...clearedLease(),
          },
        });
        return "review_required";
      }

      await tx.emailDeliveryAttempt.create({
        data: {
          outboxId: current.id,
          attemptNumber: current.attempts,
          provider: current.provider ?? "unknown",
          providerIdempotencyKey: current.providerIdempotencyKey ?? providerIdempotencyKey(current.id),
          startedAt: now,
          outcome: EmailDeliveryAttemptOutcome.PROCESSING,
        },
      });

      return "ready";
    });
  },

  async recordResult(email, result, now) {
    return db.$transaction(async (tx) => {
      const current = await tx.emailOutbox.findFirst({
        where: {
          id: email.id,
          status: EmailOutboxStatus.PROCESSING,
          leaseOwner: email.leaseOwner,
        },
      });

      if (!current) {
        return "skipped";
      }

      const attemptWhere = {
        outboxId_attemptNumber: {
          outboxId: current.id,
          attemptNumber: current.attempts,
        },
      };

      if (result.status === "accepted") {
        await tx.emailDeliveryAttempt.update({
          where: attemptWhere,
          data: {
            completedAt: now,
            outcome: EmailDeliveryAttemptOutcome.ACCEPTED,
            providerMessageId: result.providerMessageId,
            httpStatus: result.httpStatus,
            retryable: false,
          },
        });
        await tx.emailOutbox.update({
          where: { id: current.id },
          data: {
            status: EmailOutboxStatus.SENT,
            sentAt: current.sentAt ?? now,
            providerMessageId: result.providerMessageId,
            nextAttemptAt: null,
            uncertainSince: null,
            lastFailureCategory: null,
            lastFailureCode: null,
            lastFailureRetryable: null,
            lastError: null,
            ...clearedLease(),
          },
        });
        return "accepted";
      }

      if (result.status === "unknown") {
        const decision = uncertaintyRetryDecision({
          now,
          idempotencyKeyIssuedAt:
            current.providerIdempotencyKeyIssuedAt ?? now,
          attemptNumber: current.attempts,
          maxAttempts: current.maxAttempts,
          outboxId: current.id,
        });
        await tx.emailDeliveryAttempt.update({
          where: attemptWhere,
          data: {
            completedAt: now,
            outcome: EmailDeliveryAttemptOutcome.UNCERTAIN,
            failureCode: result.failureCode,
            retryable: decision.action === "retry",
            uncertainDelivery: true,
          },
        });
        await tx.emailOutbox.update({
          where: { id: current.id },
          data:
            decision.action === "retry"
              ? {
                  status: EmailOutboxStatus.RETRY_SCHEDULED,
                  nextAttemptAt: decision.retryAt,
                  uncertainSince: current.uncertainSince ?? now,
                  lastFailureCategory: result.failureCategory,
                  lastFailureCode: result.failureCode,
                  lastFailureRetryable: true,
                  ...clearedLease(),
                }
              : {
                  status: EmailOutboxStatus.REVIEW_REQUIRED,
                  reviewRequiredAt: now,
                  nextAttemptAt: null,
                  uncertainSince: current.uncertainSince ?? now,
                  lastFailureCategory: result.failureCategory,
                  lastFailureCode: "idempotency_window_exhausted",
                  lastFailureRetryable: false,
                  ...clearedLease(),
                },
        });
        return decision.action === "retry"
          ? "retry_scheduled"
          : "review_required";
      }

      const retryable =
        result.status === "retryable_failure" || result.status === "disabled";
      const failureCategory =
        result.status === "disabled" ? "provider_disabled" : result.failureCategory;
      const failureCode = result.failureCode;
      const canRetry = retryable && current.attempts < current.maxAttempts;

      await tx.emailDeliveryAttempt.update({
        where: attemptWhere,
        data: {
          completedAt: now,
          outcome: retryable
            ? EmailDeliveryAttemptOutcome.RETRYABLE_FAILURE
            : EmailDeliveryAttemptOutcome.PERMANENT_FAILURE,
          httpStatus:
            result.status === "disabled" ? null : result.httpStatus ?? null,
          failureCode,
          retryable,
        },
      });

      if (
        !retryable &&
        result.status === "permanent_failure" &&
        result.failureCategory === "invalid_recipient"
      ) {
        await upsertEmailSuppression(tx, {
          email: current.normalizedToEmail,
          reason: EmailSuppressionReason.INVALID_ADDRESS,
          provider: current.provider,
          source: "provider_send_rejection",
          occurredAt: now,
        });
      }

      await tx.emailOutbox.update({
        where: { id: current.id },
        data: canRetry
          ? {
              status: EmailOutboxStatus.RETRY_SCHEDULED,
              nextAttemptAt: new Date(
                now.getTime() +
                  calculateBackoffMs({
                    attemptNumber: current.attempts,
                    seed: current.id,
                    retryAfterMs:
                      result.status === "retryable_failure"
                        ? result.retryAfterMs
                        : undefined,
                  }),
              ),
              lastFailureCategory: failureCategory,
              lastFailureCode: failureCode,
              lastFailureRetryable: true,
              ...clearedLease(),
            }
          : {
              status: EmailOutboxStatus.PERMANENTLY_FAILED,
              failedAt: now,
              nextAttemptAt: null,
              lastFailureCategory: failureCategory,
              lastFailureCode: failureCode,
              lastFailureRetryable: retryable,
              ...clearedLease(),
            },
      });

      return canRetry ? "retry_scheduled" : "permanently_failed";
    });
  },
};

export async function processEmailOutboxWithDependencies(input: {
  provider: EmailProvider;
  repository: EmailOutboxRepository;
  batchSize?: number;
  leaseSeconds?: number;
  workerId?: string;
  now?: () => Date;
}): Promise<ProcessEmailOutboxResult> {
  const result: ProcessEmailOutboxResult = {
    claimed: 0,
    accepted: 0,
    retryScheduled: 0,
    permanentlyFailed: 0,
    suppressed: 0,
    reviewRequired: 0,
    skipped: 0,
    provider: input.provider.name,
    disabled: !input.provider.isConfigured,
  };

  if (!input.provider.isConfigured) {
    return result;
  }

  const now = input.now ?? (() => new Date());
  const workerId = (input.workerId ?? randomUUID()).slice(0, 120);
  const claimed = await input.repository.claimEligible({
    batchSize: boundedBatchSize(input.batchSize ?? DEFAULT_BATCH_SIZE),
    provider: input.provider.name,
    workerId,
    leaseSeconds: Math.max(
      30,
      Math.min(input.leaseSeconds ?? DEFAULT_LEASE_SECONDS, 900),
    ),
    now: now(),
  });
  result.claimed = claimed.length;

  for (const email of claimed) {
    let prepared: PrepareAttemptResult;
    try {
      prepared = await input.repository.prepareAttempt(email, now());
    } catch {
      result.skipped += 1;
      continue;
    }

    if (prepared === "suppressed") {
      result.suppressed += 1;
      continue;
    }

    if (prepared === "review_required") {
      result.reviewRequired += 1;
      continue;
    }

    if (prepared !== "ready" || !input.provider.isConfigured) {
      result.skipped += 1;
      continue;
    }

    let sendResult: EmailProviderSendResult;
    try {
      sendResult = await input.provider.send({
        toEmail: email.toEmail,
        subject: email.subject,
        textBody: email.textBody,
        htmlBody: email.htmlBody,
        idempotencyKey: email.providerIdempotencyKey,
        tags: [
          {
            name: "outbox_id",
            value: email.id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 256),
          },
          {
            name: "template",
            value: email.templateKey.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 256),
          },
        ],
      });
    } catch {
      sendResult = {
        status: "unknown",
        failureCategory: "unknown_delivery",
        failureCode: "provider_exception_outcome_unknown",
      };
    }

    let recorded: RecordedEmailResult;
    try {
      recorded = await input.repository.recordResult(email, sendResult, now());
    } catch {
      result.skipped += 1;
      continue;
    }
    if (recorded === "accepted") {
      result.accepted += 1;
    } else if (recorded === "retry_scheduled") {
      result.retryScheduled += 1;
    } else if (recorded === "permanently_failed") {
      result.permanentlyFailed += 1;
    } else if (recorded === "review_required") {
      result.reviewRequired += 1;
    } else {
      result.skipped += 1;
    }
  }

  return result;
}

export async function processEmailOutbox(batchSize?: number) {
  const config = getEmailProviderConfig();
  const provider = await getEmailProvider();

  return processEmailOutboxWithDependencies({
    provider,
    repository: prismaEmailOutboxRepository,
    batchSize: batchSize ?? config.batchSize,
    leaseSeconds: config.leaseSeconds,
  });
}

export const emailOutboxRepositoryForTests = prismaEmailOutboxRepository;
