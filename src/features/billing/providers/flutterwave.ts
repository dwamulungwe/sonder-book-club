import { createHash, timingSafeEqual } from "node:crypto";

import { PaymentMethod } from "@prisma/client";

import {
  minorUnitsToDecimalString,
  normalizeCurrencyCode,
  parseMinorUnits,
} from "@/features/billing/currency";
import type {
  PaymentCheckoutInput,
  PaymentProvider,
  PaymentProviderCheckout,
  PaymentProviderResult,
  PaymentProviderVerification,
  PaymentWebhookInput,
  PaymentWebhookResult,
  ProviderPaymentStatus,
} from "@/features/billing/payment-provider";

const FLUTTERWAVE_API_BASE_URL = "https://api.flutterwave.com/v3";
const FLUTTERWAVE_CHECKOUT_HOSTS = new Set(["checkout.flutterwave.com"]);
const FLUTTERWAVE_CHECKOUT_SESSION_MINUTES = 30;
const FLUTTERWAVE_MAX_RETRY_ATTEMPTS = 3;
const FLUTTERWAVE_REQUEST_TIMEOUT_MS = 10_000;
const FLUTTERWAVE_TEST_SECRET_PREFIX = "FLW" + "SECK_TEST-";
const FLUTTERWAVE_PAYMENT_OPTION_ALLOWLIST = new Set([
  "card",
  "mobilemoneyzambia",
]);

type FlutterwaveConfig =
  | {
      enabled: false;
      error: string | null;
    }
  | {
      enabled: true;
      mode: "test";
      secretKey: string;
      webhookSecretHash: string;
      appBaseUrl: string;
      paymentOptions: string[] | null;
    };

type FlutterwaveApiResponse = {
  status?: unknown;
  message?: unknown;
  data?: unknown;
};

type FlutterwaveTransactionData = {
  id?: unknown;
  tx_ref?: unknown;
  flw_ref?: unknown;
  amount?: unknown;
  charged_amount?: unknown;
  currency?: unknown;
  status?: unknown;
  payment_type?: unknown;
};

function sanitizedConfigError(message: string) {
  return `Flutterwave is disabled: ${message}`;
}

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function resolveFlutterwavePaymentOptions(
  raw = process.env.FLUTTERWAVE_PAYMENT_OPTIONS,
) {
  const value = raw?.trim();

  if (!value) {
    return null;
  }

  const methods = value.split(",").map((method) => method.trim().toLowerCase());

  if (methods.some((method) => method.length === 0)) {
    throw new Error("Payment method names must be non-empty.");
  }

  const uniqueMethods = Array.from(new Set(methods));

  for (const method of uniqueMethods) {
    if (!FLUTTERWAVE_PAYMENT_OPTION_ALLOWLIST.has(method)) {
      throw new Error(`Payment method ${method} is not approved for this build.`);
    }
  }

  return uniqueMethods;
}

function isLocalDevelopmentUrl(url: URL) {
  return (
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  );
}

