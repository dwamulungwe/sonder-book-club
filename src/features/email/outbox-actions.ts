"use server";

import {
  EmailDeliveryAttemptOutcome,
  EmailOutboxStatus,
} from "@prisma/client";

import { requireEmailOutboxAdmin } from "@/features/email/outbox-permissions";
import { processEmailOutbox } from "@/features/email/outbox-processor";
import { db } from "@/lib/db";
import { getString } from "@/lib/form-data";
import { redirectWithNotice, resolveReturnPath } from "@/lib/navigation";

const MAX_MANUAL_ATTEMPTS = 8;
const MANUAL_BATCH_SIZE = 5;

export async function processEmailBatchAction(formData: FormData) {
  const redirectTo = resolveReturnPath(formData, "/admin/email-outbox");
  await requireEmailOutboxAdmin(redirectTo);

  const result = await processEmailOutbox(MANUAL_BATCH_SIZE);
  const message = result.disabled
    ? "Email provider is disabled; no messages were claimed."
    : `Processed ${result.claimed} email job${result.claimed === 1 ? "" : "s"}.`;

  redirectWithNotice(redirectTo, result.disabled ? "error" : "success", message);
}

export async function retryFailedEmailAction(formData: FormData) {
  const redirectTo = resolveReturnPath(formData, "/admin/email-outbox");
  const emailId = getString(formData, "emailId");
  await requireEmailOutboxAdmin(redirectTo);

  const email = await db.emailOutbox.findUnique({
    where: { id: emailId },
    select: {
      status: true,
      attempts: true,
      maxAttempts: true,
      lastFailureRetryable: true,
      uncertainSince: true,
      normalizedToEmail: true,
    },
  });
  const suppression = email
    ? await db.emailSuppression.findUnique({
        where: { normalizedEmail: email.normalizedToEmail },
        select: { active: true },
      })
    : null;
  const eligibleStatus =
    email?.status === EmailOutboxStatus.RETRY_SCHEDULED ||
    ((email?.status === EmailOutboxStatus.PERMANENTLY_FAILED ||
      email?.status === EmailOutboxStatus.FAILED) &&
      email.lastFailureRetryable === true);

  if (
    !email ||
    !eligibleStatus ||
    email.uncertainSince ||
    suppression?.active ||
    (email.attempts >= email.maxAttempts &&
      email.maxAttempts >= MAX_MANUAL_ATTEMPTS)
  ) {
    redirectWithNotice(
      redirectTo,
      "error",
      "Only safe transient failures without active suppression can be retried.",
    );
  }

  const updated = await db.emailOutbox.updateMany({
    where: {
      id: emailId,
      attempts: email.attempts,
      maxAttempts: email.maxAttempts,
      uncertainSince: null,
      OR: [
        { status: EmailOutboxStatus.RETRY_SCHEDULED },
        {
          status: {
            in: [
              EmailOutboxStatus.PERMANENTLY_FAILED,
              EmailOutboxStatus.FAILED,
            ],
          },
          lastFailureRetryable: true,
        },
      ],
    },
    data: {
      status: EmailOutboxStatus.RETRY_SCHEDULED,
      nextAttemptAt: new Date(),
      maxAttempts:
        email.attempts >= email.maxAttempts
          ? Math.min(email.maxAttempts + 1, MAX_MANUAL_ATTEMPTS)
          : email.maxAttempts,
      reviewRequiredAt: null,
    },
  });

  if (updated.count !== 1) {
    redirectWithNotice(
      redirectTo,
      "error",
      "Email state changed before the retry could be scheduled.",
    );
  }

  redirectWithNotice(redirectTo, "success", "Transient email retry scheduled.");
}

export async function cancelEmailAction(formData: FormData) {
  const redirectTo = resolveReturnPath(formData, "/admin/email-outbox");
  const emailId = getString(formData, "emailId");
  await requireEmailOutboxAdmin(redirectTo);

  const updated = await db.emailOutbox.updateMany({
    where: {
      id: emailId,
      status: {
        in: [
          EmailOutboxStatus.PENDING,
          EmailOutboxStatus.RETRY_SCHEDULED,
        ],
      },
    },
    data: {
      status: EmailOutboxStatus.CANCELLED,
      cancelledAt: new Date(),
      nextAttemptAt: null,
      processingStartedAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
    },
  });

  if (updated.count !== 1) {
    redirectWithNotice(
      redirectTo,
      "error",
      "Only unsent queued or retry-scheduled emails can be cancelled.",
    );
  }

  redirectWithNotice(redirectTo, "success", "Email cancelled.");
}

export async function moveUncertainEmailToReviewAction(formData: FormData) {
  const redirectTo = resolveReturnPath(formData, "/admin/email-outbox");
  const emailId = getString(formData, "emailId");
  await requireEmailOutboxAdmin(redirectTo);
  const now = new Date();

  const [, updated] = await db.$transaction([
    db.emailDeliveryAttempt.updateMany({
      where: {
        outboxId: emailId,
        outcome: EmailDeliveryAttemptOutcome.PROCESSING,
        outbox: {
          uncertainSince: { not: null },
          status: EmailOutboxStatus.PROCESSING,
          leaseExpiresAt: { lte: now },
        },
      },
      data: {
        outcome: EmailDeliveryAttemptOutcome.UNCERTAIN,
        completedAt: now,
        failureCode: "admin_review_requested",
        retryable: false,
        uncertainDelivery: true,
      },
    }),
    db.emailOutbox.updateMany({
      where: {
        id: emailId,
        uncertainSince: { not: null },
        OR: [
          { status: EmailOutboxStatus.RETRY_SCHEDULED },
          {
            status: EmailOutboxStatus.PROCESSING,
            leaseExpiresAt: { lte: now },
          },
        ],
      },
      data: {
        status: EmailOutboxStatus.REVIEW_REQUIRED,
        reviewRequiredAt: now,
        nextAttemptAt: null,
        processingStartedAt: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastFailureCategory: "unknown_delivery",
        lastFailureCode: "admin_review_requested",
        lastFailureRetryable: false,
      },
    }),
  ]);

  if (updated.count !== 1) {
    redirectWithNotice(
      redirectTo,
      "error",
      "Only an uncertain retry or expired lease can be moved to review.",
    );
  }

  redirectWithNotice(redirectTo, "success", "Email moved to delivery review.");
}
