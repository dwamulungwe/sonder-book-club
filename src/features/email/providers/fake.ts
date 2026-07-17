import type {
  EmailProvider,
  EmailProviderSendResult,
  EmailWebhookParseResult,
  OutboundEmailMessage,
} from "@/features/email/provider";

export type FakeEmailProvider = EmailProvider & {
  sentMessages: OutboundEmailMessage[];
};

export function createFakeEmailProvider(input?: {
  name?: string;
  configured?: boolean;
  sendResults?: EmailProviderSendResult[];
  webhookResult?: EmailWebhookParseResult;
}): FakeEmailProvider {
  const sentMessages: OutboundEmailMessage[] = [];
  const results = [...(input?.sendResults ?? [])];
  const configured = input?.configured ?? true;

  return {
    name: input?.name ?? "fake",
    isConfigured: configured,
    configurationError: configured ? null : "provider_disabled",
    sentMessages,
    async send(message) {
      sentMessages.push(message);
      return (
        results.shift() ?? {
          status: "accepted",
          providerMessageId: `fake-${sentMessages.length}`,
          httpStatus: 200,
        }
      );
    },
    async parseWebhook() {
      return (
        input?.webhookResult ?? {
          status: "failed",
          error: "invalid_signature",
        }
      );
    },
  };
}
