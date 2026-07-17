import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { EmailOutboxStatus } from "@prisma/client";

import type {
  ClaimedEmail,
  EmailOutboxRepository,
} from "@/features/email/outbox-processor";
import {
  calculateBackoffMs,
  processEmailOutboxWithDependencies,
  providerIdempotencyKey,
  uncertaintyRetryDecision,
} from "@/features/email/outbox-processor";
import type {
  EmailProvider,
  EmailProviderSendResult,
} from "@/features/email/provider";
import { createFakeEmailProvider } from "@/features/email/providers/fake";

type TestRow = {
  email: ClaimedEmail;
  status: EmailOutboxStatus;
  nextAttemptAt: Date | null;
  suppressed: boolean;
  suppressOnPrepare: boolean;
  recorded: EmailProviderSendResult[];
};

function claimedEmail(id: string, overrides: Partial<ClaimedEmail> = {}): ClaimedEmail {
  const now = new Date("2026-07-17T10:00:00.000Z");
  return {
    id,
    recipientUserId: `user-${id}`,
    toEmail: `${id}@example.test`,
    normalizedToEmail: `${id}@example.test`,
    subject: `Subject ${id}`,
    textBody: `Text ${id}`,
    htmlBody: `<p>Text ${id}</p>`,
    templateKey: "application_received",
    attempts: 0,
    maxAttempts: 5,
    providerIdempotencyKey: providerIdempotencyKey(id),
    providerIdempotencyKeyIssuedAt: now,
    uncertainSince: null,
    leaseOwner: "",
    leaseExpiresAt: now,
    ...overrides,
  };
}

class TestRepository implements EmailOutboxRepository {
  rows: TestRow[];
  inTransaction = false;
  preparedAttempts: string[] = [];

  constructor(rows: TestRow[]) {
    this.rows = rows;
  }

  async claimEligible(input: Parameters<EmailOutboxRepository["claimEligible"]>[0]) {
    this.inTransaction = true;
    const claimed: ClaimedEmail[] = [];

    for (const row of this.rows) {
      if (claimed.length >= input.batchSize) break;

      if (row.suppressed) {
        row.status = EmailOutboxStatus.SUPPRESSED;
        continue;
      }

      const due = !row.nextAttemptAt || row.nextAttemptAt <= input.now;
      const stale =
        row.status === EmailOutboxStatus.PROCESSING &&
        row.email.leaseExpiresAt <= input.now;
      const queueEligible =
        row.status === EmailOutboxStatus.PENDING ||
        row.status === EmailOutboxStatus.RETRY_SCHEDULED ||
        stale;

      if (!queueEligible || !due || row.email.attempts >= row.email.maxAttempts) {
        continue;
      }

      row.status = EmailOutboxStatus.PROCESSING;
      row.email.attempts += 1;
      row.email.leaseOwner = input.workerId;
      row.email.leaseExpiresAt = new Date(
        input.now.getTime() + input.leaseSeconds * 1_000,
      );
      row.email.providerIdempotencyKey ||= providerIdempotencyKey(row.email.id);
      row.email.providerIdempotencyKeyIssuedAt ||= input.now;
      row.nextAttemptAt = null;
      claimed.push({ ...row.email });
    }

    this.inTransaction = false;
    return claimed;
  }

  async prepareAttempt(email: ClaimedEmail, now: Date) {
    this.inTransaction = true;
    const row = this.rows.find((candidate) => candidate.email.id === email.id);

    if (!row || row.status !== EmailOutboxStatus.PROCESSING) {
      this.inTransaction = false;
      return "skipped" as const;
    }

    if (row.suppressOnPrepare) {
      row.status = EmailOutboxStatus.SUPPRESSED;
      this.inTransaction = false;
      return "suppressed" as const;
    }

    if (
      row.email.uncertainSince &&
      row.email.providerIdempotencyKeyIssuedAt.getTime() + 24 * 60 * 60 * 1_000 <=
        now.getTime()
    ) {
      row.status = EmailOutboxStatus.REVIEW_REQUIRED;
      this.inTransaction = false;
      return "review_required" as const;
    }

    this.preparedAttempts.push(email.id);
    this.inTransaction = false;
    return "ready" as const;
  }

