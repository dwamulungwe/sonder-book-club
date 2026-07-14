"use server";

import { EmailOutboxStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { getString } from "@/lib/form-data";
import { redirectWithNotice, resolveReturnPath } from "@/lib/navigation";
import { requireEmailOutboxAdmin } from "@/features/email/outbox-permissions";

export async function retryFailedEmailAction(formData: FormData) {
  const redirectTo = resolveReturnPath(formData, "/admin/email-outbox");
  const emailId = getString(formData, "emailId");
  await requireEmailOutboxAdmin(redirectTo);

  const updated = await db.emailOutbox.updateMany({
    where: {
      id: emailId,
      status: EmailOutboxStatus.FAILED,
    },
    data: {
      status: EmailOutboxStatus.PENDING,
      attempts: 0,
      nextAttemptAt: null,
      processingStartedAt: null,
      lastError: null,
    },
  });

  if (updated.count !== 1) {
    redirectWithNotice(
      redirectTo,
      "error",
      "Only failed emails can be returned to pending.",
    );
  }

  redirectWithNotice(redirectTo, "success", "Email returned to pending.");
}

export async function cancelEmailAction(formData: FormData) {
  const redirectTo = resolveReturnPath(formData, "/admin/email-outbox");
  const emailId = getString(formData, "emailId");
  await requireEmailOutboxAdmin(redirectTo);

  const updated = await db.emailOutbox.updateMany({
    where: {
      id: emailId,
      status: {
        in: [EmailOutboxStatus.PENDING, EmailOutboxStatus.FAILED],
      },
    },
    data: {
      status: EmailOutboxStatus.CANCELLED,
      nextAttemptAt: null,
      processingStartedAt: null,
    },
  });

  if (updated.count !== 1) {
    redirectWithNotice(
      redirectTo,
      "error",
      "Only pending or failed emails can be cancelled.",
    );
  }

  redirectWithNotice(redirectTo, "success", "Email cancelled.");
}
