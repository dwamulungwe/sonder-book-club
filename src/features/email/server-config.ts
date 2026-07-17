import "server-only";

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_LEASE_SECONDS = 120;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const MAX_BATCH_SIZE = 50;

const EMAIL_ADDRESS_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export type ResendEmailProviderConfig = {
  provider: "resend";
  enabled: true;
  configurationError: null;
  from: string;
  replyTo: string | null;
  apiKey: string;
  webhookSigningSecret: string;
  requestTimeoutMs: number;
  batchSize: number;
  leaseSeconds: number;
};

export type DisabledEmailProviderConfig = {
  provider: "disabled" | "resend";
  enabled: false;
  configurationError: string | null;
  batchSize: number;
  leaseSeconds: number;
};

export type EmailProviderConfig =
  | ResendEmailProviderConfig
  | DisabledEmailProviderConfig;

function envValue(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (!value || !/^\d+$/.test(value)) {
    return fallback;
  }

  return Math.max(minimum, Math.min(Number(value), maximum));
}

export function isValidEmailAddress(value: string) {
  return (
    value.length <= 255 &&
    !/[\r\n]/.test(value) &&
    EMAIL_ADDRESS_PATTERN.test(value)
  );
}

export function isValidSenderAddress(value: string) {
  if (!value || value.length > 320 || /[\r\n]/.test(value)) {
    return false;
  }

  const bracketed = value.match(/^([^<>]*)<([^<>]+)>$/);

  if (!bracketed) {
    return isValidEmailAddress(value);
  }

  const displayName = bracketed[1]?.trim() ?? "";
  const address = bracketed[2]?.trim() ?? "";

  return displayName.length > 0 && displayName.length <= 80 && isValidEmailAddress(address);
}

export function getTrustedAppBaseUrl() {
  const configured = envValue("SONDER_APP_BASE_URL");

  if (!configured) {
    return process.env.NODE_ENV === "production" ? null : new URL("http://localhost:3000");
  }

  try {
    const url = new URL(configured);
    const isLocalDevelopment =
      process.env.NODE_ENV !== "production" &&
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");

    if (
      (url.protocol !== "https:" && !isLocalDevelopment) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }

    url.pathname = "/";
    return url;
  } catch {
    return null;
  }
}

export function getEmailProviderConfig(): EmailProviderConfig {
  const requestedProvider = envValue("SONDER_EMAIL_PROVIDER")?.toLowerCase() ?? "disabled";
  const batchSize = boundedInteger(
    process.env.SONDER_EMAIL_BATCH_SIZE,
    DEFAULT_BATCH_SIZE,
    1,
    MAX_BATCH_SIZE,
  );
  const leaseSeconds = boundedInteger(
    process.env.SONDER_EMAIL_LEASE_SECONDS,
    DEFAULT_LEASE_SECONDS,
    30,
    900,
  );

  if (requestedProvider === "disabled" || requestedProvider === "") {
    return {
      provider: "disabled",
      enabled: false,
      configurationError: null,
      batchSize,
      leaseSeconds,
    };
  }

  if (requestedProvider !== "resend") {
    return {
      provider: "disabled",
      enabled: false,
      configurationError: "unsupported_provider",
      batchSize,
      leaseSeconds,
    };
  }

  const from = envValue("SONDER_EMAIL_FROM");
  const replyTo = envValue("SONDER_EMAIL_REPLY_TO");
  const apiKey = envValue("RESEND_API_KEY");
  const webhookSigningSecret = envValue("RESEND_WEBHOOK_SIGNING_SECRET");

  if (!from || !isValidSenderAddress(from)) {
    return {
      provider: "resend",
      enabled: false,
      configurationError: "invalid_sender",
      batchSize,
      leaseSeconds,
    };
  }

  if (replyTo && !isValidSenderAddress(replyTo)) {
    return {
      provider: "resend",
      enabled: false,
      configurationError: "invalid_reply_to",
      batchSize,
      leaseSeconds,
    };
  }

  if (!apiKey) {
    return {
      provider: "resend",
      enabled: false,
      configurationError: "missing_api_key",
      batchSize,
      leaseSeconds,
    };
  }

  if (!webhookSigningSecret) {
    return {
      provider: "resend",
      enabled: false,
      configurationError: "webhook_not_configured",
      batchSize,
      leaseSeconds,
    };
  }

  if (!getTrustedAppBaseUrl()) {
    return {
      provider: "resend",
      enabled: false,
      configurationError: "invalid_app_base_url",
      batchSize,
      leaseSeconds,
    };
  }

  return {
    provider: "resend",
    enabled: true,
    configurationError: null,
    from,
    replyTo,
    apiKey,
    webhookSigningSecret,
    requestTimeoutMs: boundedInteger(
      process.env.SONDER_EMAIL_REQUEST_TIMEOUT_MS,
      DEFAULT_REQUEST_TIMEOUT_MS,
      1_000,
      30_000,
    ),
    batchSize,
    leaseSeconds,
  };
}