  async recordResult(
    email: ClaimedEmail,
    result: EmailProviderSendResult,
    now: Date,
  ) {
    this.inTransaction = true;
    const row = this.rows.find((candidate) => candidate.email.id === email.id);

    if (!row || row.status !== EmailOutboxStatus.PROCESSING) {
      this.inTransaction = false;
      return "skipped" as const;
    }

    row.recorded.push(result);

    if (result.status === "accepted") {
      row.status = EmailOutboxStatus.SENT;
      this.inTransaction = false;
      return "accepted" as const;
    }

    if (result.status === "unknown") {
      const decision = uncertaintyRetryDecision({
        now,
        idempotencyKeyIssuedAt: row.email.providerIdempotencyKeyIssuedAt,
        attemptNumber: row.email.attempts,
        maxAttempts: row.email.maxAttempts,
        outboxId: row.email.id,
      });
      row.email.uncertainSince ??= now;
      row.status =
        decision.action === "retry"
          ? EmailOutboxStatus.RETRY_SCHEDULED
          : EmailOutboxStatus.REVIEW_REQUIRED;
      row.nextAttemptAt = decision.action === "retry" ? decision.retryAt : null;
      this.inTransaction = false;
      return decision.action === "retry"
        ? ("retry_scheduled" as const)
        : ("review_required" as const);
    }

    const retryable =
      result.status === "retryable_failure" || result.status === "disabled";
    const canRetry = retryable && row.email.attempts < row.email.maxAttempts;
    row.status = canRetry
      ? EmailOutboxStatus.RETRY_SCHEDULED
      : EmailOutboxStatus.PERMANENTLY_FAILED;
    row.nextAttemptAt = canRetry
      ? new Date(
          now.getTime() +
            calculateBackoffMs({
              attemptNumber: row.email.attempts,
              seed: row.email.id,
              retryAfterMs:
                result.status === "retryable_failure"
                  ? result.retryAfterMs
                  : undefined,
            }),
        )
      : null;
    this.inTransaction = false;
    return canRetry
      ? ("retry_scheduled" as const)
      : ("permanently_failed" as const);
  }
}

function testRow(id: string, input: Partial<TestRow> = {}): TestRow {
  return {
    email: claimedEmail(id),
    status: EmailOutboxStatus.PENDING,
    nextAttemptAt: null,
    suppressed: false,
    suppressOnPrepare: false,
    recorded: [],
    ...input,
  };
}

test("disabled provider performs no claim and no network work", async () => {
  const repository = new TestRepository([testRow("disabled")]);
  const provider = createFakeEmailProvider({ configured: false });
  const result = await processEmailOutboxWithDependencies({ provider, repository });

  assert.equal(result.disabled, true);
  assert.equal(result.claimed, 0);
  assert.equal(provider.sentMessages.length, 0);
});

test("bounded atomic claims prevent duplicate concurrent sends", async () => {
  const repository = new TestRepository([
    testRow("one"),
    testRow("two"),
    testRow("three"),
  ]);
  const firstProvider = createFakeEmailProvider();
  const secondProvider = createFakeEmailProvider();

  const [first, second] = await Promise.all([
    processEmailOutboxWithDependencies({
      provider: firstProvider,
      repository,
      batchSize: 2,
      workerId: "worker-one",
    }),
    processEmailOutboxWithDependencies({
      provider: secondProvider,
      repository,
      batchSize: 2,
      workerId: "worker-two",
    }),
  ]);

  assert.equal(first.claimed + second.claimed, 3);
  assert.equal(
    firstProvider.sentMessages.length + secondProvider.sentMessages.length,
    3,
  );
  assert.equal(new Set(repository.preparedAttempts).size, 3);
});

