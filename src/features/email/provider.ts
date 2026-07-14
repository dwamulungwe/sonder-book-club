export type OutboundEmailMessage = {
  toEmail: string;
  subject: string;
  textBody: string;
  htmlBody?: string | null;
};

export type EmailProviderSendResult =
  | {
      status: "disabled";
      message: string;
    }
  | {
      status: "sent";
      providerMessageId?: string | null;
    }
  | {
      status: "failed";
      error: string;
      retryable: boolean;
    };

export type EmailProvider = {
  name: string;
  isConfigured: boolean;
  send(message: OutboundEmailMessage): Promise<EmailProviderSendResult>;
};

const disabledProvider: EmailProvider = {
  name: "disabled",
  isConfigured: false,
  async send() {
    return {
      status: "disabled",
      message: "No live email provider is configured.",
    };
  },
};

function unsupportedProvider(name: string): EmailProvider {
  return {
    name,
    isConfigured: false,
    async send() {
      return {
        status: "disabled",
        message: `Email provider "${name}" is not implemented in this build.`,
      };
    },
  };
}

export function getEmailProvider(): EmailProvider {
  const configuredProvider = process.env.SONDER_EMAIL_PROVIDER?.trim();

  if (configuredProvider && configuredProvider !== "disabled") {
    return unsupportedProvider(configuredProvider);
  }

  return disabledProvider;
}
