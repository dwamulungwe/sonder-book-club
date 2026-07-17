import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  EmailSuppressionReason,
  MembershipStatus,
  SystemRole,
} from "@prisma/client";

import { chooseSuppressionReason } from "@/features/email/suppression";
import { renderEmailTemplate } from "@/features/email/templates";
import {
  notificationDedupeKey,
  shouldQueueEmail,
  type NotificationPreferenceSnapshot,
} from "@/features/notifications/service";
import { canAdministerEmailOutbox } from "@/lib/permissions";

const ORIGINAL_ENV = { ...process.env };

const OPTED_OUT: NotificationPreferenceSnapshot = {
  inAppCommunityActivity: false,
  inAppAnnouncements: false,
  inAppApplicationUpdates: false,
  inAppBillingUpdates: false,
  emailCommunityActivity: false,
  emailAnnouncements: false,
  emailApplicationUpdates: false,
  emailMeetingUpdates: false,
  emailBillingUpdates: false,
};

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("essential transactional email is not suppressed by marketing preferences", () => {
  assert.equal(
    shouldQueueEmail(OPTED_OUT, "application", "transactional"),
    true,
  );
  assert.equal(
    shouldQueueEmail(OPTED_OUT, "billing", "transactional"),
    true,
  );
  assert.equal(shouldQueueEmail(OPTED_OUT, "community", "optional"), false);
  assert.equal(shouldQueueEmail(OPTED_OUT, "announcement", "optional"), false);

  assert.equal(
    shouldQueueEmail(
      { ...OPTED_OUT, emailCommunityActivity: true },
      "community",
      "optional",
    ),
    true,
  );
});

test("business deduplication keys are stable and bounded", () => {
  const first = notificationDedupeKey("email", "payment", "payment-1", "user-1");
  const duplicate = notificationDedupeKey(
    "email",
    "payment",
    "payment-1",
    "user-1",
  );
  const separate = notificationDedupeKey(
    "email",
    "payment",
    "payment-2",
    "user-1",
  );

  assert.equal(first, duplicate);
  assert.notEqual(first, separate);
  assert.ok(notificationDedupeKey("x".repeat(500)).length <= 240);
});

test("templates are deterministic, escape HTML, include text, and use trusted HTTPS links", () => {
  Object.assign(process.env, {
    NODE_ENV: "production",
    SONDER_APP_BASE_URL: "https://club.example.test",
  });
  const input = {
    recipientName: '<script>alert("x")</script>',
    announcementTitle: "Reading & reflection",
    announcementBody: "<img src=x onerror=alert(1)>",
    announcementHref: "//attacker.example/path",
  };
  const first = renderEmailTemplate("announcement_published", input);
  const second = renderEmailTemplate("announcement_published", input);

  assert.deepEqual(first, second);
  assert.ok(first.textBody.length > 0);
  assert.ok(first.htmlBody.length > 0);
  assert.doesNotMatch(first.htmlBody, /<script>|<img/i);
  assert.match(first.htmlBody, /&lt;script&gt;/);
  assert.match(first.textBody, /https:\/\/club\.example\.test\/announcements/);
  assert.doesNotMatch(first.textBody, /attacker\.example/);
  assert.equal(first.templateVersion, 1);
});

test("billing template preserves trusted ZMW wording and excludes unapproved fields", () => {
  Object.assign(process.env, {
    NODE_ENV: "production",
    SONDER_APP_BASE_URL: "https://club.example.test",
  });
  const rendered = renderEmailTemplate("payment_confirmed", {
    recipientName: "Reader",
    amountFormatted: "ZMW 125.50",
    invoiceNumber: "INV-001",
    paymentReference: "PAY-001",
    billingHref: "/membership/billing",
    ...( { internalAdminNotes: "private" } as Record<string, string> ),
  });

  assert.match(rendered.textBody, /ZMW 125\.50/);
  assert.match(rendered.textBody, /https:\/\/club\.example\.test\/membership\/billing/);
  assert.doesNotMatch(rendered.textBody, /private|internal admin/i);
  assert.doesNotMatch(rendered.htmlBody, /private|internal admin/i);
});

