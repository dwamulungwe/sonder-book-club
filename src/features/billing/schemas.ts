import {
  BillingInterval,
  InvoiceStatus,
  PaymentMethod,
  SubscriptionStatus,
} from "@prisma/client";
import { z } from "zod";

import { isSupportedBillingCurrencyCode } from "@/features/billing/currency";

export const membershipPlanSchema = z.object({
  planId: z.string().optional(),
  name: z
    .string()
    .min(2, "Plan name must be at least 2 characters.")
    .max(120, "Plan name must be 120 characters or fewer."),
  description: z
    .string()
    .max(500, "Description must be 500 characters or fewer.")
    .optional(),
  amount: z.string().min(1, "Enter a plan amount."),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Currency must be a three-letter ISO code.")
    .refine(
      (currency) => isSupportedBillingCurrencyCode(currency),
      "Only ZMW is currently supported for billing.",
    ),
  billingInterval: z.enum([
    BillingInterval.MONTHLY,
    BillingInterval.QUARTERLY,
    BillingInterval.ANNUAL,
    BillingInterval.ONE_TIME,
  ]),
  intervalCount: z
    .number()
    .int("Interval count must be a whole number.")
    .min(1, "Interval count must be at least 1.")
    .max(36, "Interval count must be 36 or fewer."),
  isActive: z.boolean(),
  isDefault: z.boolean(),
});

export const assignPlanSchema = z.object({
  membershipId: z.string().min(1, "Member is required."),
  planId: z.string().min(1, "Plan is required."),
});

export const createInvoiceSchema = z.object({
  membershipId: z.string().min(1, "Member is required."),
  subscriptionId: z.string().optional(),
});

export const recordPaymentSchema = z.object({
  membershipId: z.string().min(1, "Member is required."),
  invoiceId: z.string().optional(),
  amount: z.string().optional(),
  method: z.enum([
    PaymentMethod.CASH,
    PaymentMethod.BANK_TRANSFER,
    PaymentMethod.MOBILE_MONEY,
    PaymentMethod.OTHER,
  ]),
  paidAt: z.string().optional(),
  externalReference: z
    .string()
    .max(160, "Reference must be 160 characters or fewer.")
    .optional(),
  notes: z
    .string()
    .max(1000, "Notes must be 1000 characters or fewer.")
    .optional(),
  idempotencyKey: z
    .string()
    .max(160, "Idempotency key is too long.")
    .optional(),
});

export const confirmPaymentSchema = z.object({
  paymentId: z.string().min(1, "Payment is required."),
});

export const voidInvoiceSchema = z.object({
  invoiceId: z.string().min(1, "Invoice is required."),
});

export const subscriptionUpdateSchema = z.object({
  subscriptionId: z.string().min(1, "Subscription is required."),
  action: z.enum(["pause", "cancel", "waive"]),
  reason: z
    .string()
    .max(500, "Reason must be 500 characters or fewer.")
    .optional(),
});

export const subscriptionStatusFilterValues = [
  SubscriptionStatus.PENDING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.PAUSED,
  SubscriptionStatus.CANCELLED,
  SubscriptionStatus.WAIVED,
] as const;

export const invoiceStatusFilterValues = [
  InvoiceStatus.DRAFT,
  InvoiceStatus.OPEN,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.PAID,
  InvoiceStatus.VOID,
  InvoiceStatus.OVERDUE,
] as const;

export function parseSubscriptionStatusFilter(
  value: string | string[] | undefined,
) {
  const candidate = Array.isArray(value) ? value[0] : value;

  return subscriptionStatusFilterValues.find((status) => status === candidate);
}

export function parseInvoiceStatusFilter(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;

  return invoiceStatusFilterValues.find((status) => status === candidate);
}