test("batch size is bounded and stale leases are recovered", async () => {
  const now = new Date("2026-07-17T12:00:00.000Z");
  const rows = Array.from({ length: 60 }, (_, index) => testRow(`row-${index}`));
  rows[0] = testRow("stale", {
    email: claimedEmail("stale", {
      attempts: 1,
      leaseExpiresAt: new Date("2026-07-17T11:00:00.000Z"),
    }),
    status: EmailOutboxStatus.PROCESSING,
  });
  const repository = new TestRepository(rows);
  const provider = createFakeEmailProvider();
  const result = await processEmailOutboxWithDependencies({
    provider,
    repository,
    batchSize: 500,
    now: () => now,
  });

  assert.equal(result.claimed, 50);
  assert.ok(repository.preparedAttempts.includes("stale"));
});

test("provider calls occur outside repository transactions and accepted IDs persist", async () => {
  const repository = new TestRepository([testRow("accepted")]);
  const provider: EmailProvider = {
    name: "fake",
    isConfigured: true,
    configurationError: null,
    async send() {
      assert.equal(repository.inTransaction, false);
      return {
        status: "accepted",
        providerMessageId: "provider-message",
        httpStatus: 200,
      };
    },
    async parseWebhook() {
      return { status: "failed", error: "invalid_signature" };
    },
  };
  const result = await processEmailOutboxWithDependencies({ provider, repository });

  assert.equal(result.accepted, 1);
  assert.equal(repository.rows[0]?.status, EmailOutboxStatus.SENT);
  assert.equal(
    repository.rows[0]?.recorded[0]?.status === "accepted"
      ? repository.rows[0].recorded[0].providerMessageId
      : null,
    "provider-message",
  );
});

test("one row failure does not block the remaining claimed batch", async () => {
  const repository = new TestRepository([
    testRow("prepare-fails"),
    testRow("still-sends"),
  ]);
  const prepareAttempt = repository.prepareAttempt.bind(repository);
  repository.prepareAttempt = async (email, now) => {
    if (email.id === "prepare-fails") {
      throw new Error("simulated row-level database failure");
    }

    return prepareAttempt(email, now);
  };
  const provider = createFakeEmailProvider();

  const result = await processEmailOutboxWithDependencies({
    provider,
    repository,
  });

  assert.equal(result.claimed, 2);
  assert.equal(result.accepted, 1);
  assert.equal(result.skipped, 1);
  assert.equal(provider.sentMessages[0]?.toEmail, "still-sends@example.test");
});

test("repeated invocation does not resend accepted rows", async () => {
  const repository = new TestRepository([testRow("once")]);
  const provider = createFakeEmailProvider();

  await processEmailOutboxWithDependencies({ provider, repository });
  const repeated = await processEmailOutboxWithDependencies({ provider, repository });

  assert.equal(repeated.claimed, 0);
  assert.equal(provider.sentMessages.length, 1);
});

test("unknown delivery retries with the same key inside the provider window", async () => {
  let now = new Date("2026-07-17T10:00:00.000Z");
  const row = testRow("uncertain");
  const repository = new TestRepository([row]);
  const provider = createFakeEmailProvider({
    sendResults: [
      {
        status: "unknown",
        failureCategory: "unknown_delivery",
        failureCode: "request_timeout",
      },
      {
        status: "accepted",
        providerMessageId: "accepted-after-timeout",
        httpStatus: 200,
      },
    ],
  });

  const first = await processEmailOutboxWithDependencies({
    provider,
    repository,
    now: () => now,
  });
  now = new Date((row.nextAttemptAt ?? now).getTime() + 1);
  const second = await processEmailOutboxWithDependencies({
    provider,
    repository,
    now: () => now,
  });

  assert.equal(first.retryScheduled, 1);
  assert.equal(second.accepted, 1);
  assert.equal(provider.sentMessages.length, 2);
  assert.equal(
    provider.sentMessages[0]?.idempotencyKey,
    provider.sentMessages[1]?.idempotencyKey,
  );
});

test("unknown delivery after the idempotency window requires review without a send", async () => {
  const issuedAt = new Date("2026-07-16T09:00:00.000Z");
  const now = new Date("2026-07-17T10:00:00.000Z");
  const row = testRow("expired", {
    email: claimedEmail("expired", {
      attempts: 1,
      providerIdempotencyKeyIssuedAt: issuedAt,
      uncertainSince: issuedAt,
    }),
    status: EmailOutboxStatus.RETRY_SCHEDULED,
  });
  const repository = new TestRepository([row]);
  const provider = createFakeEmailProvider();
  const result = await processEmailOutboxWithDependencies({
    provider,
    repository,
    now: () => now,
  });

  assert.equal(result.reviewRequired, 1);
  assert.equal(provider.sentMessages.length, 0);
});

