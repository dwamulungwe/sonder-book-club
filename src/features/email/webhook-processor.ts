import {
  EmailOutboxStatus,
  EmailSuppressionReason,
  EmailWebhookProcessingStatus,
  Prisma,
} from "@prisma/client";

import type { NormalizedEmailDeliveryEvent } from "@/features/email/provider";
import { upsertEmailSuppression } from "@/features/email/suppression";
import { db } from "@/lib/db";

const ADVERSE_TERMINAL_STATUSES = new Set<EmailOutboxStatus>([
  EmailOutboxStatus.BOUNCED,
  EmailOutboxStatus.COMPLAINED,
  EmailOutboxStatus.SUPPRESSED,
]);

export function webhookEventDisposition(input: {
  existingStatus?: EmailWebhookProcessingStatus;
  existingPayloadHash?: string;
  payloadHash: string;
  providerMessageId: string | null;
  outboxFound?: boolean;
}) {
  if (
    input.existingPayloadHash &&
    input.existingPayloadHash !== input.payloadHash
  ) {
    return "identity_mismatch" as const;
  }

  if (
    input.existingStatus &&
    input.existingStatus !== EmailWebhookProcessingStatus.RECEIVED &&
    input.existingStatus !== EmailWebhookProcessingStatus.FAILED
  ) {
    return "duplicate" as const;
  }

  if (!input.providerMessageId) {
    return "missing_message_id" as const;
  }

  if (input.outboxFound === false) {
    return "unknown_message_id" as const;
  }

  return "process" as const;
}

function eventIsOlder(input: {
  eventTimestamp: Date;
  lastDeliveryEventAt: Date | null;
}) {
  return Boolean(
    input.lastDeliveryEventAt &&
      input.eventTimestamp < input.lastDeliveryEventAt,
  );
}

type DeliveryEventTransition = {
  status?: EmailOutboxStatus;
  sentAt?: Date;
  deliveredAt?: Date;
  deliveryDelayedAt?: Date;
  failedAt?: Date;
  bouncedAt?: Date;
  complainedAt?: Date;
  suppressedAt?: Date;
  nextAttemptAt?: null;
  lastFailureCategory?: string | null;
  lastFailureCode?: string | null;
  lastFailureRetryable?: boolean | null;
  lastDeliveryEventAt?: Date;
  lastDeliveryEventType?: string;
};

export function deliveryEventTransition(input: {
  currentStatus: EmailOutboxStatus;
  lastDeliveryEventAt: Date | null;
  sentAt?: Date | null;
  event: NormalizedEmailDeliveryEvent;
}): DeliveryEventTransition {
  const { currentStatus, event } = input;
  const older = eventIsOlder({
    eventTimestamp: event.eventTimestamp,
    lastDeliveryEventAt: input.lastDeliveryEventAt,
  });
  const adverseTerminal = ADVERSE_TERMINAL_STATUSES.has(currentStatus);
  const common =
    !input.lastDeliveryEventAt || event.eventTimestamp >= input.lastDeliveryEventAt
      ? {
          lastDeliveryEventAt: event.eventTimestamp,
          lastDeliveryEventType: event.providerEventType,
        }
      : {};

  if (event.eventType === "complained") {
    return {
      status: EmailOutboxStatus.COMPLAINED,
      complainedAt: event.eventTimestamp,
      lastFailureCategory: "recipient_complaint",
      lastFailureCode: event.failureCode ?? "recipient_complained",
      lastFailureRetryable: false,
      nextAttemptAt: null,
      ...common,
    };
  }

  if (event.eventType === "bounced") {
    if (currentStatus === EmailOutboxStatus.COMPLAINED) {
      return common;
    }

    return {
      status: EmailOutboxStatus.BOUNCED,
      bouncedAt: event.eventTimestamp,
      lastFailureCategory: "hard_bounce",
      lastFailureCode: event.failureCode ?? "hard_bounce",
      lastFailureRetryable: false,
      nextAttemptAt: null,
      ...common,
    };
  }

  if (event.eventType === "suppressed") {
    if (
      currentStatus === EmailOutboxStatus.COMPLAINED ||
      currentStatus === EmailOutboxStatus.BOUNCED
    ) {
      return common;
    }

    return {
      status: EmailOutboxStatus.SUPPRESSED,
      suppressedAt: event.eventTimestamp,
      lastFailureCategory: "provider_suppression",
      lastFailureCode: event.failureCode ?? "provider_suppressed",
      lastFailureRetryable: false,
      nextAttemptAt: null,
      ...common,
    };
  }

  if (event.eventType === "delivered") {
    if (adverseTerminal || older) {
      return {
        ...(adverseTerminal ? { deliveredAt: event.eventTimestamp } : {}),
        ...common,
      };
    }

    return {
      status: EmailOutboxStatus.DELIVERED,
      sentAt: input.sentAt ?? event.eventTimestamp,
      deliveredAt: event.eventTimestamp,
      nextAttemptAt: null,
      lastFailureCategory: null,
      lastFailureCode: null,
      lastFailureRetryable: null,
      ...common,
    };
  }

  if (event.eventType === "delivery_delayed") {
    if (
      adverseTerminal ||
      currentStatus === EmailOutboxStatus.DELIVERED ||
      older
    ) {
      return common;
    }

    return {
      status: EmailOutboxStatus.DELIVERY_DELAYED,
      sentAt: input.sentAt ?? event.eventTimestamp,
      deliveryDelayedAt: event.eventTimestamp,
      nextAttemptAt: null,
      lastFailureCategory: "delivery_delayed",
      lastFailureCode: event.failureCode ?? "temporary_delivery_delay",
      lastFailureRetryable: false,
      ...common,
    };
  }

  if (event.eventType === "failed") {
    if (
      adverseTerminal ||
      currentStatus === EmailOutboxStatus.DELIVERED ||
      older
    ) {
      return common;
    }

    return {
      status: EmailOutboxStatus.PERMANENTLY_FAILED,
      failedAt: event.eventTimestamp,
      nextAttemptAt: null,
      lastFailureCategory: "provider_delivery_failure",
      lastFailureCode: event.failureCode ?? "provider_delivery_failed",
      lastFailureRetryable: false,
      ...common,
    };
  }

  if (event.eventType === "accepted") {
    if (
      adverseTerminal ||
      currentStatus === EmailOutboxStatus.DELIVERED ||
      currentStatus === EmailOutboxStatus.DELIVERY_DELAYED ||
      older
    ) {
      return common;
    }

    return {
      status: EmailOutboxStatus.SENT,
      sentAt: event.eventTimestamp,
      ...common,
    };
  }

  return common;
}

