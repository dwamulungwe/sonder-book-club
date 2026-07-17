import { EmailSuppressionReason, type Prisma } from "@prisma/client";

import { isValidEmailAddress } from "@/features/email/server-config";

const SUPPRESSION_PRECEDENCE: Record<EmailSuppressionReason, number> = {
  [EmailSuppressionReason.INVALID_ADDRESS]: 1,
  [EmailSuppressionReason.PROVIDER_SUPPRESSION]: 2,
  [EmailSuppressionReason.HARD_BOUNCE]: 3,
  [EmailSuppressionReason.ADMINISTRATIVE]: 4,
  [EmailSuppressionReason.COMPLAINT]: 5,
};

export function chooseSuppressionReason(
  current: EmailSuppressionReason,
  incoming: EmailSuppressionReason,
) {
  return SUPPRESSION_PRECEDENCE[incoming] > SUPPRESSION_PRECEDENCE[current]
    ? incoming
    : current;
}

export function normalizeEmailAddress(value: string) {
  const normalized = value.trim().toLowerCase();
  return isValidEmailAddress(normalized) ? normalized : null;
}

export async function upsertEmailSuppression(
  tx: Prisma.TransactionClient,
  input: {
    email: string;
    reason: EmailSuppressionReason;
    provider?: string | null;
    source: string;
    occurredAt: Date;
  },
) {
  const normalizedEmail = normalizeEmailAddress(input.email);
  if (!normalizedEmail) {
    return null;
  }

  const existing = await tx.emailSuppression.findUnique({
    where: {
      normalizedEmail,
    },
  });

  if (!existing) {
    return tx.emailSuppression.create({
      data: {
        normalizedEmail,
        reason: input.reason,
        active: true,
        provider: input.provider ?? null,
        source: input.source,
        firstOccurredAt: input.occurredAt,
        lastOccurredAt: input.occurredAt,
      },
    });
  }

  const reason = chooseSuppressionReason(existing.reason, input.reason);

  return tx.emailSuppression.update({
    where: {
      id: existing.id,
    },
    data: {
      reason,
      active: true,
      provider: input.provider ?? existing.provider,
      source:
        reason === input.reason && reason !== existing.reason
          ? input.source
          : existing.source,
      firstOccurredAt:
        input.occurredAt < existing.firstOccurredAt
          ? input.occurredAt
          : existing.firstOccurredAt,
      lastOccurredAt:
        input.occurredAt > existing.lastOccurredAt
          ? input.occurredAt
          : existing.lastOccurredAt,
      resolvedAt: null,
      resolvedById: null,
      resolutionNote: null,
    },
  });
}
