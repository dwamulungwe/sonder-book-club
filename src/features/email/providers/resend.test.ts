import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  getEmailProviderConfig,
  isValidEmailAddress,
  isValidSenderAddress,
  type ResendEmailProviderConfig,
} from "@/features/email/server-config";
import { createResendEmailProvider } from "@/features/email/providers/resend";

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
}

function configuredEnvironment() {
  Object.assign(process.env, {
    NODE_ENV: "test",
    SONDER_EMAIL_PROVIDER: "resend",
    SONDER_EMAIL_FROM: "Sonder <no-reply@example.test>",
    SONDER_EMAIL_REPLY_TO: "reply@example.test",
    SONDER_APP_BASE_URL: "http://localhost:3000",
    RESEND_API_KEY: "unit-test-key",
    RESEND_WEBHOOK_SIGNING_SECRET: "unit-test-webhook-secret",
  });
}

function providerConfig(overrides: Partial<ResendEmailProviderConfig> = {}): ResendEmailProviderConfig {
  return {
    provider: "resend",
    enabled: true,
    configurationError: null,
    from: "Sonder <no-reply@example.test>",
    replyTo: "reply@example.test",
    apiKey: "unit-test-key",
    webhookSigningSecret: "unit-test-webhook-secret",
    requestTimeoutMs: 1_000,
    batchSize: 10,
    leaseSeconds: 120,
    ...overrides,
  };
}

test.afterEach(resetEnv);

test("provider is disabled by default and unsupported values fail closed", () => {
  delete process.env.SONDER_EMAIL_PROVIDER;
  assert.deepEqual(getEmailProviderConfig(), {
    provider: "disabled",
    enabled: false,
    configurationError: null,
    batchSize: 10,
    leaseSeconds: 120,
  });

  process.env.SONDER_EMAIL_PROVIDER = "unknown-provider";
  const unsupported = getEmailProviderConfig();
  assert.equal(unsupported.enabled, false);
  assert.equal(unsupported.configurationError, "unsupported_provider");
});

test("missing Resend configuration remains disabled without exposing values", () => {
  configuredEnvironment();
  delete process.env.RESEND_API_KEY;
  const missingKey = getEmailProviderConfig();
  assert.equal(missingKey.enabled, false);
  assert.equal(missingKey.configurationError, "missing_api_key");

  configuredEnvironment();
  delete process.env.RESEND_WEBHOOK_SIGNING_SECRET;
  const missingWebhook = getEmailProviderConfig();
  assert.equal(missingWebhook.enabled, false);
  assert.equal(missingWebhook.configurationError, "webhook_not_configured");
});

test("sender and reply-to validation rejects malformed and header-injection values", () => {
  assert.equal(isValidEmailAddress("reader@example.test"), true);
  assert.equal(isValidEmailAddress("reader@localhost"), false);
  assert.equal(isValidSenderAddress("Sonder <no-reply@example.test>"), true);
  assert.equal(isValidSenderAddress("Sonder <bad-address>"), false);
  assert.equal(
    isValidSenderAddress("Sonder <no-reply@example.test>\r\nBcc: attacker@example.test"),
    false,
  );

  configuredEnvironment();
  process.env.SONDER_EMAIL_FROM = "not-an-address";
  assert.equal(getEmailProviderConfig().configurationError, "invalid_sender");

  configuredEnvironment();
  process.env.SONDER_EMAIL_REPLY_TO = "not-an-address";
  assert.equal(getEmailProviderConfig().configurationError, "invalid_reply_to");
});

test("Production requires a trusted HTTPS application origin", () => {
  configuredEnvironment();
  Object.assign(process.env, { NODE_ENV: "production" });
  process.env.SONDER_APP_BASE_URL = "http://example.test";
  assert.equal(
    getEmailProviderConfig().configurationError,
    "invalid_app_base_url",
  );

  process.env.SONDER_APP_BASE_URL = "https://club.example.test";
  assert.equal(getEmailProviderConfig().enabled, true);
});