export function getFlutterwaveConfig(): FlutterwaveConfig {
  const mode = getRequiredEnv("FLUTTERWAVE_MODE");
  const secretKey = getRequiredEnv("FLUTTERWAVE_SECRET_KEY");
  const webhookSecretHash = getRequiredEnv("FLUTTERWAVE_WEBHOOK_SECRET_HASH");
  const appBaseUrl = getRequiredEnv("SONDER_APP_BASE_URL");

  if (mode !== "test") {
    return {
      enabled: false,
      error: sanitizedConfigError("set FLUTTERWAVE_MODE to test for this sandbox build."),
    };
  }

  if (!secretKey) {
    return {
      enabled: false,
      error: sanitizedConfigError("missing FLUTTERWAVE_SECRET_KEY."),
    };
  }

  const allowUnitTestSecret =
    process.env.NODE_ENV === "test" && secretKey === "unit-test-secret";

  if (!secretKey.startsWith(FLUTTERWAVE_TEST_SECRET_PREFIX) && !allowUnitTestSecret) {
    return {
      enabled: false,
      error: sanitizedConfigError("the configured secret key is not a test key."),
    };
  }

  if (!webhookSecretHash) {
    return {
      enabled: false,
      error: sanitizedConfigError("missing FLUTTERWAVE_WEBHOOK_SECRET_HASH."),
    };
  }

  if (!appBaseUrl) {
    return {
      enabled: false,
      error: sanitizedConfigError("missing SONDER_APP_BASE_URL."),
    };
  }

  let parsedAppBaseUrl: URL;
  try {
    parsedAppBaseUrl = new URL(appBaseUrl);
  } catch {
    return {
      enabled: false,
      error: sanitizedConfigError("SONDER_APP_BASE_URL is not a valid URL."),
    };
  }

  if (
    parsedAppBaseUrl.protocol !== "https:" &&
    !isLocalDevelopmentUrl(parsedAppBaseUrl)
  ) {
    return {
      enabled: false,
      error: sanitizedConfigError("SONDER_APP_BASE_URL must be HTTPS or localhost in test mode."),
    };
  }

  let paymentOptions: string[] | null;
  try {
    paymentOptions = resolveFlutterwavePaymentOptions();
  } catch {
    return {
      enabled: false,
      error: sanitizedConfigError("FLUTTERWAVE_PAYMENT_OPTIONS contains an unsupported method."),
    };
  }

  return {
    enabled: true,
    mode,
    secretKey,
    webhookSecretHash,
    appBaseUrl: parsedAppBaseUrl.origin,
    paymentOptions,
  };
}

function constantTimeEquals(left: string, right: string) {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

export function verifyFlutterwaveWebhookSignature(input: {
  signature: string | null | undefined;
  webhookSecretHash: string;
}) {
  if (!input.signature) {
    return false;
  }

  return constantTimeEquals(input.signature, input.webhookSecretHash);
}

export function validateFlutterwaveCheckoutUrl(url: string) {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  return (
    parsed.protocol === "https:" &&
    FLUTTERWAVE_CHECKOUT_HOSTS.has(parsed.hostname.toLowerCase()) &&
    parsed.username === "" &&
    parsed.password === "" &&
    parsed.port === "" &&
    /^\/v3\/hosted\/pay\/[A-Za-z0-9._~-]+$/.test(parsed.pathname)
  );
}

export function parseFlutterwaveAmountToMinorUnits(
  value: unknown,
  currency: string,
) {
  let amountMinor: bigint;

  if (typeof value === "string") {
    amountMinor = parseMinorUnits(value, currency);
  } else if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 0 || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
      throw new Error("Provider amount is not a safe positive decimal value.");
    }

    amountMinor = parseMinorUnits(String(value), currency);
  } else {
    throw new Error("Provider amount is not a supported decimal value.");
  }

  if (amountMinor <= BigInt(0)) {
    throw new Error("Provider amount must be positive.");
  }

  return amountMinor;
}

function payloadHash(rawBody: string) {
  return createHash("sha256").update(rawBody).digest("hex");
}

function getHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
) {
  const lowerName = name.toLowerCase();
  const value =
    headers[name] ??
    headers[lowerName] ??
    Object.entries(headers).find(([key]) => key.toLowerCase() === lowerName)?.[1];

  return Array.isArray(value) ? value[0] : value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function transactionData(value: unknown): FlutterwaveTransactionData {
  return (asRecord(value) ?? {}) as FlutterwaveTransactionData;
}

export function mapFlutterwaveStatus(status: unknown): ProviderPaymentStatus {
  const normalized = asString(status)?.trim().toLowerCase();

  if (normalized === "successful" || normalized === "success") {
    return "confirmed";
  }

  if (normalized === "pending") {
    return "pending";
  }

  if (normalized === "processing" || normalized === "new") {
    return "processing";
  }

  if (
    normalized === "failed" ||
    normalized === "cancelled" ||
    normalized === "canceled" ||
    normalized === "reversed" ||
    normalized === "incomplete"
  ) {
    return "failed";
  }

  return "processing";
}

function paymentMethodFromProvider(paymentType: unknown) {
  const normalized = asString(paymentType)?.trim().toLowerCase() ?? "";

  if (normalized.includes("mobilemoney")) {
    return PaymentMethod.MOBILE_MONEY;
  }

  if (normalized.includes("bank") || normalized === "account") {
    return PaymentMethod.BANK_TRANSFER;
  }

  if (normalized.includes("card")) {
    return PaymentMethod.CARD;
  }

  return PaymentMethod.OTHER;
}

function checkoutIdFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.split("/").filter(Boolean).at(-1) ?? null;
  } catch {
    return null;
  }
}

