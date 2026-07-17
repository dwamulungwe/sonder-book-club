import assert from "node:assert/strict";
import test from "node:test";

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
}

async function postWebhook(request: Request) {
  process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/bookclub_test";
  const route = await import("@/app/api/billing/flutterwave/webhook/route");
  return route.POST(request);
}

function configureProvider() {
  process.env.SONDER_PAYMENT_PROVIDER = "flutterwave";
  process.env.FLUTTERWAVE_MODE = "test";
  Object.assign(process.env, { NODE_ENV: "test" });
  process.env.FLUTTERWAVE_SECRET_KEY = "unit-test-secret";
  process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH = "unit-test-hash";
  process.env.SONDER_APP_BASE_URL = "http://localhost:3000";
}

test.afterEach(resetEnv);

test("webhook route rejects oversized payloads before parsing", async () => {
  const response = await postWebhook(
    new Request("http://localhost/api/billing/flutterwave/webhook", {
      method: "POST",
      headers: {
        "content-length": String(256 * 1024 + 1),
      },
      body: "{}",
    }),
  );

  assert.equal(response.status, 413);
});

test("webhook route rejects malformed content length", async () => {
  const response = await postWebhook(
    new Request("http://localhost/api/billing/flutterwave/webhook", {
      method: "POST",
      headers: {
        "content-length": "not-a-number",
      },
      body: "{}",
    }),
  );

  assert.equal(response.status, 400);
});

test("webhook route rejects missing and invalid signatures without database records", async () => {
  configureProvider();

  const missing = await postWebhook(
    new Request("http://localhost/api/billing/flutterwave/webhook", {
      method: "POST",
      body: "{}",
    }),
  );
  const invalid = await postWebhook(
    new Request("http://localhost/api/billing/flutterwave/webhook", {
      method: "POST",
      headers: {
        "verif-hash": "wrong-hash",
      },
      body: "{}",
    }),
  );

  assert.equal(missing.status, 401);
  assert.equal(invalid.status, 401);
});

test("webhook route rejects malformed JSON and malformed UTF-8", async () => {
  configureProvider();

  const malformedJson = await postWebhook(
    new Request("http://localhost/api/billing/flutterwave/webhook", {
      method: "POST",
      headers: {
        "verif-hash": "unit-test-hash",
      },
      body: "not-json",
    }),
  );
  const malformedUtf8 = await postWebhook(
    new Request("http://localhost/api/billing/flutterwave/webhook", {
      method: "POST",
      headers: {
        "verif-hash": "unit-test-hash",
      },
      body: new Uint8Array([0xff]),
    }),
  );

  assert.equal(malformedJson.status, 400);
  assert.equal(malformedUtf8.status, 400);
});
