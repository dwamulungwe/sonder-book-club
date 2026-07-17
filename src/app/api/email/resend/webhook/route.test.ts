import assert from "node:assert/strict";
import test from "node:test";

const ORIGINAL_ENV = { ...process.env };

function configureProvider() {
  Object.assign(process.env, {
    DATABASE_URL:
      process.env.DATABASE_URL ??
      "postgresql://user:pass@localhost:5432/bookclub_test",
    NODE_ENV: "test",
    SONDER_EMAIL_PROVIDER: "resend",
    SONDER_EMAIL_FROM: "Sonder <no-reply@example.test>",
    SONDER_APP_BASE_URL: "http://localhost:3000",
    RESEND_API_KEY: "unit-test-key",
    RESEND_WEBHOOK_SIGNING_SECRET: `whsec_${Buffer.from("unit-test-key").toString("base64")}`,
  });
}

async function postWebhook(request: Request) {
  process.env.DATABASE_URL ??=
    "postgresql://user:pass@localhost:5432/bookclub_test";
  const route = await import("@/app/api/email/resend/webhook/route");
  return route.POST(request);
}

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("webhook route rejects oversized payloads before parsing", async () => {
  const declaredOversize = await postWebhook(
    new Request("http://localhost/api/email/resend/webhook", {
      method: "POST",
      headers: { "content-length": String(256 * 1024 + 1) },
      body: "{}",
    }),
  );
  const streamedOversize = await postWebhook(
    new Request("http://localhost/api/email/resend/webhook", {
      method: "POST",
      body: new Uint8Array(256 * 1024 + 1),
    }),
  );

  assert.equal(declaredOversize.status, 413);
  assert.equal(streamedOversize.status, 413);
  assert.match(declaredOversize.headers.get("cache-control") ?? "", /no-store/);
});

test("webhook route rejects malformed content length, UTF-8, and JSON", async () => {
  const malformedLength = await postWebhook(
    new Request("http://localhost/api/email/resend/webhook", {
      method: "POST",
      headers: { "content-length": "not-a-number" },
      body: "{}",
    }),
  );
  const partiallyNumericLength = await postWebhook(
    new Request("http://localhost/api/email/resend/webhook", {
      method: "POST",
      headers: { "content-length": "2junk" },
      body: "{}",
    }),
  );
  const malformedUtf8 = await postWebhook(
    new Request("http://localhost/api/email/resend/webhook", {
      method: "POST",
      body: new Uint8Array([0xff]),
    }),
  );
  const malformedJson = await postWebhook(
    new Request("http://localhost/api/email/resend/webhook", {
      method: "POST",
      body: "not-json",
    }),
  );

  assert.equal(malformedLength.status, 400);
  assert.equal(partiallyNumericLength.status, 400);
  assert.equal(malformedUtf8.status, 400);
  assert.equal(malformedJson.status, 400);
});

test("webhook route fails closed when provider configuration is missing", async () => {
  delete process.env.SONDER_EMAIL_PROVIDER;
  const response = await postWebhook(
    new Request("http://localhost/api/email/resend/webhook", {
      method: "POST",
      body: "{}",
    }),
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "provider_disabled",
  });
});

test("webhook route rejects missing and invalid Svix signatures without database work", async () => {
  configureProvider();
  const missing = await postWebhook(
    new Request("http://localhost/api/email/resend/webhook", {
      method: "POST",
      body: "{}",
    }),
  );
  const invalid = await postWebhook(
    new Request("http://localhost/api/email/resend/webhook", {
      method: "POST",
      headers: {
        "svix-id": "event-1",
        "svix-timestamp": String(Math.floor(Date.now() / 1_000)),
        "svix-signature": "v1,invalid",
      },
      body: "{}",
    }),
  );

  assert.equal(missing.status, 401);
  assert.equal(invalid.status, 401);
});
