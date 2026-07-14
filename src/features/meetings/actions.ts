"use server";

import { AttendanceStatus, RsvpStatus } from "@prisma/client";

import { meetingSchema } from "@/features/meetings/schemas";
import { notifyActiveMembersForMeetingUpdate } from "@/features/notifications/service";
import { combineDateAndTime } from "@/lib/date";
import { db } from "@/lib/db";
import { getOptionalString, getString } from "@/lib/form-data";
import { redirectWithNotice, resolveReturnPath } from "@/lib/navigation";
import {
  canModerateClub,
  canParticipateInClub,
} from "@/lib/permissions";
import { requireMembershipContext, requireSessionUser } from "@/lib/session";

export async function createMeetingAction(formData: FormData) {
  const redirectTo = resolveReturnPath(formData, "/meetings");
  const { user, membership } = await requireMembershipContext();

  if (!canModerateClub(user, membership)) {
    redirectWithNotice(
      redirectTo,
      "error",
      "You do not have permission to schedule meetings.",
    );
  }

  const parsed = meetingSchema.safeParse({
    title: getString(formData, "title"),
    agenda: getOptionalString(formData, "agenda"),
    date: getString(formData, "date"),
    time: getString(formData, "time"),
    location: getOptionalString(formData, "location"),
    meetingLink: getOptionalString(formData, "meetingLink"),
  });

  if (!parsed.success) {
    redirectWithNotice(
      redirectTo,
      "error",
      parsed.error.issues[0]?.message ?? "Unable to create the meeting.",
    );
  }

  const startsAt = combineDateAndTime(parsed.data.date, parsed.data.time);

  await db.$transaction(async (tx) => {
    const meeting = await tx.meeting.create({
      data: {
        createdById: user.id,
        title: parsed.data.title,
        agenda: parsed.data.agenda,
        startsAt,
        location: parsed.data.location,
        meetingLink: parsed.data.meetingLink,
      },
      select: {
        id: true,
      },
    });

    await notifyActiveMembersForMeetingUpdate(tx, {
      meetingId: meeting.id,
      actorId: user.id,
      title: parsed.data.title,
      startsAt,
      location: parsed.data.location,
      revisionKey: "created",
    });
  });

  redirectWithNotice(
    redirectTo,
    "success",
    "Meeting scheduled.",
  );
}

export async function updateMeetingRsvpAction(formData: FormData) {
  const meetingId = getString(formData, "meetingId");
  const redirectTo = resolveReturnPath(formData, "/meetings");
  const user = await requireSessionUser();
  const { membership } = await requireMembershipContext();
  const status = getString(formData, "status");
  const meeting = await db.meeting.findUnique({
    where: { id: meetingId },
  });

  if (!meeting) {
    redirectWithNotice(redirectTo, "error", "Meeting not found.");
  }

  if (!canParticipateInClub(user, membership)) {
    redirectWithNotice(
      redirectTo,
      "error",
      "You do not have access to RSVP for this meeting.",
    );
  }

  await db.meetingRsvp.upsert({
    where: {
      meetingId_memberId: {
        meetingId,
        memberId: user.id,
      },
    },
    update: {
      status: status as RsvpStatus,
    },
    create: {
      meetingId,
      memberId: user.id,
      status: status as RsvpStatus,
    },
  });

  redirectWithNotice(redirectTo, "success", "RSVP updated.");
}

export async function updateMeetingAttendanceAction(formData: FormData) {
  const meetingId = getString(formData, "meetingId");
  const memberId = getString(formData, "memberId");
  const status = getString(formData, "status");
  const redirectTo = resolveReturnPath(formData, "/meetings");
  const { user, membership } = await requireMembershipContext();
  const meeting = await db.meeting.findUnique({
    where: { id: meetingId },
  });

  if (!meeting) {
    redirectWithNotice(redirectTo, "error", "Meeting not found.");
  }

  if (!canModerateClub(user, membership)) {
    redirectWithNotice(
      redirectTo,
      "error",
      "You do not have permission to record attendance.",
    );
  }

  await db.meetingAttendance.upsert({
    where: {
      meetingId_memberId: {
        meetingId,
        memberId,
      },
    },
    update: {
      status: status as AttendanceStatus,
      recordedById: user.id,
    },
    create: {
      meetingId,
      memberId,
      status: status as AttendanceStatus,
      recordedById: user.id,
    },
  });

  redirectWithNotice(
    redirectTo,
    "success",
    "Attendance updated.",
  );
}

export async function updateMeetingNotesAction(formData: FormData) {
  const meetingId = getString(formData, "meetingId");
  const notes = getOptionalString(formData, "notes");
  const redirectTo = resolveReturnPath(formData, "/meetings");
  const { user, membership } = await requireMembershipContext();
  const meeting = await db.meeting.findUnique({
    where: { id: meetingId },
  });

  if (!meeting) {
    redirectWithNotice(redirectTo, "error", "Meeting not found.");
  }

  if (!canModerateClub(user, membership)) {
    redirectWithNotice(
      redirectTo,
      "error",
      "You do not have permission to update meeting notes.",
    );
  }

  await db.meeting.update({
    where: { id: meetingId },
    data: {
      notes,
    },
  });

  redirectWithNotice(
    redirectTo,
    "success",
    "Meeting notes saved.",
  );
}
