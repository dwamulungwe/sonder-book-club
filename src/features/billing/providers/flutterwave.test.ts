import assert from "node:assert/strict";
import test from "node:test";

import { minorUnitsToDecimalString } from "@/features/billing/currency";
import { getPaymentProvider } from "@/features/billing/payment-provider";
import {
  getFlutterwavePaymentProvider,
  mapFlutterwaveStatus,
  parseFlutterwaveAmountToMinorUnits,
  resolveFlutterwavePaymentOptions,
  validateFlutterwaveCheckoutUrl,
  verifyFlutterwaveWebhookSignature,
} from "@/features/billing/providers/flutterwave";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
}

test.afterEach(resetEnv);

test("payment provider remains disabled by default", async () => {
  delete process.env.SONDER_PAYMENT_PROVIDER;

  const provider = getPaymentProvider();
  const result = await provider.createCheckout({
    invoiceId: "invoice",
    sonderTransactionReference: "SBC-FLW-REFERENCE",
    amountMinor: BigInt(1000),
    currency: "ZMW",
    returnUrl: "http://localhost:3000/membership/billing/payment-return",
    customer: {
      email: "member@example.test",
    },
    description: "Test invoice",
  });

  assert.equal(provider.isConfigured, false);
  assert.equal(result.status, "disabled");
});

test("flutterwave provider is disabled when sandbox variables are incomplete", () => {
  process.env.SONDER_PAYMENT_PROVIDER = "flutterwave";
  process.env.FLUTTERWAVE_MODE = "test";
  delete process.env.FLUTTERWAVE_SECRET_KEY;
  process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH = "unit-test-hash";
  process.env.SONDER_APP_BASE_URL = "http://localhost:3000";

  const provider = getPaymentProvider();

  assert.equal(provider.name, "flutterwave");
  assert.equal(provider.isConfigured, false);
  assert.match(provider.configurationError ?? "", /missing FLUTTERWAVE_SECRET_KEY/);
});

test("flutterwave provider rejects live keys and missing webhook hashes", () => {
  process.env.SONDER_PAYMENT_PROVIDER = "flutterwave";
  process.env.FLUTTERWAVE_MODE = "test";
  process.env.FLUTTERWAVE_SECRET_KEY = `FLW${"SECK"}_LIVE-not-a-real-key`;
  process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH = "unit-test-hash";
  process.env.SONDER_APP_BASE_URL = "http://localhost:3000";

  const liveKeyProvider = getPaymentProvider();

  assert.equal(liveKeyProvider.isConfigured, false);
  assert.match(liveKeyProvider.configurationError ?? "", /not a test key/);

  process.env.FLUTTERWAVE_SECRET_KEY = "unit-test-secret";
  Object.assign(process.env, { NODE_ENV: "test" });
  delete process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH;

  const missingHashProvider = getPaymentProvider();

  assert.equal(missingHashProvider.isConfigured, false);
  assert.match(
    missingHashProvider.configurationError ?? "",
    /missing FLUTTERWAVE_WEBHOOK_SECRET_HASH/,
  );
});

test("payment options are optional and restricted to an explicit allowlist", () => {
  assert.equal(resolveFlutterwavePaymentOptions(""), null);
  assert.deepEqual(resolveFlutterwavePaymentOptions("card"), ["card"]);
  assert.deepEqual(resolveFlutterwavePaymentOptions("card,mobilemoneyzambia"), [
    "card",
    "mobilemoneyzambia",
  ]);
  assert.throws(
    () => resolveFlutterwavePaymentOptions("card,airtel"),
    /not approved/,
  );
  assert.throws(() => resolveFlutterwavePaymentOptions("card,,"), /non-empty/);
});

test("minor-unit decimal conversion is exact", () => {
  assert.equal(minorUnitsToDecimalString(BigInt(12345), "ZMW"), "123.45");
  assert.equal(
    parseFlutterwaveAmountToMinorUnits("123.45", "ZMW"),
    BigInt(12345),
  );
  assert.equal(
    parseFlutterwaveAmountToMinorUnits(123.45, "ZMW"),
    BigInt(12345),
  );
});

test("provider amount parsing rejects unsafe decimal values", () => {
  assert.throws(
    () => parseFlutterwaveAmountToMinorUnits("0", "ZMW"),
    /positive/,
  );
  assert.throws(
    () => parseFlutterwaveAmountToMinorUnits("-1", "ZMW"),
    /negative/,
  );
  assert.throws(
    () => parseFlutterwaveAmountToMinorUnits("1e2", "ZMW"),
    /valid money/,
  );
  assert.throws(
    () => parseFlutterwaveAmountToMinorUnits("1.234", "ZMW"),
    /at most 2 decimal/,
  );
  assert.throws(
    () => parseFlutterwaveAmountToMinorUnits(Number.NaN, "ZMW"),
    /supported decimal/,
  );
  assert.throws(
    () => parseFlutterwaveAmountToMinorUnits(Number.POSITIVE_INFINITY, "ZMW"),
    /supported decimal/,
  );
  assert.throws(
    () => parseFlutterwaveAmountToMinorUnits(Number.MAX_SAFE_INTEGER + 2, "ZMW"),
    /safe positive/,
  );
});

