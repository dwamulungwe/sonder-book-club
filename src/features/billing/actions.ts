"use server";

import { Prisma } from "@prisma/client";

import { parseMinorUnits } from "@/features/billing/currency";
import { requireBillingAdmin } from "@/features/billing/permissions";
import {
  assignPlanSchema,
  confirmPaymentSchema,
  createInvoiceSchema,
  membershipPlanSchema,
  recordPaymentSchema,
  subscriptionUpdateSchema,
  voidInvoiceSchema,
} from "@/features/billing/schemas";
import {
  assignPlanToMembership,
  BillingError,
  confirmPayment,
  createInvoiceForMembershipCurrentPeriod,
  createOrUpdateMembershipPlan,
  recordPayment,
  updateSubscriptionState,
  voidInvoice,
} from "@/features/billing/service";
import {
  getCheckbox,
  getInt,
  getOptionalString,
  getString,
} from "@/lib/form-data";
import { redirectWithNotice, resolveReturnPath } from "@/lib/navigation";

function firstIssueMessage(error: { issues: Array<{ message: string }> }) {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

function isKnownPrismaError(error: unknown, code: string) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

function parseOptionalDate(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function redirectForBillingError(
  redirectTo: string,
  error: unknown,
  fallback: string,
) {
  if (error instanceof BillingError) {
    redirectWithNotice(redirectTo, "error", error.message);
  }

  if (isKnownPrismaError(error, "P2002")) {
    redirectWithNotice(
      redirectTo,
      "error",
      "That billing change conflicts with an existing record.",
    );
  }

  if (isKnownPrismaError(error, "P2034")) {
    redirectWithNotice(
      redirectTo,
      "error",
      "Billing was updated at the same time. Refresh and try again.",
    );
  }

  redirectWithNotice(redirectTo, "error", fallback);
}

export async function saveMembershipPlanAction(formData: FormData) {
  const redirectTo = resolveReturnPath(formData, "/admin/membership-plans");
  const { user } = await requireBillingAdmin(redirectTo);
  const parsed = membershipPlanSchema.safeParse({
    planId: getOptionalString(formData, "planId"),
    name: getString(formData, "name"),
    description: getOptionalString(formData, "description"),
    amount: getString(formData, "amount"),
    currency: getString(formData, "currency") || "ZMW",
    billingInterval: getString(formData, "billingInterval"),
    intervalCount: getInt(formData, "intervalCount") ?? 1,
    isActive: getCheckbox(formData, "isActive"),
    isDefault: getCheckbox(formData, "isDefault"),
  });

  if (!parsed.success) {
    redirectWithNotice(redirectTo, "error", firstIssueMessage(parsed.error));
  }

  let amountMinor: bigint;
  try {
    amountMinor = parseMinorUnits(parsed.data.amount, parsed.data.currency);
  } catch (error) {
    redirectWithNotice(
      redirectTo,
      "error",
      error instanceof Error ? error.message : "Enter a valid plan amount.",
    );
  }

  try {
    await createOrUpdateMembershipPlan({
      planId: parsed.data.planId,
      name: parsed.data.name,
      description: parsed.data.description,
      amountMinor,
      currency: parsed.data.currency,
      billingInterval: parsed.data.billingInterval,
      intervalCount: parsed.data.intervalCount,
      isActive: parsed.data.isActive,
      isDefault: parsed.data.isDefault,
      createdById: user.id,
    });
  } catch (error) {
    redirectForBillingError(
      redirectTo,
      error,
      "Unable to save the membership plan.",
    );
  }

  redirectWithNotice(redirectTo, "success", "Membership plan saved.");
}

export async function assignMembershipPlanAction(formData: FormData) {
  const redirectTo = resolveReturnPath(formData, "/admin/billing");
  const { user } = await requireBillingAdmin(redirectTo);
  const parsed = assignPlanSchema.safeParse({
    membershipId: getString(formData, "membershipId"),
    planId: getString(formData, "planId"),
  });

  if (!parsed.success) {
    redirectWithNotice(redirectTo, "error", firstIssueMessage(parsed.error));
  }

  try {
    await assignPlanToMembership({
      membershipId: parsed.data.membershipId,
      planId: parsed.data.planId,
      assignedById: user.id,
    });
  } catch (error) {
    redirectForBillingError(redirectTo, error, "Unable to assign the plan.");
  }

  redirectWithNotice(redirectTo, "success", "Membership plan assigned.");
}

export async function createMembershipInvoiceAction(formData: FormData) {
  const redirectTo = resolveReturnPath(formData, "/admin/billing");
  const { user } = await requireBillingAdmin(redirectTo);
  const parsed = createInvoiceSchema.safeParse({
    membershipId: getString(formData, "membershipId"),
    subscriptionId: getOptionalString(formData, "subscriptionId"),
  });

  if (!parsed.success) {
    redirectWithNotice(redirectTo, "error", firstIssueMessage(parsed.error));
  }

  try {
    await createInvoiceForMembershipCurrentPeriod({
      membershipId: parsed.data.membershipId,
      createdById: user.id,
    });
  } catch (error) {
    redirectForBillingError(redirectTo, error, "Unable to create the invoice.");
  }

  redirectWithNotice(redirectTo, "success", "Invoice created.");
}

export async function recordMembershipPaymentAction(formData: FormData) {
  const redirectTo = resolveReturnPath(formData, "/admin/billing");
  const { user } = await requireBillingAdmin(redirectTo);
  const parsed = recordPaymentSchema.safeParse({
    membershipId: getString(formData, "membershipId"),
    invoiceId: getOptionalString(formData, "invoiceId"),
    amount: getOptionalString(formData, "amount"),
    method: getString(formData, "method"),
    paidAt: getOptionalString(formData, "paidAt"),
    externalReference: getOptionalString(formData, "externalReference"),
    notes: getOptionalString(formData, "notes"),
    idempotencyKey: getOptionalString(formData, "idempotencyKey"),
  });

  if (!parsed.success) {
    redirectWithNotice(redirectTo, "error", firstIssueMessage(parsed.error));
  }

  let amountMinor: bigint | undefined;

  if (parsed.data.amount) {
    try {
      amountMinor = parseMinorUnits(parsed.data.amount, "ZMW");
    } catch (error) {
      redirectWithNotice(
        redirectTo,
        "error",
        error instanceof Error ? error.message : "Enter a valid payment amount.",
      );
    }
  }

  try {
    await recordPayment({
      membershipId: parsed.data.membershipId,
      invoiceId: parsed.data.invoiceId,
      amountMinor,
      currency: "ZMW",
      method: parsed.data.method,
      paidAt: parseOptionalDate(parsed.data.paidAt),
      externalReference: parsed.data.externalReference,
      notes: parsed.data.notes,
      recordedById: user.id,
      idempotencyKey: parsed.data.idempotencyKey,
    });
  } catch (error) {
    redirectForBillingError(redirectTo, error, "Unable to record the payment.");
  }

  redirectWithNotice(
    redirectTo,
    "success",
    "Payment recorded and awaiting confirmation.",
  );
}

export async function confirmMembershipPaymentAction(formData: FormData) {
  const redirectTo = resolveReturnPath(formData, "/admin/billing");
  const { user } = await requireBillingAdmin(redirectTo);
  const parsed = confirmPaymentSchema.safeParse({
    paymentId: getString(formData, "paymentId"),
  });

  if (!parsed.success) {
    redirectWithNotice(redirectTo, "error", firstIssueMessage(parsed.error));
  }

  try {
    await confirmPayment({
      paymentId: parsed.data.paymentId,
      confirmedById: user.id,
    });
  } catch (error) {
    redirectForBillingError(redirectTo, error, "Unable to confirm the payment.");
  }

  redirectWithNotice(redirectTo, "success", "Payment confirmed.");
}

export async function voidMembershipInvoiceAction(formData: FormData) {
  const redirectTo = resolveReturnPath(formData, "/admin/billing");
  const { user } = await requireBillingAdmin(redirectTo);
  const parsed = voidInvoiceSchema.safeParse({
    invoiceId: getString(formData, "invoiceId"),
  });

  if (!parsed.success) {
    redirectWithNotice(redirectTo, "error", firstIssueMessage(parsed.error));
  }

  try {
    await voidInvoice({
      invoiceId: parsed.data.invoiceId,
      voidedById: user.id,
    });
  } catch (error) {
    redirectForBillingError(redirectTo, error, "Unable to void the invoice.");
  }

  redirectWithNotice(redirectTo, "success", "Invoice voided.");
}

export async function updateSubscriptionStateAction(formData: FormData) {
  const redirectTo = resolveReturnPath(formData, "/admin/billing");
  const { user } = await requireBillingAdmin(redirectTo);
  const parsed = subscriptionUpdateSchema.safeParse({
    subscriptionId: getString(formData, "subscriptionId"),
    action: getString(formData, "action"),
    reason: getOptionalString(formData, "reason"),
  });

  if (!parsed.success) {
    redirectWithNotice(redirectTo, "error", firstIssueMessage(parsed.error));
  }

  try {
    await updateSubscriptionState({
      subscriptionId: parsed.data.subscriptionId,
      action: parsed.data.action,
      reason: parsed.data.reason,
      actorId: user.id,
    });
  } catch (error) {
    redirectForBillingError(
      redirectTo,
      error,
      "Unable to update the subscription.",
    );
  }

  redirectWithNotice(redirectTo, "success", "Subscription updated.");
}