function suppressionReasonForEvent(event: NormalizedEmailDeliveryEvent) {
  if (event.eventType === "bounced") {
    return EmailSuppressionReason.HARD_BOUNCE;
  }

  if (event.eventType === "complained") {
    return EmailSuppressionReason.COMPLAINT;
  }

  if (event.eventType === "suppressed") {
    return EmailSuppressionReason.PROVIDER_SUPPRESSION;
  }

  return null;
}

async function processVerifiedEventTransaction(
  event: NormalizedEmailDeliveryEvent,
) {
  return db.$transaction(async (tx) => {
    const existing = await tx.emailProviderWebhookEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider: event.provider,
          providerEventId: event.providerEventId,
        },
      },
    });

    const initialDisposition = webhookEventDisposition({
      existingStatus: existing?.status,
      existingPayloadHash: existing?.payloadHash,
      payloadHash: event.payloadHash,
      providerMessageId: event.providerMessageId,
    });

    if (initialDisposition === "identity_mismatch" && existing) {
      await tx.emailProviderWebhookEvent.update({
        where: { id: existing.id },
        data: {
          status: EmailWebhookProcessingStatus.REVIEW_REQUIRED,
          processedAt: new Date(),
          failureReason: "event_identity_payload_mismatch",
        },
      });

      return { duplicate: true, reviewRequired: true };
    }

    if (initialDisposition === "duplicate") {
      return { duplicate: true, reviewRequired: false };
    }

    const storedEvent =
      existing ??
      (await tx.emailProviderWebhookEvent.create({
        data: {
          provider: event.provider,
          providerEventId: event.providerEventId,
          providerMessageId: event.providerMessageId,
          eventType: event.providerEventType,
          eventTimestamp: event.eventTimestamp,
          payloadHash: event.payloadHash,
          status: EmailWebhookProcessingStatus.RECEIVED,
        },
      }));

    if (initialDisposition === "missing_message_id") {
      await tx.emailProviderWebhookEvent.update({
        where: { id: storedEvent.id },
        data: {
          status: EmailWebhookProcessingStatus.REVIEW_REQUIRED,
          processedAt: new Date(),
          failureReason: "provider_message_id_missing",
        },
      });

      return { duplicate: Boolean(existing), reviewRequired: true };
    }

    const outbox = await tx.emailOutbox.findFirst({
      where: {
        provider: event.provider,
        providerMessageId: event.providerMessageId,
      },
    });

    const outboxDisposition = webhookEventDisposition({
        existingStatus: existing?.status,
        existingPayloadHash: existing?.payloadHash,
        payloadHash: event.payloadHash,
        providerMessageId: event.providerMessageId,
        outboxFound: Boolean(outbox),
      });

    if (outboxDisposition === "unknown_message_id" || !outbox) {
      await tx.emailProviderWebhookEvent.update({
        where: { id: storedEvent.id },
        data: {
          status: EmailWebhookProcessingStatus.REVIEW_REQUIRED,
          processedAt: new Date(),
          failureReason: "outbox_not_found",
        },
      });

      return { duplicate: Boolean(existing), reviewRequired: true };
    }

    if (event.eventType === "ignored") {
      await tx.emailProviderWebhookEvent.update({
        where: { id: storedEvent.id },
        data: {
          status: EmailWebhookProcessingStatus.IGNORED,
          processedAt: new Date(),
          failureReason: "event_type_not_tracked",
          outboxId: outbox.id,
        },
      });

      return { duplicate: Boolean(existing), reviewRequired: false };
    }

    const transition = deliveryEventTransition({
      currentStatus: outbox.status,
      lastDeliveryEventAt: outbox.lastDeliveryEventAt,
      sentAt: outbox.sentAt,
      event,
    });

    await tx.emailOutbox.update({
      where: { id: outbox.id },
      data: transition,
    });

    const suppressionReason = suppressionReasonForEvent(event);
    if (suppressionReason) {
      await upsertEmailSuppression(tx, {
        email: outbox.normalizedToEmail,
        reason: suppressionReason,
        provider: event.provider,
        source: event.providerEventType,
        occurredAt: event.eventTimestamp,
      });
    }

    await tx.emailProviderWebhookEvent.update({
      where: { id: storedEvent.id },
      data: {
        status: EmailWebhookProcessingStatus.PROCESSED,
        processedAt: new Date(),
        failureReason: null,
        outboxId: outbox.id,
      },
    });

    return { duplicate: Boolean(existing), reviewRequired: false };
  });
}

export async function processVerifiedEmailDeliveryEvent(
  event: NormalizedEmailDeliveryEvent,
  retryAfterUniqueRace = true,
) {
  try {
    return await processVerifiedEventTransaction(event);
  } catch (error) {
    if (
      retryAfterUniqueRace &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return processVerifiedEmailDeliveryEvent(event, false);
    }

    throw error;
  }
}
