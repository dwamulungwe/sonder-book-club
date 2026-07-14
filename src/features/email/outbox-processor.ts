import { EmailOutboxStatus, Prisma } from "@prisma/client";

import { getEmailProvider } from "@/features/email/provider";
import { db } from "@/lib/db";

const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 50;

type ClaimedEmail = {
  id: string;
  toEmail: string;
  subject: string;
  payload: Prisma.JsonValue;
  attempts: number;
  maxAttempts: number;
};

type ProcessEmailOutboxResult = {
  claimed: number;
  sent: number;
  failed: number;
  deferred: number;
  provider: string;
  disabled: boolean;
};

function boundedBatchSize(batchSize: number) {
  if (!Number.isFinite(batchSize)) {
    return DEFAULT_BATCH_SIZE;
  }

  return Math.max(1, Math.min(Math.floor(batchSize), MAX_BATCH_SIZE));
}

function sanitizeErrorMessage(error: unknown) {
  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown email provider error.";

  return raw
    .replace(/(password|secret|token|key|authorization|bearer)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .slice(0, 1000);
}

function backoffMinutes(attempts: number) {
  return Math.min(60, Math.max(5, attempts * attempts * 5));
}

function getRenderedPayload(payload: Prisma.JsonValue) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      textBody: "",
      htmlBody: null,
    };
  }

  const record = payload as Record<string, Prisma.JsonValue>;
  return {
    textBody: typeof record.textBody === "string" ? record.textBody : "",
    htmlBody: typeof record.htmlBody === "string" ? record.htmlBody : null,
  };
}

async function claimPendingEmails(batchSize: number) {
  const now = new Date();

  return db.$transaction(async (tx) => {
    return tx.$queryRaw<ClaimedEmail[]>`
      UPDATE "email_outbox"
      SET
        "status" = 'PROCESSING'::"EmailOutboxStatus",
        "processingStartedAt" = ${now},
        "attempts" = "attempts" + 1,
        "updatedAt" = ${now}
      WHERE "id" IN (
        SELECT "id"
        FROM "email_outbox"
        WHERE "status" = 'PENDING'::"EmailOutboxStatus"
          AND "attempts" < "maxAttempts"
          AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= ${now})
        ORDER BY "createdAt" ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id", "toEmail", "subject", "payload", "attempts", "maxAttempts"
    `;
  });
}

export async function processEmailOutbox(
  batchSize = DEFAULT_BATCH_SIZE,
): Promise<ProcessEmailOutboxResult> {
  const provider = getEmailProvider();

  if (!provider.isConfigured) {
    return {
      claimed: 0,
      sent: 0,
      failed: 0,
      deferred: 0,
      provider: provider.name,
      disabled: true,
    };
  }

  const claimedEmails = await claimPendingEmails(boundedBatchSize(batchSize));
  const result: ProcessEmailOutboxResult = {
    claimed: claimedEmails.length,
    sent: 0,
    failed: 0,
    deferred: 0,
    provider: provider.name,
    disabled: false,
  };

  for (const email of claimedEmails) {
    const rendered = getRenderedPayload(email.payload);

    try {
      const sendResult = await provider.send({
        toEmail: email.toEmail,
        subject: email.subject,
        textBody: rendered.textBody,
        htmlBody: rendered.htmlBody,
      });

      if (sendResult.status === "sent") {
        await db.emailOutbox.updateMany({
          where: {
            id: email.id,
            status: EmailOutboxStatus.PROCESSING,
          },
          data: {
            status: EmailOutboxStatus.SENT,
            sentAt: new Date(),
            providerMessageId: sendResult.providerMessageId,
            processingStartedAt: null,
            nextAttemptAt: null,
            lastError: null,
          },
        });
        result.sent += 1;
        continue;
      }

      if (sendResult.status === "disabled") {
        await db.emailOutbox.updateMany({
          where: {
            id: email.id,
            status: EmailOutboxStatus.PROCESSING,
          },
          data: {
            status: EmailOutboxStatus.PENDING,
            processingStartedAt: null,
            lastError: sendResult.message,
          },
        });
        result.deferred += 1;
        continue;
      }

      const attemptsRemaining =
        sendResult.retryable && email.attempts < email.maxAttempts;
      await db.emailOutbox.updateMany({
        where: {
          id: email.id,
          status: EmailOutboxStatus.PROCESSING,
        },
        data: {
          status: attemptsRemaining
            ? EmailOutboxStatus.PENDING
            : EmailOutboxStatus.FAILED,
          processingStartedAt: null,
          nextAttemptAt: attemptsRemaining
            ? new Date(Date.now() + backoffMinutes(email.attempts) * 60 * 1000)
            : null,
          lastError: sanitizeErrorMessage(sendResult.error),
        },
      });
      result.failed += attemptsRemaining ? 0 : 1;
      result.deferred += attemptsRemaining ? 1 : 0;
    } catch (error) {
      const attemptsRemaining = email.attempts < email.maxAttempts;
      await db.emailOutbox.updateMany({
        where: {
          id: email.id,
          status: EmailOutboxStatus.PROCESSING,
        },
        data: {
          status: attemptsRemaining
            ? EmailOutboxStatus.PENDING
            : EmailOutboxStatus.FAILED,
          processingStartedAt: null,
          nextAttemptAt: attemptsRemaining
            ? new Date(Date.now() + backoffMinutes(email.attempts) * 60 * 1000)
            : null,
          lastError: sanitizeErrorMessage(error),
        },
      });
      result.failed += attemptsRemaining ? 0 : 1;
      result.deferred += attemptsRemaining ? 1 : 0;
    }
  }

  return result;
}
