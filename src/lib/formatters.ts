import {
  AttendanceStatus,
  BillingInterval,
  BookStatus,
  InvoiceStatus,
  MembershipApplicationStatus,
  MembershipStatus,
  PaymentMethod,
  PaymentStatus,
  PollStatus,
  RsvpStatus,
  SubscriptionStatus,
  SystemRole,
  TargetMode,
} from "@prisma/client";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatDate(value: Date | string) {
  return dateFormatter.format(new Date(value));
}

export function formatDateTime(value: Date | string) {
  return dateTimeFormatter.format(new Date(value));
}

export function formatRole(role: SystemRole) {
  return role.toLowerCase().replaceAll("_", " ");
}

export function formatMembershipStatus(status: MembershipStatus) {
  return status.toLowerCase();
}

export function formatMembershipApplicationStatus(
  status: MembershipApplicationStatus,
) {
  return status.toLowerCase().replaceAll("_", " ");
}

export function formatBookStatus(status: BookStatus) {
  return status.toLowerCase();
}

export function formatTargetMode(mode: TargetMode) {
  return mode.toLowerCase();
}

export function formatRsvpStatus(status: RsvpStatus) {
  return status.toLowerCase();
}

export function formatAttendanceStatus(status: AttendanceStatus) {
  return status.toLowerCase();
}

export function formatPollStatus(status: PollStatus) {
  return status.toLowerCase();
}

export function formatBillingInterval(interval: BillingInterval) {
  return interval.toLowerCase().replaceAll("_", " ");
}

export function formatSubscriptionStatus(status: SubscriptionStatus) {
  return status.toLowerCase().replaceAll("_", " ");
}

export function formatInvoiceStatus(status: InvoiceStatus) {
  return status.toLowerCase().replaceAll("_", " ");
}

export function formatPaymentStatus(status: PaymentStatus) {
  if (status === PaymentStatus.PAID) {
    return "confirmed";
  }

  return status.toLowerCase().replaceAll("_", " ");
}

export function formatPaymentMethod(method: PaymentMethod | null | undefined) {
  return method ? method.toLowerCase().replaceAll("_", " ") : "not recorded";
}