test("rate limits and 5xx responses retry while permanent 4xx does not", async () => {
  const scenarios: Array<{
    result: EmailProviderSendResult;
    expected: EmailOutboxStatus;
  }> = [
    {
      result: {
        status: "retryable_failure",
        failureCategory: "rate_limited",
        failureCode: "rate_limit_exceeded",
        httpStatus: 429,
        retryAfterMs: 120_000,
      },
      expected: EmailOutboxStatus.RETRY_SCHEDULED,
    },
    {
      result: {
        status: "retryable_failure",
        failureCategory: "provider_unavailable",
        failureCode: "internal_server_error",
        httpStatus: 503,
      },
      expected: EmailOutboxStatus.RETRY_SCHEDULED,
    },
    {
      result: {
        status: "permanent_failure",
        failureCategory: "provider_authentication",
        failureCode: "invalid_api_key",
        httpStatus: 403,
      },
      expected: EmailOutboxStatus.PERMANENTLY_FAILED,
    },
  ];

  for (const [index, scenario] of scenarios.entries()) {
    const row = testRow(`failure-${index}`);
    const repository = new TestRepository([row]);
    const provider = createFakeEmailProvider({ sendResults: [scenario.result] });
    await processEmailOutboxWithDependencies({ provider, repository });
    assert.equal(row.status, scenario.expected);
  }
});

test("maximum-attempt exhaustion prevents indefinite retry", async () => {
  const row = testRow("max", {
    email: claimedEmail("max", { attempts: 4, maxAttempts: 5 }),
  });
  const repository = new TestRepository([row]);
  const provider = createFakeEmailProvider({
    sendResults: [
      {
        status: "retryable_failure",
        failureCategory: "provider_unavailable",
        failureCode: "internal_server_error",
        httpStatus: 500,
      },
    ],
  });
  const result = await processEmailOutboxWithDependencies({ provider, repository });

  assert.equal(result.permanentlyFailed, 1);
  assert.equal(row.status, EmailOutboxStatus.PERMANENTLY_FAILED);
});

test("suppression is rechecked after claim and prevents provider calls", async () => {
  const row = testRow("suppressed", { suppressOnPrepare: true });
  const repository = new TestRepository([row]);
  const provider = createFakeEmailProvider();
  const result = await processEmailOutboxWithDependencies({ provider, repository });

  assert.equal(result.claimed, 1);
  assert.equal(result.suppressed, 1);
  assert.equal(provider.sentMessages.length, 0);
});

test("idempotency and backoff functions are deterministic and bounded", () => {
  assert.equal(providerIdempotencyKey("row-1"), providerIdempotencyKey("row-1"));
  assert.notEqual(providerIdempotencyKey("row-1"), providerIdempotencyKey("row-2"));
  assert.ok(providerIdempotencyKey("x".repeat(400)).length <= 256);

  const delays = Array.from({ length: 20 }, (_, index) =>
    calculateBackoffMs({
      attemptNumber: index + 1,
      seed: "row-1",
    }),
  );
  assert.ok(delays.every((delay) => delay >= 60_000));
  assert.ok(delays.every((delay) => delay <= 6 * 60 * 60 * 1_000));
  assert.equal(delays[3], calculateBackoffMs({ attemptNumber: 4, seed: "row-1" }));
});

test("source keeps SKIP LOCKED claims and provider sends outside business workflows", async () => {
  const processor = await readFile(
    new URL("./outbox-processor.ts", import.meta.url),
    "utf8",
  );
  assert.match(processor, /FOR UPDATE OF candidate SKIP LOCKED/);

  for (const relative of [
    "../notifications/service.ts",
    "../applications/actions.ts",
    "../billing/service.ts",
    "../billing/online-payments.ts",
  ]) {
    const source = await readFile(new URL(relative, import.meta.url), "utf8");
    assert.doesNotMatch(source, /provider\.send\(|getEmailProvider\(/);
  }
});
