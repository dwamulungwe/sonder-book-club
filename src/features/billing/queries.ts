import {
  InvoiceStatus,
  MembershipStatus,
  PaymentStatus,
  Prisma,
  SubscriptionStatus,
  SystemRole,
} from "@prisma/client";

import { calculateMemberBillingStatus } from "@/features/billing/service";
import { db } from "@/lib/db";
import { canManageBilling } from "@/lib/permissions";

export const MEMBER_INVOICE_LIMIT = 20;
export const MEMBER_PAYMENT_HISTORY_LIMIT = 25;
export const ADMIN_BILLING_MEMBER_LIMIT = 25;
export const ADMIN_BILLING_DETAIL_LIMIT = 6;

const CURRENT_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.PAUSED,
  SubscriptionStatus.WAIVED,
  SubscriptionStatus.PENDING,
];

const OPEN_INVOICE_STATUSES: readonly InvoiceStatus[] = [
  InvoiceStatus.OPEN,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
];

type BillingAdminContext = {
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

export async function getMemberBillingPageData(userId: string) {
  const membership = await db.membership.findUnique({
    where: {
      userId,
    },
    include: {
      user: {
        select: {
          name: true,
          email: true,
        },
      },
      subscriptions: {
        include: {
          plan: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
      },
      invoices: {
        where: {
          status: {
            in: [
              InvoiceStatus.OPEN,
              InvoiceStatus.PARTIALLY_PAID,
              InvoiceStatus.OVERDUE,
              InvoiceStatus.PAID,
            ],
          },
        },
        orderBy: [
          {
            dueAt: "asc",
          },
          {
            createdAt: "desc",
          },
        ],
        take: MEMBER_INVOICE_LIMIT,
      },
      payments: {
        include: {
          invoice: {
            select: {
              invoiceNumber: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: MEMBER_PAYMENT_HISTORY_LIMIT,
      },
    },
  });

  const currentSubscription =
    membership?.subscriptions.find((subscription) =>
      CURRENT_SUBSCRIPTION_STATUSES.includes(subscription.status),
    ) ?? null;
  const openInvoices =
    membership?.invoices.filter((invoice) =>
      OPEN_INVOICE_STATUSES.includes(invoice.status),
    ) ?? [];
  const overdueInvoices =
    membership?.invoices.filter((invoice) => invoice.status === InvoiceStatus.OVERDUE) ??
    [];

  return {
    membership,
    currentSubscription,
    openInvoices,
    overdueInvoices,
    recentPayments: membership?.payments ?? [],
    billingStatus: calculateMemberBillingStatus({
      subscriptionStatus: currentSubscription?.status,
      openInvoiceCount: openInvoices.length,
      overdueInvoiceCount: overdueInvoices.length,
    }),
  };
}

export async function getAdminBillingPageData(
  context: BillingAdminContext,
  filters: {
    search?: string;
    subscriptionStatus?: SubscriptionStatus;
    invoiceStatus?: InvoiceStatus;
  },
) {
  if (!canManageBilling(context.user, context.membership)) {
    throw new Error("Active admin access is required for billing.");
  }

  const trimmedSearch = filters.search?.trim();
  const memberWhere: Prisma.MembershipWhereInput = {
    status: MembershipStatus.ACTIVE,
    user: {
      deletedAt: null,
      ...(trimmedSearch
        ? {
            OR: [
              {
                name: {
                  contains: trimmedSearch,
                  mode: "insensitive",
                },
              },
              {
                email: {
                  contains: trimmedSearch,
                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
    },
    ...(filters.subscriptionStatus
      ? {
          subscriptions: {
            some: {
              status: filters.subscriptionStatus,
            },
          },
        }
      : {}),
    ...(filters.invoiceStatus
      ? {
          invoices: {
            some: {
              status: filters.invoiceStatus,
            },
          },
        }
      : {}),
  };

  const [memberships, activePlans, totalMatching] = await Promise.all([
    db.membership.findMany({
      where: memberWhere,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        subscriptions: {
          include: {
            plan: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 3,
        },
        invoices: {
          where: filters.invoiceStatus
            ? {
                status: filters.invoiceStatus,
              }
            : undefined,
          orderBy: [
            {
              dueAt: "asc",
            },
            {
              createdAt: "desc",
            },
          ],
          take: ADMIN_BILLING_DETAIL_LIMIT,
        },
        payments: {
          include: {
            invoice: {
              select: {
                invoiceNumber: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: ADMIN_BILLING_DETAIL_LIMIT,
        },
      },
      orderBy: [
        {
          joinedAt: "desc",
        },
        {
          id: "asc",
        },
      ],
      take: ADMIN_BILLING_MEMBER_LIMIT,
    }),
    db.membershipPlan.findMany({
      where: {
        isActive: true,
      },
      orderBy: [
        {
          isDefault: "desc",
        },
        {
          name: "asc",
        },
      ],
    }),
    db.membership.count({
      where: memberWhere,
    }),
  ]);

  return {
    memberships,
    activePlans,
    totalMatching,
    filters,
    limit: ADMIN_BILLING_MEMBER_LIMIT,
  };
}

export async function getMembershipPlansAdminPageData(
  context: BillingAdminContext,
) {
  if (!canManageBilling(context.user, context.membership)) {
    throw new Error("Active admin access is required for membership plans.");
  }

  const plans = await db.membershipPlan.findMany({
    include: {
      _count: {
        select: {
          subscriptions: true,
        },
      },
    },
    orderBy: [
      {
        isActive: "desc",
      },
      {
        isDefault: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
  });

  return {
    plans,
  };
}

export function paymentIsPending(status: PaymentStatus) {
  return status === PaymentStatus.PENDING;
}
