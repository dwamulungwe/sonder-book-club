import { createHash } from "node:crypto";
import { Webhook } from "svix";

import type {
  EmailProvider,
  EmailProviderSendResult,
  NormalizedEmailDeliveryEventType,
} from "@/features/email/provider";
import type { ResendEmailProviderConfig } from "@/features/email/server-config";

const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";
const MAX_FAILURE_CODE_LENGTH = 120;

type FetchLike = typeof fetch;

function sanitizedCode(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_FAILURE_CODE_LENGTH);

  return normalized || fallback;
}

function parseRetryAfter(value: string | null) {
  if (!value) {
    return undefined;
  }

  if (/^\d+$/.test(value)) {
    return Math.min(Number(value) * 1_000, 6 * 60 * 60 * 1_000);
  }

  const retryAt = Date.parse(value);
  return Number.isFinite(retryAt)
    ? Math.max(0, Math.min(retryAt - Date.now(), 6 * 60 * 60 * 1_000))
    : undefined;
}

function normalizedEventType(value: string): NormalizedEmailDeliveryEventType {
  const mapping: Record<string, NormalizedEmailDeliveryEventType> = {
    "email.sent": "accepted",
    "email.delivered": "delivered",
    "email.delivery_delayed": "delivery_delayed",
    "email.failed": "failed",
    "email.bounced": "bounced",
    "email.complained": "complained",
    "email.suppressed": "suppressed",
  };

  return mapping[value] ?? "ignored";
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function eventFailureCode(data: Record<string, unknown>) {
  const error = recordValue(data.error);
  const bounce = recordValue(data.bounce);
  const candidate =
    error?.type ??
    error?.name ??
    bounce?.subType ??
    bounce?.type ??
    data.reason;

  return candidate ? sanitizedCode(candidate, "provider_event_failure") : null;
}

function parseResponseError(rawBody: string) {
  try {
    const parsed = recordValue(JSON.parse(rawBody));
    return sanitizedCode(parsed?.name ?? parsed?.type, "provider_rejected");
  } catch {
    return "provider_rejected";
  }
}

export function createResendEmailProvider(
  config: ResendEmailProviderConfig,
  providerFetch: FetchLike = globalThis.fetch,
): EmailProvider {
  return {
    name: "resend",
    isConfigured: true,
    configurationError: null,
    async send(message): Promise<EmailProviderSendResult> {
      try {
        const response = await providerFetch(RESEND_EMAIL_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": message.idempotencyKey,
          },
          body: JSON.stringify({
            from: config.from,
            to: [message.toEmail],
            ...(config.replyTo ? { reply_to: config.replyTo } : {}),
            subject: message.subject,
            html: message.htmlBody,
            text: message.textBody,
            ...(message.tags?.length ? { tags: message.tags } : {}),
          }),
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(config.requestTimeoutMs),
        });
        const responseBody = await response.text();

        if (response.ok) {
          try {
            const parsed = recordValue(JSON.parse(responseBody));
            const providerMessageId = parsed?.id;

            if (typeof providerMessageId === "string" && providerMessageId.trim()) {
              return {
                status: "accepted",
                providerMessageId: providerMessageId.slice(0, 255),
                httpStatus: response.status,
              };
            }
          } catch {
            // A 2xx response without the documented ID leaves delivery uncertain.
          }

          return {
            status: "unknown",
            failureCategory: "unknown_delivery",
            failureCode: "accepted_without_message_id",
          };
        }

        const failureCode = parseResponseError(responseBody.slice(0, 4_096));

        if (response.status === 429) {
          return {
            status: "retryable_failure",
            failureCategory: "rate_limited",
            failureCode,
            httpStatus: response.status,
            retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
          };
        }

        if (response.status >= 500 || (response.status === 409 && failureCode === "concurrent_idempotent_requests")) {
          return {
            status: "retryable_failure",
            failureCategory: response.status >= 500 ? "provider_unavailable" : "idempotency_in_progress",
            failureCode,
            httpStatus: response.status,
          };
        }

        return {
          status: "permanent_failure",
          failureCategory:
            failureCode === "invalid_to_address" ||
            failureCode === "invalid_recipient"
              ? "invalid_recipient"
              : response.status === 401 || response.status === 403
              ? "provider_authentication"
              : response.status === 409
                ? "idempotency_conflict"
                : "provider_rejected",
          failureCode,
          httpStatus: response.status,
        };
      } catch (error) {
        return {
          status: "unknown",
          failureCategory: "unknown_delivery",
          failureCode:
            error instanceof DOMException && error.name === "TimeoutError"
              ? "request_timeout"
              : "network_outcome_unknown",
        };
      }
    },
    async parseWebhook({ rawBody, headers }) {
      const providerEventId = headers.get("svix-id");
      const timestamp = headers.get("svix-timestamp");
      const signature = headers.get("svix-signature");

      if (!providerEventId || !timestamp || !signature) {
        return {
          status: "failed",
          error: "missing_signature",
        } as const;
      }

      let verified: unknown;
      try {
        verified = new Webhook(config.webhookSigningSecret).verify(rawBody, {
          "svix-id": providerEventId,
          "svix-timestamp": timestamp,
          "svix-signature": signature,
        });
      } catch {
        return {
          status: "failed",
          error: "invalid_signature",
        } as const;
      }

      const event = recordValue(verified);
      const data = recordValue(event?.data);
      const providerEventType = event?.type;
      const createdAt = event?.created_at;

      if (
        !event ||
        !data ||
        typeof providerEventType !== "string" ||
        typeof createdAt !== "string"
      ) {
        return {
          status: "failed",
          error: "malformed_webhook",
        } as const;
      }

      const eventTimestamp = new Date(createdAt);
      if (!Number.isFinite(eventTimestamp.getTime())) {
        return {
          status: "failed",
          error: "malformed_webhook",
        } as const;
      }

      const recipients = Array.isArray(data.to) ? data.to : [];
      const recipientEmail =
        typeof recipients[0] === "string" ? recipients[0].trim().toLowerCase() : null;

      return {
        status: "ok",
        event: {
          provider: "resend",
          providerEventId: providerEventId.slice(0, 160),
          providerMessageId:
            typeof data.email_id === "string" ? data.email_id.slice(0, 255) : null,
          eventType: normalizedEventType(providerEventType),
          providerEventType: providerEventType.slice(0, 80),
          eventTimestamp,
          payloadHash: createHash("sha256").update(rawBody, "utf8").digest("hex"),
          recipientEmail,
          failureCode: eventFailureCode(data),
        },
      } as const;
    },
  };
}
