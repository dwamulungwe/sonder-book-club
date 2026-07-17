import {
  EmailOutboxStatus,
  MembershipStatus,
  Prisma,
  SystemRole,
} from "@prisma/client";

import { db } from "@/lib/db";
import { canAdministerEmailOutbox } from "@/lib/permissions";

export const EMAIL_OUTBOX_PAGE_LIMIT = 50;
export const EMAIL_AUDIT_ITEM_LIMIT = 20;

export const emailOutboxStatusFilterValues = Object.values(EmailOutboxStatus);
export const emailOutboxDueFilterValues = ["due", "retry", "review"] as const;
export const emailOutboxProviderFilterValues = [
  "unassigned",
  "resend",
  "legacy",
] as const;

export type EmailOutboxDueFilter =
  (typeof emailOutboxDueFilterValues)[number];

export function parseEmailOutboxStatusFilter(
  value: string | string[] | undefined,
) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return emailOutboxStatusFilterValues.find((status) => status === candidate);
}

export function parseEmailOutboxDueFilter(
  value: string | string[] | undefined,
) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return emailOutboxDueFilterValues.find((filter) => filter === candidate);
}

export function parseEmailOutboxProviderFilter(
  value: string | string[] | undefined,
) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return emailOutboxProviderFilterValues.find(
    (provider) => provider === candidate,
  );
}

export function parseEmailOutboxSearch(
  value: string | string[] | undefined,
) {
  const candidate = Array.isArray(value) ? value[0] : value;
  const normalized = candidate?.trim().slice(0, 80);
  return normalized || undefined;
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
  return status.toLowerCase().replaceAll("_", " ");
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

export type EmailOutboxFilters = {
  status?: EmailOutboxStatus;
  provider?: (typeof emailOutboxProviderFilterValues)[number];
  due?: EmailOutboxDueFilter;
  search?: string;
};

function emailWhere(filters: EmailOutboxFilters): Prisma.EmailOutboxWhereInput {
  const now = new Date();
  const clauses: Prisma.EmailOutboxWhereInput[] = [];

  if (filters.status) {
    clauses.push({ status: filters.status });
  }

  if (filters.provider === "unassigned") {
    clauses.push({ provider: null });
  } else if (filters.provider) {
    clauses.push({ provider: filters.provider });
  }

  if (filters.due === "due") {
    clauses.push({
      status: {
        in: [
          EmailOutboxStatus.PENDING,
          EmailOutboxStatus.RETRY_SCHEDULED,
        ],
      },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    });
  } else if (filters.due === "retry") {
    clauses.push({ status: EmailOutboxStatus.RETRY_SCHEDULED });
  } else if (filters.due === "review") {
    clauses.push({ status: EmailOutboxStatus.REVIEW_REQUIRED });
  }

  if (filters.search) {
    clauses.push({
      OR: [
        { id: { contains: filters.search, mode: "insensitive" } },
        { templateKey: { contains: filters.search, mode: "insensitive" } },
        { dedupeKey: { contains: filters.search, mode: "insensitive" } },
        {
          providerMessageId: {
            contains: filters.search,
            mode: "insensitive",
          },
        },
      ],
    });
  }

  return clauses.length ? { AND: clauses } : {};
}

export async function getEmailOutboxPageData(
  context: EmailOutboxAdminContext,
  filters: EmailOutboxFilters = {},
) {
  if (!canAdministerEmailOutbox(context.user, context.membership)) {
    throw new Error("Active admin access is required for the email outbox.");
  }

  const [emails, unmatchedWebhookEvents, suppressions] = await Promise.all([
    db.emailOutbox.findMany({
      where: emailWhere(filters),
      select: {
        id: true,
        toEmail: true,
        templateKey: true,
        templateVersion: true,
        subject: true,
        deliveryClass: true,
        status: true,
        provider: true,
        attempts: true,
        maxAttempts: true,
        nextAttemptAt: true,
        processingStartedAt: true,
        leaseExpiresAt: true,
        sentAt: true,
        deliveredAt: true,
        providerMessageId: true,
        uncertainSince: true,
        lastFailureCategory: true,
        lastFailureCode: true,
        lastFailureRetryable: true,
        createdAt: true,
        updatedAt: true,
        recipientUser: {
          select: {
            name: true,
          },
        },
        deliveryAttempts: {
          select: {
            id: true,
            attemptNumber: true,
            provider: true,
            providerMessageId: true,
            startedAt: true,
            completedAt: true,
            outcome: true,
            httpStatus: true,
            failureCode: true,
            retryable: true,
            uncertainDelivery: true,
          },
          orderBy: { attemptNumber: "desc" },
          take: 5,
        },
        webhookEvents: {
          select: {
            id: true,
            providerEventId: true,
            providerMessageId: true,
            eventType: true,
            eventTimestamp: true,
            status: true,
            failureReason: true,
          },
          orderBy: { eventTimestamp: "desc" },
          take: 5,
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: EMAIL_OUTBOX_PAGE_LIMIT,
    }),
    db.emailProviderWebhookEvent.findMany({
      where: {
        outboxId: null,
      },
      select: {
        id: true,
        provider: true,
        providerEventId: true,
        providerMessageId: true,
        eventType: true,
        eventTimestamp: true,
        status: true,
        failureReason: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: EMAIL_AUDIT_ITEM_LIMIT,
    }),
    db.emailSuppression.findMany({
      select: {
        id: true,
        normalizedEmail: true,
        reason: true,
        active: true,
        provider: true,
        source: true,
        firstOccurredAt: true,
        lastOccurredAt: true,
        resolvedAt: true,
      },
      orderBy: { lastOccurredAt: "desc" },
      take: EMAIL_AUDIT_ITEM_LIMIT,
    }),
  ]);

  return {
    emails,
    unmatchedWebhookEvents,
    suppressions,
    limit: EMAIL_OUTBOX_PAGE_LIMIT,
    filters,
  };
}
