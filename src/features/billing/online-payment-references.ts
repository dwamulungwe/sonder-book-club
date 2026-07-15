import { createHash, randomBytes } from "node:crypto";

export function generateTrustedSonderTransactionReference() {
  return `SBC-FLW-${randomBytes(18).toString("base64url").toUpperCase()}`;
}

export function checkoutIdempotencyKeyForNonce(input: {
  userId: string;
  invoiceId: string;
  checkoutNonce?: string | null;
}) {
  const nonce = input.checkoutNonce?.trim();

  if (!nonce) {
    return null;
  }

  if (
    nonce.length > 128 ||
    !/^[A-Za-z0-9_-]+(?:-[A-Za-z0-9_-]+)*$/.test(nonce)
  ) {
    throw new Error("Online checkout could not be started. Refresh and try again.");
  }

  return `checkout:${createHash("sha256")
    .update(`${input.userId}:${input.invoiceId}:${nonce}`)
    .digest("hex")}`;
}
