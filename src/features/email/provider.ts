import type { EmailProviderConfig } from "@/features/email/server-config";

export type OutboundEmailMessage = {
  toEmail: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  idempotencyKey: string;
  tags?: Array<{
    name: string;
    value: string;
  }>;
};

export type EmailProviderSendResult =
  | {
      status: "accepted";
      providerMessageId: string;
      httpStatus: number;
    }
  | {
      status: "retryable_failure";
      failureCategory: string;
      failureCode: string;
      httpStatus?: number;
      retryAfterMs?: number;
    }
  | {
      status: "permanent_failure";
      failureCategory: string;
      failureCode: string;
      httpStatus?: number;
    }
  | {
      status: "unknown";
      failureCategory: "unknown_delivery";
      failureCode: string;
    }
  | {
      status: "disabled";
      failureCode: string;
    };

export type NormalizedEmailDeliveryEventType =
  | "accepted"
  | "delivered"
  | "delivery_delayed"
  | "failed"
  | "bounced"
  | "complained"
  | "suppressed"
  | "ignored";

export type NormalizedEmailDeliveryEvent = {
  provider: string;
  providerEventId: string;
  providerMessageId: string | null;
  eventType: NormalizedEmailDeliveryEventType;
  providerEventType: string;
  eventTimestamp: Date;
  payloadHash: string;
  recipientEmail: string | null;
  failureCode: string | null;
};

export type EmailWebhookParseResult =
  | {
      status: "ok";
      event: NormalizedEmailDeliveryEvent;
    }
  | {
      status: "failed";
      error: "missing_signature" | "invalid_signature" | "malformed_webhook";
    }
  | {
      status: "disabled";
      error: "provider_disabled" | "webhook_not_configured";
    };

export type EmailProvider = {
  name: string;
  isConfigured: boolean;
  configurationError: string | null;
  send(message: OutboundEmailMessage): Promise<EmailProviderSendResult>;
  parseWebhook(input: {
    rawBody: string;
    headers: Headers;
  }): Promise<EmailWebhookParseResult>;
};

function disabledResult(failureCode: string): EmailProviderSendResult {
  return {
    status: "disabled",
    failureCode,
  };
}

export function createDisabledEmailProvider(input?: {
  name?: string;
  configurationError?: string | null;
}): EmailProvider {
  const failureCode = input?.configurationError ?? "provider_disabled";

  return {
    name: input?.name ?? "disabled",
    isConfigured: false,
    configurationError: input?.configurationError ?? null,
    async send() {
      return disabledResult(failureCode);
    },
    async parseWebhook() {
      return {
        status: "disabled",
        error:
          failureCode === "webhook_not_configured"
            ? "webhook_not_configured"
            : "provider_disabled",
      };
    },
  };
}

export async function emailProviderFromConfig(
  config: EmailProviderConfig,
): Promise<EmailProvider> {
  if (!config.enabled || config.provider !== "resend") {
    return createDisabledEmailProvider({
      name: config.provider,
      configurationError: config.configurationError,
    });
  }

  const { createResendEmailProvider } = await import(
    "@/features/email/providers/resend"
  );

  return createResendEmailProvider(config);
}

export async function getEmailProvider(): Promise<EmailProvider> {
  const { getEmailProviderConfig } = await import(
    "@/features/email/server-config"
  );

  return emailProviderFromConfig(getEmailProviderConfig());
}