test("checkout URL validation allows only official HTTPS hosted checkout links", () => {
  assert.equal(
    validateFlutterwaveCheckoutUrl(
      "https://checkout.flutterwave.com/v3/hosted/pay/flwlnk-test",
    ),
    true,
  );
  assert.equal(
    validateFlutterwaveCheckoutUrl(
      "http://checkout.flutterwave.com/v3/hosted/pay/flwlnk-test",
    ),
    false,
  );
  assert.equal(
    validateFlutterwaveCheckoutUrl(
      "https://checkout.flutterwave.example/v3/hosted/pay/flwlnk-test",
    ),
    false,
  );
  assert.equal(
    validateFlutterwaveCheckoutUrl("https://checkout.flutterwave.com/not-checkout"),
    false,
  );
  assert.equal(
    validateFlutterwaveCheckoutUrl(
      "https://user@checkout.flutterwave.com/v3/hosted/pay/flwlnk-test",
    ),
    false,
  );
  assert.equal(
    validateFlutterwaveCheckoutUrl(
      "https://checkout.flutterwave.com:444/v3/hosted/pay/flwlnk-test",
    ),
    false,
  );
  assert.equal(
    validateFlutterwaveCheckoutUrl(
      "https://checkout.flutterwave.com.attacker.example/v3/hosted/pay/flwlnk-test",
    ),
    false,
  );
  assert.equal(
    validateFlutterwaveCheckoutUrl(
      "https://checkout.flutterwave.com/v3/hosted/pay/",
    ),
    false,
  );
});

test("webhook verif-hash uses strict constant-time equality", () => {
  assert.equal(
    verifyFlutterwaveWebhookSignature({
      signature: "unit-test-hash",
      webhookSecretHash: "unit-test-hash",
    }),
    true,
  );
  assert.equal(
    verifyFlutterwaveWebhookSignature({
      signature: "wrong-hash",
      webhookSecretHash: "unit-test-hash",
    }),
    false,
  );
  assert.equal(
    verifyFlutterwaveWebhookSignature({
      signature: "unit-test-hash-with-extra-bytes",
      webhookSecretHash: "unit-test-hash",
    }),
    false,
  );
  assert.equal(
    verifyFlutterwaveWebhookSignature({
      signature: undefined,
      webhookSecretHash: "unit-test-hash",
    }),
    false,
  );
});

test("checkout creation omits payment_options unless deliberately configured", async () => {
  process.env.FLUTTERWAVE_MODE = "test";
  Object.assign(process.env, { NODE_ENV: "test" });
  process.env.FLUTTERWAVE_SECRET_KEY = "unit-test-secret";
  process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH = "unit-test-hash";
  process.env.SONDER_APP_BASE_URL = "http://localhost:3000";
  delete process.env.FLUTTERWAVE_PAYMENT_OPTIONS;

  const capturedBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_url, init) => {
    capturedBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({
      status: "success",
      data: {
        link: "https://checkout.flutterwave.com/v3/hosted/pay/flwlnk-test",
      },
    });
  }) as typeof fetch;

  const provider = getFlutterwavePaymentProvider();
  const result = await provider.createCheckout({
    invoiceId: "invoice",
    sonderTransactionReference: "SBC-FLW-REFERENCE",
    amountMinor: BigInt(12550),
    currency: "ZMW",
    returnUrl: "http://localhost:3000/membership/billing/payment-return",
    customer: {
      email: "member@example.test",
    },
    description: "Test invoice",
  });

  assert.equal(result.status, "ok");
  const defaultOptionsBody = capturedBodies[0] ?? {};
  assert.equal(defaultOptionsBody.payment_options, undefined);
  assert.equal(defaultOptionsBody.currency, "ZMW");
  assert.equal(defaultOptionsBody.amount, "125.50");

  process.env.FLUTTERWAVE_PAYMENT_OPTIONS = "card,mobilemoneyzambia";
  const configuredProvider = getFlutterwavePaymentProvider();
  await configuredProvider.createCheckout({
    invoiceId: "invoice",
    sonderTransactionReference: "SBC-FLW-REFERENCE-2",
    amountMinor: BigInt(100),
    currency: "ZMW",
    returnUrl: "http://localhost:3000/membership/billing/payment-return",
    customer: {
      email: "member@example.test",
    },
    description: "Test invoice",
  });

  const configuredOptionsBody = capturedBodies[1] ?? {};
  assert.equal(configuredOptionsBody.payment_options, "card,mobilemoneyzambia");
});

