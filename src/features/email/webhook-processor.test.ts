import assert from "node:assert/strict";
import test from "node:test";
import {
  EmailOutboxStatus,
  EmailWebhookProcessingStatus,
} from "@prisma/client";

import type { NormalizedEmailDeliveryEvent } from "@/features/email/provider";
import {
  deliveryEventTransition,
  webhookEventDisposition,
} from "@/features/email/webhook-processor";

function event(
  eventType: NormalizedEmailDeliveryEvent["eventType"],
  eventTimestamp = new Date("2026-07-17T12:00:00.000Z"),
): NormalizedEmailDeliveryEvent {
  return {
    provider: "resend",
    providerEventId: `event-${eventType}`,
    providerMessageId: "message-1",
    eventType,
    providerEventType:
      eventType === "delivery_delayed"
        ? "email.delivery_delayed"
        : `email.${eventType === "accepted" ? "sent" : eventType}`,
    eventTimestamp,
    payloadHash: "a".repeat(64),
    recipientEmail: "reader@example.test",
    failureCode: null,
  };
}

test("duplicate webhook identities create no duplicate effect", () => {
  assert.equal(
    webhookEventDisposition({
      existingStatus: EmailWebhookProcessingStatus.PROCESSED,
      existingPayloadHash: "a".repeat(64),
      payloadHash: "a".repeat(64),
      providerMessageId: "message-1",
    }),
    "duplicate",
  );
});

test("failed or received webhook processing is safe to redeliver", () => {
  for (const status of [
    EmailWebhookProcessingStatus.RECEIVED,
    EmailWebhookProcessingStatus.FAILED,
  ]) {
    assert.equal(
      webhookEventDisposition({
        existingStatus: status,
        existingPayloadHash: "a".repeat(64),
        payloadHash: "a".repeat(64),
        providerMessageId: "message-1",
      }),
      "process",
    );
  }
});

test("unknown provider message IDs and identity payload mismatches require review", () => {
  assert.equal(
    webhookEventDisposition({
      payloadHash: "a".repeat(64),
      providerMessageId: "unknown-message",
      outboxFound: false,
    }),
    "unknown_message_id",
  );
  assert.equal(
    webhookEventDisposition({
      existingStatus: EmailWebhookProcessingStatus.PROCESSED,
      existingPayloadHash: "a".repeat(64),
      payloadHash: "b".repeat(64),
      providerMessageId: "message-1",
    }),
    "identity_mismatch",
  );
  assert.equal(
    webhookEventDisposition({
      payloadHash: "a".repeat(64),
      providerMessageId: null,
    }),
    "missing_message_id",
  );
});

test("accepted and delayed events cannot downgrade delivered", () => {
  const deliveredAt = new Date("2026-07-17T12:00:00.000Z");
  const accepted = deliveryEventTransition({
    currentStatus: EmailOutboxStatus.DELIVERED,
    lastDeliveryEventAt: deliveredAt,
    event: event("accepted", new Date("2026-07-17T11:00:00.000Z")),
  });
  const delayed = deliveryEventTransition({
    currentStatus: EmailOutboxStatus.DELIVERED,
    lastDeliveryEventAt: deliveredAt,
    event: event("delivery_delayed", new Date("2026-07-17T13:00:00.000Z")),
  });

  assert.equal(accepted.status, undefined);
  assert.equal(delayed.status, undefined);
});

test("delivered never erases a later complaint", () => {
  const transition = deliveryEventTransition({
    currentStatus: EmailOutboxStatus.COMPLAINED,
    lastDeliveryEventAt: new Date("2026-07-17T13:00:00.000Z"),
    event: event("delivered", new Date("2026-07-17T12:00:00.000Z")),
  });

  assert.equal(transition.status, undefined);
  assert.equal(transition.deliveredAt?.toISOString(), "2026-07-17T12:00:00.000Z");
});

test("complaint, bounce, and suppression precedence is conservative", () => {
  const complaint = deliveryEventTransition({
    currentStatus: EmailOutboxStatus.DELIVERED,
    lastDeliveryEventAt: new Date("2026-07-17T12:00:00.000Z"),
    event: event("complained", new Date("2026-07-17T13:00:00.000Z")),
  });
  const bounceAfterComplaint = deliveryEventTransition({
    currentStatus: EmailOutboxStatus.COMPLAINED,
    lastDeliveryEventAt: new Date("2026-07-17T13:00:00.000Z"),
    event: event("bounced", new Date("2026-07-17T14:00:00.000Z")),
  });
  const suppressionAfterBounce = deliveryEventTransition({
    currentStatus: EmailOutboxStatus.BOUNCED,
    lastDeliveryEventAt: new Date("2026-07-17T13:00:00.000Z"),
    event: event("suppressed", new Date("2026-07-17T14:00:00.000Z")),
  });

  assert.equal(complaint.status, EmailOutboxStatus.COMPLAINED);
  assert.equal(bounceAfterComplaint.status, undefined);
  assert.equal(suppressionAfterBounce.status, undefined);
});

test("delivery delayed records provider state without scheduling a second send", () => {
  const transition = deliveryEventTransition({
    currentStatus: EmailOutboxStatus.SENT,
    lastDeliveryEventAt: new Date("2026-07-17T11:00:00.000Z"),
    event: event("delivery_delayed"),
  });

  assert.equal(transition.status, EmailOutboxStatus.DELIVERY_DELAYED);
  assert.equal(transition.nextAttemptAt, null);
  assert.equal(transition.lastFailureRetryable, false);
});

test("webhook failed state is terminal and never schedules a duplicate email", () => {
  const transition = deliveryEventTransition({
    currentStatus: EmailOutboxStatus.SENT,
    lastDeliveryEventAt: new Date("2026-07-17T11:00:00.000Z"),
    event: { ...event("failed"), failureCode: "validation_error" },
  });

  assert.equal(transition.status, EmailOutboxStatus.PERMANENTLY_FAILED);
  assert.equal(transition.nextAttemptAt, null);
  assert.equal(transition.lastFailureRetryable, false);
});