test("Resend request uses trusted fields and persists the accepted message ID", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const provider = createResendEmailProvider(
    providerConfig(),
    (async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return Response.json({ id: "resend-message-id" });
    }) as typeof fetch,
  );
  const result = await provider.send({
    toEmail: "reader@example.test",
    subject: "Trusted subject",
    textBody: "Plain text",
    htmlBody: "<p>Plain text</p>",
    idempotencyKey: "sonder-email/row-1",
    tags: [{ name: "outbox_id", value: "row-1" }],
  });

  assert.equal(capturedUrl, "https://api.resend.com/emails");
  assert.equal(capturedInit?.method, "POST");
  const headers = new Headers(capturedInit?.headers);
  assert.equal(headers.get("idempotency-key"), "sonder-email/row-1");
  assert.match(headers.get("authorization") ?? "", /^Bearer /);
  const body = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>;
  assert.deepEqual(body.to, ["reader@example.test"]);
  assert.equal(body.from, "Sonder <no-reply@example.test>");
  assert.equal(body.reply_to, "reply@example.test");
  assert.equal(result.status, "accepted");
  assert.equal(
    result.status === "accepted" ? result.providerMessageId : null,
    "resend-message-id",
  );
});

test("Resend error categories distinguish rate limits, 5xx, permanent 4xx, and unknown delivery", async () => {
  const responses: Array<Response | Error> = [
    new Response(JSON.stringify({ name: "rate_limit_exceeded" }), {
      status: 429,
      headers: { "retry-after": "2" },
    }),
    new Response(JSON.stringify({ name: "internal_server_error" }), {
      status: 503,
    }),
    new Response(JSON.stringify({ name: "invalid_api_key" }), { status: 403 }),
    new Error("simulated connection failure"),
  ];
  const provider = createResendEmailProvider(
    providerConfig(),
    (async () => {
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response ?? new Response(null, { status: 500 });
    }) as typeof fetch,
  );
  const message = {
    toEmail: "reader@example.test",
    subject: "Subject",
    textBody: "Text",
    htmlBody: "<p>Text</p>",
    idempotencyKey: "sonder-email/row",
  };

  const rateLimit = await provider.send(message);
  const unavailable = await provider.send(message);
  const permanent = await provider.send(message);
  const unknown = await provider.send(message);

  assert.equal(rateLimit.status, "retryable_failure");
  assert.equal(
    rateLimit.status === "retryable_failure" ? rateLimit.retryAfterMs : null,
    2_000,
  );
  assert.equal(unavailable.status, "retryable_failure");
  assert.equal(permanent.status, "permanent_failure");
  assert.equal(unknown.status, "unknown");
});

function signedWebhook(input: {
  payload: string;
  messageId?: string;
  timestamp?: number;
}) {
  const key = Buffer.from("unit-test-signing-key", "utf8");
  const secret = `whsec_${key.toString("base64")}`;
  const messageId = input.messageId ?? "msg_test_event";
  const timestamp = input.timestamp ?? Math.floor(Date.now() / 1_000);
  const signature = createHmac("sha256", key)
    .update(`${messageId}.${timestamp}.${input.payload}`)
    .digest("base64");

  return {
    secret,
    headers: new Headers({
      "svix-id": messageId,
      "svix-timestamp": String(timestamp),
      "svix-signature": `v1,${signature}`,
    }),
  };
}

test("Resend webhook verification uses Svix identity, raw payload, and normalized delivery events", async () => {
  const payload = JSON.stringify({
    type: "email.delivered",
    created_at: new Date().toISOString(),
    data: {
      email_id: "resend-message-id",
      to: ["Reader@Example.Test"],
    },
  });
  const signed = signedWebhook({ payload });
  const provider = createResendEmailProvider(
    providerConfig({ webhookSigningSecret: signed.secret }),
  );
  const parsed = await provider.parseWebhook({
    rawBody: payload,
    headers: signed.headers,
  });

  assert.equal(parsed.status, "ok");
  if (parsed.status === "ok") {
    assert.equal(parsed.event.providerEventId, "msg_test_event");
    assert.equal(parsed.event.providerMessageId, "resend-message-id");
    assert.equal(parsed.event.eventType, "delivered");
    assert.equal(parsed.event.recipientEmail, "reader@example.test");
    assert.match(parsed.event.payloadHash, /^[a-f0-9]{64}$/);
  }
});

test("Resend webhook parser rejects missing and invalid signatures", async () => {
  const provider = createResendEmailProvider(providerConfig());
  const missing = await provider.parseWebhook({
    rawBody: "{}",
    headers: new Headers(),
  });
  const invalid = await provider.parseWebhook({
    rawBody: "{}",
    headers: new Headers({
      "svix-id": "event",
      "svix-timestamp": String(Math.floor(Date.now() / 1_000)),
      "svix-signature": "v1,invalid",
    }),
  });

  assert.deepEqual(missing, { status: "failed", error: "missing_signature" });
  assert.deepEqual(invalid, { status: "failed", error: "invalid_signature" });
});