test("webhook parser rejects invalid signatures and malformed JSON", async () => {
  process.env.FLUTTERWAVE_MODE = "test";
  Object.assign(process.env, { NODE_ENV: "test" });
  process.env.FLUTTERWAVE_SECRET_KEY = "unit-test-secret";
  process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH = "unit-test-hash";
  process.env.SONDER_APP_BASE_URL = "http://localhost:3000";

  const provider = getFlutterwavePaymentProvider();
  const invalidSignature = await provider.parseWebhook({
    rawBody: "{}",
    headers: {
      "verif-hash": "wrong-hash",
    },
  });
  const malformed = await provider.parseWebhook({
    rawBody: "not-json",
    headers: {
      "verif-hash": "unit-test-hash",
    },
  });

  assert.equal(provider.isConfigured, true);
  assert.equal(invalidSignature.status, "failed");
  assert.equal(
    invalidSignature.status === "failed" ? invalidSignature.error : "",
    "invalid_webhook_signature",
  );
  assert.equal(malformed.status, "failed");
  assert.equal(
    malformed.status === "failed" ? malformed.error : "",
    "malformed_webhook",
  );
});

test("webhook parser extracts sanitized successful transaction fields", async () => {
  process.env.FLUTTERWAVE_MODE = "test";
  Object.assign(process.env, { NODE_ENV: "test" });
  process.env.FLUTTERWAVE_SECRET_KEY = "unit-test-secret";
  process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH = "unit-test-hash";
  process.env.SONDER_APP_BASE_URL = "http://localhost:3000";

  const provider = getFlutterwavePaymentProvider();
  const parsed = await provider.parseWebhook({
    rawBody: JSON.stringify({
      event: "charge.completed",
      data: {
        id: 123456,
        tx_ref: "SBC-FLW-REFERENCE",
        flw_ref: "FLW-MOCK-REFERENCE",
        amount: "125.50",
        currency: "ZMW",
        status: "successful",
      },
    }),
    headers: {
      "verif-hash": "unit-test-hash",
    },
  });

  assert.equal(parsed.status, "ok");

  if (parsed.status !== "ok") {
    return;
  }

  assert.equal(parsed.data.providerTransactionId, "123456");
  assert.equal(parsed.data.sonderTransactionReference, "SBC-FLW-REFERENCE");
  assert.equal(parsed.data.providerReference, "FLW-MOCK-REFERENCE");
  assert.equal(parsed.data.status, "confirmed");
  assert.equal(parsed.data.amountMinor, BigInt(12550));
  assert.equal(parsed.data.currency, "ZMW");
  assert.match(parsed.data.payloadHash ?? "", /^[a-f0-9]{64}$/);
});

test("webhook event keys dedupe identical payloads but allow changed payloads", async () => {
  process.env.FLUTTERWAVE_MODE = "test";
  Object.assign(process.env, { NODE_ENV: "test" });
  process.env.FLUTTERWAVE_SECRET_KEY = "unit-test-secret";
  process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH = "unit-test-hash";
  process.env.SONDER_APP_BASE_URL = "http://localhost:3000";

  const provider = getFlutterwavePaymentProvider();
  const basePayload = {
    id: "event-1",
    event: "charge.completed",
    data: {
      id: 123456,
      tx_ref: "SBC-FLW-REFERENCE",
      amount: "125.50",
      currency: "ZMW",
      status: "pending",
    },
  };
  const first = await provider.parseWebhook({
    rawBody: JSON.stringify(basePayload),
    headers: {
      "verif-hash": "unit-test-hash",
    },
  });
  const duplicate = await provider.parseWebhook({
    rawBody: JSON.stringify(basePayload),
    headers: {
      "verif-hash": "unit-test-hash",
    },
  });
  const changed = await provider.parseWebhook({
    rawBody: JSON.stringify({
      ...basePayload,
      data: {
        ...basePayload.data,
        status: "successful",
      },
    }),
    headers: {
      "verif-hash": "unit-test-hash",
    },
  });

  assert.equal(first.status, "ok");
  assert.equal(duplicate.status, "ok");
  assert.equal(changed.status, "ok");

  if (first.status === "ok" && duplicate.status === "ok" && changed.status === "ok") {
    assert.equal(first.data.eventKey, duplicate.data.eventKey);
    assert.notEqual(first.data.eventKey, changed.data.eventKey);
  }
});

test("provider status mapping is conservative", () => {
  assert.equal(mapFlutterwaveStatus("successful"), "confirmed");
  assert.equal(mapFlutterwaveStatus("pending"), "pending");
  assert.equal(mapFlutterwaveStatus("processing"), "processing");
  assert.equal(mapFlutterwaveStatus("failed"), "failed");
  assert.equal(mapFlutterwaveStatus("cancelled"), "failed");
  assert.equal(mapFlutterwaveStatus("mystery"), "processing");
});
