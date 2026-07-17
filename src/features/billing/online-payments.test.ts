import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  checkoutIdempotencyKeyForNonce,
  generateTrustedSonderTransactionReference,
} from "@/features/billing/online-payment-references";

test("trusted Sonder transaction references are unique and opaque", () => {
  const references = new Set(
    Array.from({ length: 100 }, () => generateTrustedSonderTransactionReference()),
  );

  assert.equal(references.size, 100);

  for (const reference of references) {
    assert.match(reference, /^SBC-FLW-[A-Z0-9_-]{20,}$/);
    assert.equal(reference.includes("invoice"), false);
    assert.equal(reference.includes("member"), false);
  }
});

test("checkout nonce idempotency keys are deterministic hashes", () => {
  const first = checkoutIdempotencyKeyForNonce({
    userId: "user_1",
    invoiceId: "invoice_1",
    checkoutNonce: "nonce-123",
  });
  const duplicate = checkoutIdempotencyKeyForNonce({
    userId: "user_1",
    invoiceId: "invoice_1",
    checkoutNonce: "nonce-123",
  });
  const differentInvoice = checkoutIdempotencyKeyForNonce({
    userId: "user_1",
    invoiceId: "invoice_2",
    checkoutNonce: "nonce-123",
  });

  assert.equal(first, duplicate);
  assert.notEqual(first, differentInvoice);
  assert.match(first ?? "", /^checkout:[a-f0-9]{64}$/);
  assert.equal(first?.includes("invoice_1"), false);
  assert.equal(first?.includes("user_1"), false);
  assert.throws(
    () =>
      checkoutIdempotencyKeyForNonce({
        userId: "user_1",
        invoiceId: "invoice_1",
        checkoutNonce: "../bad",
      }),
    /could not be started/,
  );
});

test(".env.example is explicitly trackable and contains placeholders only", () => {
  const gitignore = readFileSync(".gitignore", "utf8");
  const envExample = readFileSync(".env.example", "utf8");

  assert.match(gitignore, /^\.env\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
  assert.doesNotMatch(envExample, /NEXT_PUBLIC_.*FLUTTERWAVE/);
  const providerSecretPattern = new RegExp(
    [
      `FLW${"SECK"}`,
      `FLW${"PUBK"}`,
      `SANDBOX${"DEMOKEY"}`,
      `sk_${"live"}`,
      `sk_${"test"}`,
    ].join("|"),
  );
  assert.doesNotMatch(envExample, providerSecretPattern);
  assert.match(envExample, /^FLUTTERWAVE_SECRET_KEY=""$/m);
  assert.match(envExample, /^FLUTTERWAVE_WEBHOOK_SECRET_HASH=""$/m);
});