function checkoutExpiresAt() {
  return new Date(Date.now() + FLUTTERWAVE_CHECKOUT_SESSION_MINUTES * 60_000);
}

function failed<T>(error: string, retryable: boolean): PaymentProviderResult<T> {
  return {
    status: "failed",
    error,
    retryable,
  };
}

async function parseJsonResponse(response: Response) {
  try {
    return (await response.json()) as FlutterwaveApiResponse;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(input: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FLUTTERWAVE_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function verificationFromData(
  data: FlutterwaveTransactionData,
): PaymentProviderVerification {
  const providerTransactionId = asString(data.id) ?? "";
  const currency = asString(data.currency)?.trim().toUpperCase();
  const status = mapFlutterwaveStatus(data.status);
  const amountMinor =
    currency && data.amount != null
      ? parseFlutterwaveAmountToMinorUnits(data.amount, currency)
      : undefined;

  return {
    sonderTransactionReference: asString(data.tx_ref),
    providerTransactionId,
    providerReference: asString(data.flw_ref),
    providerStatus: asString(data.status),
    status,
    amountMinor,
    currency,
    confirmed: status === "confirmed",
    method: paymentMethodFromProvider(data.payment_type),
  };
}

async function createCheckout(
  config: Extract<FlutterwaveConfig, { enabled: true }>,
  input: PaymentCheckoutInput,
): Promise<PaymentProviderResult<PaymentProviderCheckout>> {
  const currency = normalizeCurrencyCode(input.currency);
  const payload: Record<string, unknown> = {
    tx_ref: input.sonderTransactionReference,
    amount: minorUnitsToDecimalString(input.amountMinor, currency),
    currency,
    redirect_url: input.returnUrl,
    customer: {
      email: input.customer.email,
      name: input.customer.name ?? undefined,
      phonenumber: input.customer.phoneNumber ?? undefined,
    },
    customizations: {
      title: "Sonder Book Club",
      description: input.description,
    },
    configurations: {
      session_duration: FLUTTERWAVE_CHECKOUT_SESSION_MINUTES,
      max_retry_attempt: FLUTTERWAVE_MAX_RETRY_ATTEMPTS,
    },
    meta: input.metadata ?? {},
  };

  if (config.paymentOptions) {
    payload.payment_options = config.paymentOptions.join(",");
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(`${FLUTTERWAVE_API_BASE_URL}/payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return failed("provider_checkout_unavailable", true);
  }

  const body = await parseJsonResponse(response);

  if (!response.ok || body?.status !== "success") {
    return failed("provider_checkout_failed", response.status >= 500);
  }

  const link = asString(asRecord(body.data)?.link);

  if (!link || !validateFlutterwaveCheckoutUrl(link)) {
    return failed("provider_checkout_url_rejected", false);
  }

  return {
    status: "ok",
    data: {
      checkoutUrl: link,
      invoiceId: input.invoiceId,
      sonderTransactionReference: input.sonderTransactionReference,
      providerCheckoutId: checkoutIdFromUrl(link),
      checkoutExpiresAt: checkoutExpiresAt(),
    },
  };
}

async function verifyPayment(
  config: Extract<FlutterwaveConfig, { enabled: true }>,
  providerTransactionId: string,
): Promise<PaymentProviderResult<PaymentProviderVerification>> {
  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${FLUTTERWAVE_API_BASE_URL}/transactions/${encodeURIComponent(
        providerTransactionId,
      )}/verify`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.secretKey}`,
          "Content-Type": "application/json",
        },
      },
    );
  } catch {
    return failed("provider_verification_unavailable", true);
  }

  const body = await parseJsonResponse(response);

  if (response.status === 404) {
    return failed("provider_transaction_not_found", false);
  }

  if (!response.ok || body?.status !== "success") {
    return failed("provider_verification_unavailable", response.status >= 500);
  }

  const data = transactionData(body.data);
  const verification = verificationFromData(data);

  if (!verification.providerTransactionId) {
    return failed("provider_verification_missing_transaction_id", false);
  }

  return {
    status: "ok",
    data: verification,
  };
}

async function parseWebhook(
  config: Extract<FlutterwaveConfig, { enabled: true }>,
  input: PaymentWebhookInput,
): Promise<PaymentProviderResult<PaymentWebhookResult>> {
  const signature = getHeader(input.headers, "verif-hash");

  if (
    !verifyFlutterwaveWebhookSignature({
      signature,
      webhookSecretHash: config.webhookSecretHash,
    })
  ) {
    return failed("invalid_webhook_signature", false);
  }

  let parsedBody = input.parsedBody;

  if (!parsedBody) {
    try {
      parsedBody = JSON.parse(input.rawBody) as unknown;
    } catch {
      return failed("malformed_webhook", false);
    }
  }

  const root = asRecord(parsedBody);

  if (!root) {
    return failed("malformed_webhook", false);
  }

  const data = transactionData(root.data);
  const eventType = asString(root.event) ?? asString(root["event.type"]);
  const transactionId = asString(data.id);
  const sonderReference = asString(data.tx_ref);
  const hash = payloadHash(input.rawBody);
  const providerEventId = asString(root.id);
  const eventKey = providerEventId
    ? `event:${providerEventId}`
    : [
        "event",
        eventType ?? "unknown",
        transactionId ?? "no_transaction",
        sonderReference ?? "no_reference",
      ].join(":");
  const currency = asString(data.currency)?.trim().toUpperCase();
  const amountMinor =
    currency && data.amount != null
      ? parseFlutterwaveAmountToMinorUnits(data.amount, currency)
      : undefined;

  if (!transactionId) {
    return failed("webhook_missing_transaction_id", false);
  }

  return {
    status: "ok",
    data: {
      eventId: providerEventId,
      eventKey,
      eventType,
      payloadHash: hash,
      sonderTransactionReference: sonderReference,
      providerTransactionId: transactionId,
      providerReference: asString(data.flw_ref),
      providerStatus: asString(data.status),
      status: mapFlutterwaveStatus(data.status),
      amountMinor,
      currency,
    },
  };
}

function disabledProvider(error: string | null): PaymentProvider {
  const message =
    error ?? "Flutterwave is not configured for this sandbox environment.";

  return {
    name: "flutterwave",
    isConfigured: false,
    configurationError: message,
    async createCheckout() {
      return {
        status: "disabled",
        message,
      };
    },
    async verifyPayment() {
      return {
        status: "disabled",
        message,
      };
    },
    async checkPaymentStatus() {
      return {
        status: "disabled",
        message,
      };
    },
    async parseWebhook() {
      return {
        status: "disabled",
        message,
      };
    },
    async refundPayment() {
      return {
        status: "disabled",
        message: "Refund execution is deferred in Change Set 7.",
      };
    },
  };
}

export function getFlutterwavePaymentProvider(): PaymentProvider {
  const config = getFlutterwaveConfig();

  if (!config.enabled) {
    return disabledProvider(config.error);
  }

  return {
    name: "flutterwave",
    isConfigured: true,
    configurationError: null,
    createCheckout: (input) => createCheckout(config, input),
    verifyPayment: (input) =>
      verifyPayment(config, input.providerTransactionId),
    checkPaymentStatus: (input) =>
      verifyPayment(config, input.providerTransactionId),
    parseWebhook: (input) => parseWebhook(config, input),
    async refundPayment() {
      return failed("refunds_deferred", false);
    },
  };
}
