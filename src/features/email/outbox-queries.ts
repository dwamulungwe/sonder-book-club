import {
  EmailOutboxStatus,
  MembershipStatus,
  SystemRole,
} from "@prisma/client";

import { db } from "@/lib/db";
import { canAdministerEmailOutbox } from "@/lib/permissions";

export const EMAIL_OUTBOX_PAGE_LIMIT = 50;

export const emailOutboxStatusFilterValues = [
  EmailOutboxStatus.PENDING,
  EmailOutboxStatus.PROCESSING,
  EmailOutboxStatus.SENT,
  EmailOutboxStatus.FAILED,
  EmailOutboxStatus.CANCELLED,
] as const;

export function parseEmailOutboxStatusFilter(
  value: string | string[] | undefined,
) {
  const candidate = Array.isArray(value) ? value[0] : value;

  return emailOutboxStatusFilterValues.find((status) => status === candidate);
}

export function maskEmailAddress(email: string) {
  const [localPart = "", domain = ""] = email.split("@");
  const maskedLocal =
    localPart.length <= 2
      ? `${localPart.slice(0, 1)}*`
      : `${localPart.slice(0, 2)}***${localPart.slice(-1)}`;
  const maskedDomain =
    domain.length <= 4 ? domain : `${domain.slice(0, 2)}***${domain.slice(-4)}`;

  return `${maskedLocal}@${maskedDomain}`;
}

export function formatEmailOutboxStatus(status: EmailOutboxStatus) {
  return status.toLowerCase();
}

type EmailOutboxAdminContext = {
  user: {
    systemRole: SystemRole;
  };
  membership:
    | {
        role: SystemRole;
        status: MembershipStatus;
      }
    | null
    | undefined;
};

export async function getEmailOutboxPageData(
  context: EmailOutboxAdminContext,
  status?: EmailOutboxStatus,
) {
  if (!canAdministerEmailOutbox(context.user, context.membership)) {
    throw new Error("Active admin access is required for the email outbox.");
  }

  const emails = await db.emailOutbox.findMany({
    where: status ? { status } : undefined,
    select: {
      id: true,
      toEmail: true,
      templateKey: true,
      subject: true,
      status: true,
      attempts: true,
      maxAttempts: true,
      nextAttemptAt: true,
      processingStartedAt: true,
      sentAt: true,
      providerMessageId: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
      recipientUser: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: EMAIL_OUTBOX_PAGE_LIMIT,
  });

  return {
    emails,
    limit: EMAIL_OUTBOX_PAGE_LIMIT,
    status,
  };
}
