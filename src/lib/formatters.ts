import {
  AttendanceStatus,
  BookStatus,
  MembershipStatus,
  PollStatus,
  RsvpStatus,
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