test("complaint and administrative suppression cannot be downgraded by duplicate events", () => {
  assert.equal(
    chooseSuppressionReason(
      EmailSuppressionReason.COMPLAINT,
      EmailSuppressionReason.HARD_BOUNCE,
    ),
    EmailSuppressionReason.COMPLAINT,
  );
  assert.equal(
    chooseSuppressionReason(
      EmailSuppressionReason.HARD_BOUNCE,
      EmailSuppressionReason.PROVIDER_SUPPRESSION,
    ),
    EmailSuppressionReason.HARD_BOUNCE,
  );
  assert.equal(
    chooseSuppressionReason(
      EmailSuppressionReason.INVALID_ADDRESS,
      EmailSuppressionReason.COMPLAINT,
    ),
    EmailSuppressionReason.COMPLAINT,
  );
});

test("email administration is active-ADMIN only and denies moderators", () => {
  const activeAdmin = {
    role: SystemRole.ADMIN,
    status: MembershipStatus.ACTIVE,
  };
  const moderator = {
    role: SystemRole.MODERATOR,
    status: MembershipStatus.ACTIVE,
  };

  assert.equal(
    canAdministerEmailOutbox({ systemRole: SystemRole.ADMIN }, activeAdmin),
    true,
  );
  assert.equal(
    canAdministerEmailOutbox({ systemRole: SystemRole.MODERATOR }, moderator),
    false,
  );
  assert.equal(
    canAdministerEmailOutbox(
      { systemRole: SystemRole.ADMIN },
      { role: SystemRole.ADMIN, status: MembershipStatus.SUSPENDED },
    ),
    false,
  );
});

test("tracked environment names and server config stay server-only", async () => {
  const configSource = await readFile(
    new URL("./server-config.ts", import.meta.url),
    "utf8",
  );
  const envExample = await readFile(
    new URL("../../../.env.example", import.meta.url),
    "utf8",
  );

  assert.match(configSource, /import "server-only"/);
  assert.doesNotMatch(configSource, /NEXT_PUBLIC_/);
  assert.doesNotMatch(envExample, /NEXT_PUBLIC_.*(EMAIL|RESEND|CRON)/);
  for (const name of [
    "SONDER_EMAIL_PROVIDER",
    "SONDER_EMAIL_FROM",
    "SONDER_EMAIL_REPLY_TO",
    "RESEND_API_KEY",
    "RESEND_WEBHOOK_SIGNING_SECRET",
    "CRON_SECRET",
  ]) {
    assert.match(envExample, new RegExp(`^${name}=`, "m"));
  }
});

test("migration preserves integrity constraints and splits enum additions", async () => {
  const enumMigration = await readFile(
    new URL(
      "../../../prisma/migrations/20260717120000_email_outbox_status_values/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const foundationMigration = await readFile(
    new URL(
      "../../../prisma/migrations/20260717120100_email_delivery_foundation/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(enumMigration, /ALTER TYPE "EmailOutboxStatus" ADD VALUE/);
  assert.doesNotMatch(enumMigration, /CREATE TABLE/);
  assert.match(foundationMigration, /FOR(?:EIGN)? KEY|FOREIGN KEY/);
  assert.match(foundationMigration, /attempt_counts_check/);
  assert.match(foundationMigration, /providerIdempotencyKey/);
  assert.match(foundationMigration, /provider_providerMessageId_key/);
  assert.match(foundationMigration, /outboxId_attemptNumber_key/);
  assert.match(foundationMigration, /provider_providerEventId_key/);
  assert.match(foundationMigration, /payloadHash_idx/);
  assert.match(foundationMigration, /ON DELETE RESTRICT/);
});
