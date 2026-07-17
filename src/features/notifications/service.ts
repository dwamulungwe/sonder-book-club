import {
  EmailDeliveryClass,
  MembershipStatus,
  NotificationType,
  Prisma,
  SystemRole,
} from "@prisma/client";

import {
  renderEmailTemplate,
  type EmailTemplateData,
  type EmailTemplateKey,
} from "@/features/email/templates";
import { isValidEmailAddress } from "@/features/email/server-config";
import { sanitizeInternalHref } from "@/features/notifications/links";

const ACTIVE_MEMBER_NOTIFICATION_BATCH_SIZE = 100;

export type NotificationPreferenceKind =
  | "application"
  | "community"
  | "announcement"
  | "meeting"
  | "billing";

export type DeliveryPolicy = "optional" | "transactional" | "none";

type RecipientSnapshot = {
  id: string;
  email?: string | null;
  name?: string | null;
  notificationPreference?: Partial<NotificationPreferenceSnapshot> | null;
};

type ActorSnapshot = {
  id: string;
  name?: string | null;
};

export type NotificationPreferenceSnapshot = {
  inAppCommunityActivity: boolean;
  inAppAnnouncements: boolean;
  inAppApplicationUpdates: boolean;
  inAppBillingUpdates: boolean;
  emailCommunityActivity: boolean;
  emailAnnouncements: boolean;
  emailApplicationUpdates: boolean;
  emailMeetingUpdates: boolean;
  emailBillingUpdates: boolean;
};

type NotificationEmailInput = {
  templateKey: EmailTemplateKey;
  data: EmailTemplateData;
  dedupeKey: string;
  delivery: DeliveryPolicy;
  toEmail?: string | null;
};

type CreateNotificationInput = {
  recipient: RecipientSnapshot;
  actorId?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  href?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  dedupeKey?: string | null;
  preference: NotificationPreferenceKind;
  inAppDelivery?: DeliveryPolicy;
  suppressSelf?: boolean;
  email?: NotificationEmailInput;
};

const DEFAULT_PREFERENCES: NotificationPreferenceSnapshot = {
  inAppCommunityActivity: true,
  inAppAnnouncements: true,
  inAppApplicationUpdates: true,
  inAppBillingUpdates: true,
  emailCommunityActivity: false,
  emailAnnouncements: false,
  emailApplicationUpdates: true,
  emailMeetingUpdates: false,
  emailBillingUpdates: true,
};

function keyPart(value: string | null | undefined) {
  return (value ?? "none").replace(/[^a-zA-Z0-9_.-]/g, "_");
}

export function notificationDedupeKey(...parts: string[]) {
  return parts.map(keyPart).join(":").slice(0, 240);
}

function preferenceWithDefaults(
  preference: Partial<NotificationPreferenceSnapshot> | null | undefined,
): NotificationPreferenceSnapshot {
  return {
    ...DEFAULT_PREFERENCES,
    ...preference,
  };
}

async function getPreference(
  tx: Prisma.TransactionClient,
  recipient: RecipientSnapshot,
) {
  if (recipient.notificationPreference) {
    return preferenceWithDefaults(recipient.notificationPreference);
  }

  const preference = await tx.notificationPreference.findUnique({
    where: {
      userId: recipient.id,
    },
  });

  return preferenceWithDefaults(preference);
}

function shouldCreateInApp(
  preference: NotificationPreferenceSnapshot,
  kind: NotificationPreferenceKind,
  delivery: DeliveryPolicy,
) {
  if (delivery === "none") {
    return false;
  }

  if (delivery === "transactional") {
    return true;
  }

  if (kind === "application") {
    return preference.inAppApplicationUpdates;
  }

  if (kind === "community") {
    return preference.inAppCommunityActivity;
  }

  if (kind === "announcement") {
    return preference.inAppAnnouncements;
  }

  if (kind === "billing") {
    return preference.inAppBillingUpdates;
  }

  return true;
}

export function shouldQueueEmail(
  preference: NotificationPreferenceSnapshot,
  kind: NotificationPreferenceKind,
  delivery: DeliveryPolicy,
) {
  if (delivery === "none") {
    return false;
  }

  if (delivery === "transactional") {
    return true;
  }

  if (kind === "application") {
    return preference.emailApplicationUpdates;
  }

  if (kind === "community") {
    return preference.emailCommunityActivity;
  }

  if (kind === "announcement") {
    return preference.emailAnnouncements;
  }

  if (kind === "billing") {
    return preference.emailBillingUpdates;
  }

  return preference.emailMeetingUpdates;
}

async function resolveRecipientEmail(
  tx: Prisma.TransactionClient,
  recipient: RecipientSnapshot,
  override: string | null | undefined,
) {
  const user = await tx.user.findUnique({
    where: {
      id: recipient.id,
    },
    select: {
      email: true,
      deletedAt: true,
    },
  });

  if (!user || user.deletedAt) {
    return null;
  }

  const email = (override ?? recipient.email ?? user.email)?.trim();
  return email && isValidEmailAddress(email) ? email : null;
}

function outboxPayload(
  rendered: ReturnType<typeof renderEmailTemplate>,
): Prisma.InputJsonValue {
  return {
    textBody: rendered.textBody,
    htmlBody: rendered.htmlBody,
    ...rendered.payload,
  };
}

async function queueEmailOutbox(
  tx: Prisma.TransactionClient,
  recipient: RecipientSnapshot,
  input: NotificationEmailInput,
) {
  const toEmail = await resolveRecipientEmail(tx, recipient, input.toEmail);

  if (!toEmail) {
    return null;
  }

  const normalizedToEmail = toEmail.toLowerCase();
  const suppression = await tx.emailSuppression.findUnique({
    where: {
      normalizedEmail: normalizedToEmail,
    },
    select: {
      active: true,
    },
  });

  if (suppression?.active) {
    return null;
  }

  const rendered = renderEmailTemplate(input.templateKey, {
    recipientName: recipient.name,
    ...input.data,
  });

  return tx.emailOutbox.upsert({
    where: {
      dedupeKey: input.dedupeKey,
    },
    create: {
      recipientUserId: recipient.id,
      toEmail,
      normalizedToEmail,
      templateKey: rendered.templateKey,
      templateVersion: rendered.templateVersion,
      subject: rendered.subject,
      textBody: rendered.textBody,
      htmlBody: rendered.htmlBody,
      payload: outboxPayload(rendered),
      deliveryClass:
        input.delivery === "transactional"
          ? EmailDeliveryClass.TRANSACTIONAL
          : EmailDeliveryClass.PREFERENCE_CONTROLLED,
      dedupeKey: input.dedupeKey,
    },
    update: {},
  });
}

export async function createNotification(
  tx: Prisma.TransactionClient,
  input: CreateNotificationInput,
) {
  if (
    input.suppressSelf &&
    input.actorId &&
    input.actorId === input.recipient.id
  ) {
    return null;
  }

  const preference = await getPreference(tx, input.recipient);
  const safeHref = sanitizeInternalHref(input.href);
  const inAppDelivery = input.inAppDelivery ?? "optional";

  let notification = null;

  if (shouldCreateInApp(preference, input.preference, inAppDelivery)) {
    const data = {
      recipientId: input.recipient.id,
      actorId: input.actorId,
      type: input.type,
      title: input.title,
      message: input.message,
      href: safeHref,
      entityType: input.entityType,
      entityId: input.entityId,
      dedupeKey: input.dedupeKey,
    };

    notification = input.dedupeKey
      ? await tx.notification.upsert({
          where: {
            dedupeKey: input.dedupeKey,
          },
          create: data,
          update: {},
        })
      : await tx.notification.create({
          data,
        });
  }

  if (
    input.email &&
    shouldQueueEmail(preference, input.preference, input.email.delivery)
  ) {
    await queueEmailOutbox(tx, input.recipient, input.email);
  }

  return notification;
}

export async function createNotifications(
  tx: Prisma.TransactionClient,
  inputs: CreateNotificationInput[],
) {
  const notifications = [];

  for (const input of inputs) {
    notifications.push(await createNotification(tx, input));
  }

  return notifications;
}

export async function notifyApplicationSubmitted(
  tx: Prisma.TransactionClient,
  input: {
    applicationId: string;
    recipient: RecipientSnapshot;
  },
) {
  const href = "/application-status";

  return createNotification(tx, {
    recipient: input.recipient,
    type: NotificationType.APPLICATION_SUBMITTED,
    title: "Application received",
    message: "Sonder received your application and will review it with care.",
    href,
    entityType: "membership_application",
    entityId: input.applicationId,
    dedupeKey: notificationDedupeKey(
      "notification",
      "application_submitted",
      input.applicationId,
      input.recipient.id,
    ),
    preference: "application",
    inAppDelivery: "transactional",
    email: {
      templateKey: "application_received",
      data: {
        statusHref: href,
      },
      dedupeKey: notificationDedupeKey(
        "email",
        "application_received",
        input.applicationId,
        input.recipient.id,
      ),
      delivery: "transactional",
    },
  });
}

export async function notifyApplicationStatusChanged(
  tx: Prisma.TransactionClient,
  input: {
    applicationId: string;
    recipient: RecipientSnapshot;
    status:
      | "under_review"
      | "approved"
      | "rejected"
      | "waitlisted";
  },
) {
  const href = input.status === "approved" ? "/community" : "/application-status";
  const statusMap = {
    under_review: {
      type: NotificationType.APPLICATION_UNDER_REVIEW,
      title: "Application under review",
      message: "Your Sonder application is now under review.",
      templateKey: "application_under_review" as const,
    },
    approved: {
      type: NotificationType.APPLICATION_APPROVED,
      title: "Welcome to Sonder",
      message: "Your membership has been approved. Welcome to Sonder.",
      templateKey: "application_approved" as const,
    },
    rejected: {
      type: NotificationType.APPLICATION_REJECTED,
      title: "Application reviewed",
      message: "Your Sonder application has been reviewed.",
      templateKey: "application_rejected" as const,
    },
    waitlisted: {
      type: NotificationType.APPLICATION_WAITLISTED,
      title: "Application waitlisted",
      message: "Your application is still active and has been placed on the waitlist.",
      templateKey: "application_waitlisted" as const,
    },
  }[input.status];

  return createNotification(tx, {
    recipient: input.recipient,
    type: statusMap.type,
    title: statusMap.title,
    message: statusMap.message,
    href,
    entityType: "membership_application",
    entityId: input.applicationId,
    dedupeKey: notificationDedupeKey(
      "notification",
      input.status,
      input.applicationId,
      input.recipient.id,
    ),
    preference: "application",
    inAppDelivery: "transactional",
    email: {
      templateKey: statusMap.templateKey,
      data: {
        statusHref: "/application-status",
        profileHref: "/profile",
        communityHref: "/community",
      },
      dedupeKey: notificationDedupeKey(
        "email",
        input.status,
        input.applicationId,
        input.recipient.id,
      ),
      delivery: "transactional",
    },
  });
}

export async function notifyCommunityComment(
  tx: Prisma.TransactionClient,
  input: {
    postId: string;
    commentId: string;
    recipient: RecipientSnapshot;
    actor: ActorSnapshot;
  },
) {
  const href = "/community";

  return createNotification(tx, {
    recipient: input.recipient,
    actorId: input.actor.id,
    type: NotificationType.COMMUNITY_COMMENT,
    title: "New comment",
    message: `${input.actor.name ?? "A member"} commented on your community post.`,
    href,
    entityType: "post_comment",
    entityId: input.commentId,
    dedupeKey: notificationDedupeKey(
      "notification",
      "community_comment",
      input.commentId,
      input.recipient.id,
    ),
    preference: "community",
    suppressSelf: true,
    email: {
      templateKey: "community_comment",
      data: {
        actorName: input.actor.name,
        communityHref: href,
      },
      dedupeKey: notificationDedupeKey(
        "email",
        "community_comment",
        input.commentId,
        input.recipient.id,
      ),
      delivery: "optional",
    },
  });
}

export async function notifyCommunityReply(
  tx: Prisma.TransactionClient,
  input: {
    postId: string;
    commentId: string;
    parentCommentId: string;
    recipient: RecipientSnapshot;
    actor: ActorSnapshot;
  },
) {
  const href = "/community";

  return createNotification(tx, {
    recipient: input.recipient,
    actorId: input.actor.id,
    type: NotificationType.COMMUNITY_REPLY,
    title: "New reply",
    message: `${input.actor.name ?? "A member"} replied to your comment.`,
    href,
    entityType: "post_comment",
    entityId: input.commentId,
    dedupeKey: notificationDedupeKey(
      "notification",
      "community_reply",
      input.parentCommentId,
      input.commentId,
      input.recipient.id,
    ),
    preference: "community",
    suppressSelf: true,
    email: {
      templateKey: "community_reply",
      data: {
        actorName: input.actor.name,
        communityHref: href,
      },
      dedupeKey: notificationDedupeKey(
        "email",
        "community_reply",
        input.parentCommentId,
        input.commentId,
        input.recipient.id,
      ),
      delivery: "optional",
    },
  });
}

export async function notifyCommunityReaction(
  tx: Prisma.TransactionClient,
  input: {
    postId: string;
    recipient: RecipientSnapshot;
    actor: ActorSnapshot;
  },
) {
  const href = "/community";

  return createNotification(tx, {
    recipient: input.recipient,
    actorId: input.actor.id,
    type: NotificationType.COMMUNITY_REACTION,
    title: "New reaction",
    message: `${input.actor.name ?? "A member"} reacted to your community post.`,
    href,
    entityType: "community_post",
    entityId: input.postId,
    dedupeKey: notificationDedupeKey(
      "notification",
      "community_reaction",
      input.postId,
      input.actor.id,
      input.recipient.id,
    ),
    preference: "community",
    suppressSelf: true,
  });
}

async function getActiveNotificationRecipients(
  tx: Prisma.TransactionClient,
  actorId: string | null | undefined,
  cursor?: {
    joinedAt: Date;
    id: string;
  },
) {
  return tx.membership.findMany({
    where: {
      status: MembershipStatus.ACTIVE,
      role: {
        not: SystemRole.GUEST,
      },
      ...(actorId ? { userId: { not: actorId } } : {}),
      user: {
        deletedAt: null,
      },
      ...(cursor
        ? {
            OR: [
              {
                joinedAt: {
                  gt: cursor.joinedAt,
                },
              },
              {
                joinedAt: cursor.joinedAt,
                id: {
                  gt: cursor.id,
                },
              },
            ],
          }
        : {}),
    },
    include: {
      user: {
        include: {
          notificationPreference: true,
        },
      },
    },
    orderBy: [
      {
        joinedAt: "asc",
      },
      {
        id: "asc",
      },
    ],
    take: ACTIVE_MEMBER_NOTIFICATION_BATCH_SIZE,
  });
}

async function notifyActiveMemberBatches(
  tx: Prisma.TransactionClient,
  actorId: string,
  createInputs: (
    recipients: Awaited<ReturnType<typeof getActiveNotificationRecipients>>,
  ) => CreateNotificationInput[],
) {
  let cursor:
    | {
        joinedAt: Date;
        id: string;
      }
    | undefined;
  let recipientCount = 0;
  let batchCount = 0;

  // Future background delivery can resume from this joinedAt/id cursor.
  for (;;) {
    const recipients = await getActiveNotificationRecipients(tx, actorId, cursor);

    if (recipients.length === 0) {
      break;
    }

    batchCount += 1;
    recipientCount += recipients.length;
    await createNotifications(tx, createInputs(recipients));

    const lastRecipient = recipients[recipients.length - 1];
    cursor = {
      joinedAt: lastRecipient.joinedAt,
      id: lastRecipient.id,
    };
  }

  return {
    batchCount,
    recipientCount,
  };
}

export async function notifyActiveMembersForAnnouncement(
  tx: Prisma.TransactionClient,
  input: {
    announcementId: string;
    actorId: string;
    title: string;
    body: string;
  },
) {
  const href = "/announcements";

  return notifyActiveMemberBatches(
    tx,
    input.actorId,
    (recipients) =>
      recipients.map(({ user }) => ({
        recipient: user,
        actorId: input.actorId,
        type: NotificationType.ANNOUNCEMENT_PUBLISHED,
        title: "New announcement",
        message: `New Sonder announcement: ${input.title}`,
        href,
        entityType: "announcement",
        entityId: input.announcementId,
        dedupeKey: notificationDedupeKey(
          "notification",
          "announcement",
          input.announcementId,
          user.id,
        ),
        preference: "announcement" as const,
        email: {
          templateKey: "announcement_published" as const,
          data: {
            announcementTitle: input.title,
            announcementBody: input.body,
            announcementHref: href,
          },
          dedupeKey: notificationDedupeKey(
            "email",
            "announcement",
            input.announcementId,
            user.id,
          ),
          delivery: "optional" as const,
        },
      })),
  );
}

export async function notifyActiveMembersForMeetingUpdate(
  tx: Prisma.TransactionClient,
  input: {
    meetingId: string;
    actorId: string;
    title: string;
    startsAt: Date;
    location?: string | null;
    revisionKey: string;
  },
) {
  const href = "/meetings";

  return notifyActiveMemberBatches(
    tx,
    input.actorId,
    (recipients) =>
      recipients.map(({ user }) => ({
        recipient: user,
        actorId: input.actorId,
        type: NotificationType.MEETING_UPDATED,
        title: "Meeting update",
        message: `There is a Sonder meeting update for ${input.title}.`,
        href,
        entityType: "meeting",
        entityId: input.meetingId,
        dedupeKey: notificationDedupeKey(
          "notification",
          "meeting",
          input.meetingId,
          input.revisionKey,
          user.id,
        ),
        preference: "meeting" as const,
        email: {
          templateKey: "meeting_updated" as const,
          data: {
            meetingTitle: input.title,
            meetingStartsAt: input.startsAt,
            meetingLocation: input.location,
            meetingHref: href,
          },
          dedupeKey: notificationDedupeKey(
            "email",
            "meeting",
            input.meetingId,
            input.revisionKey,
            user.id,
          ),
          delivery: "optional" as const,
        },
      })),
  );
}

export async function notifyInvoiceCreated(
  tx: Prisma.TransactionClient,
  input: {
    invoiceId: string;
    invoiceNumber: string;
    recipient: RecipientSnapshot;
    amountFormatted: string;
  },
) {
  const href = "/membership/billing";

  return createNotification(tx, {
    recipient: input.recipient,
    type: NotificationType.INVOICE_CREATED,
    title: "Invoice created",
    message: `A membership invoice for ${input.amountFormatted} is ready.`,
    href,
    entityType: "membership_invoice",
    entityId: input.invoiceId,
    dedupeKey: notificationDedupeKey(
      "notification",
      "invoice_created",
      input.invoiceId,
      input.recipient.id,
    ),
    preference: "billing",
    inAppDelivery: "transactional",
    email: {
      templateKey: "invoice_created",
      data: {
        billingHref: href,
        invoiceNumber: input.invoiceNumber,
        amountFormatted: input.amountFormatted,
      },
      dedupeKey: notificationDedupeKey(
        "email",
        "invoice_created",
        input.invoiceId,
        input.recipient.id,
      ),
      delivery: "transactional",
    },
  });
}

export async function notifyPaymentRecorded(
  tx: Prisma.TransactionClient,
  input: {
    paymentId: string;
    recipient: RecipientSnapshot;
    amountFormatted: string;
    invoiceNumber?: string | null;
    paymentReference: string;
  },
) {
  const href = "/membership/billing";

  return createNotification(tx, {
    recipient: input.recipient,
    type: NotificationType.PAYMENT_RECORDED,
    title: "Payment recorded",
    message: `A ${input.amountFormatted} membership payment was recorded and is awaiting confirmation.`,
    href,
    entityType: "membership_payment",
    entityId: input.paymentId,
    dedupeKey: notificationDedupeKey(
      "notification",
      "payment_recorded",
      input.paymentId,
      input.recipient.id,
    ),
    preference: "billing",
    inAppDelivery: "transactional",
    email: {
      templateKey: "payment_recorded",
      data: {
        billingHref: href,
        invoiceNumber: input.invoiceNumber,
        amountFormatted: input.amountFormatted,
        paymentReference: input.paymentReference,
      },
      dedupeKey: notificationDedupeKey(
        "email",
        "payment_recorded",
        input.paymentId,
        input.recipient.id,
      ),
      delivery: "transactional",
    },
  });
}

export async function notifyPaymentConfirmed(
  tx: Prisma.TransactionClient,
  input: {
    paymentId: string;
    recipient: RecipientSnapshot;
    actorId?: string | null;
    amountFormatted: string;
    invoiceNumber?: string | null;
    paymentReference: string;
  },
) {
  const href = "/membership/billing";

  return createNotification(tx, {
    recipient: input.recipient,
    actorId: input.actorId,
    type: NotificationType.PAYMENT_CONFIRMED,
    title: "Payment confirmed",
    message: `Your ${input.amountFormatted} membership payment has been confirmed.`,
    href,
    entityType: "membership_payment",
    entityId: input.paymentId,
    dedupeKey: notificationDedupeKey(
      "notification",
      "payment_confirmed",
      input.paymentId,
      input.recipient.id,
    ),
    preference: "billing",
    inAppDelivery: "transactional",
    email: {
      templateKey: "payment_confirmed",
      data: {
        billingHref: href,
        invoiceNumber: input.invoiceNumber,
        amountFormatted: input.amountFormatted,
        paymentReference: input.paymentReference,
      },
      dedupeKey: notificationDedupeKey(
        "email",
        "payment_confirmed",
        input.paymentId,
        input.recipient.id,
      ),
      delivery: "transactional",
    },
  });
}

export async function notifyPaymentFailed(
  tx: Prisma.TransactionClient,
  input: {
    paymentId: string;
    recipient: RecipientSnapshot;
    actorId?: string | null;
    amountFormatted: string;
    invoiceNumber?: string | null;
  },
) {
  const href = "/membership/billing";

  return createNotification(tx, {
    recipient: input.recipient,
    actorId: input.actorId,
    type: NotificationType.PAYMENT_FAILED,
    title: "Payment could not be confirmed",
    message: `A ${input.amountFormatted} membership payment could not be confirmed.`,
    href,
    entityType: "membership_payment",
    entityId: input.paymentId,
    dedupeKey: notificationDedupeKey(
      "notification",
      "payment_failed",
      input.paymentId,
      input.recipient.id,
    ),
    preference: "billing",
    inAppDelivery: "transactional",
    email: {
      templateKey: "payment_failed",
      data: {
        billingHref: href,
        invoiceNumber: input.invoiceNumber,
        amountFormatted: input.amountFormatted,
      },
      dedupeKey: notificationDedupeKey(
        "email",
        "payment_failed",
        input.paymentId,
        input.recipient.id,
      ),
      delivery: "transactional",
    },
  });
}

export async function notifyOnlinePaymentReviewRequired(
  tx: Prisma.TransactionClient,
  input: {
    attemptId: string;
    invoiceId: string;
    sonderReference: string;
    reason: string;
  },
) {
  const admins = await tx.membership.findMany({
    where: {
      status: MembershipStatus.ACTIVE,
      OR: [
        {
          role: SystemRole.ADMIN,
        },
        {
          user: {
            systemRole: SystemRole.ADMIN,
          },
        },
      ],
      user: {
        deletedAt: null,
      },
    },
    include: {
      user: {
        include: {
          notificationPreference: true,
        },
      },
    },
    take: ACTIVE_MEMBER_NOTIFICATION_BATCH_SIZE,
  });

  return createNotifications(
    tx,
    admins.map(({ user }) => ({
      recipient: user,
      type: NotificationType.ONLINE_PAYMENT_REVIEW_REQUIRED,
      title: "Online payment needs review",
      message: `Flutterwave payment ${input.sonderReference} requires admin review.`,
      href: "/admin/billing",
      entityType: "online_payment_attempt",
      entityId: input.attemptId,
      dedupeKey: notificationDedupeKey(
        "notification",
        "online_payment_review",
        input.attemptId,
        input.reason,
        user.id,
      ),
      preference: "billing" as const,
      inAppDelivery: "transactional" as const,
    })),
  );
}

export async function notifySubscriptionPastDue(
  tx: Prisma.TransactionClient,
  input: {
    subscriptionId: string;
    recipient: RecipientSnapshot;
  },
) {
  const href = "/membership/billing";

  return createNotification(tx, {
    recipient: input.recipient,
    type: NotificationType.SUBSCRIPTION_PAST_DUE,
    title: "Subscription past due",
    message: "Your Sonder membership has an overdue invoice.",
    href,
    entityType: "member_subscription",
    entityId: input.subscriptionId,
    dedupeKey: notificationDedupeKey(
      "notification",
      "subscription_past_due",
      input.subscriptionId,
      input.recipient.id,
    ),
    preference: "billing",
    inAppDelivery: "transactional",
    email: {
      templateKey: "subscription_past_due",
      data: {
        billingHref: href,
      },
      dedupeKey: notificationDedupeKey(
        "email",
        "subscription_past_due",
        input.subscriptionId,
        input.recipient.id,
      ),
      delivery: "transactional",
    },
  });
}

export async function notifySubscriptionWaived(
  tx: Prisma.TransactionClient,
  input: {
    subscriptionId: string;
    recipient: RecipientSnapshot;
    actorId?: string | null;
    planName: string;
  },
) {
  const href = "/membership/billing";

  return createNotification(tx, {
    recipient: input.recipient,
    actorId: input.actorId,
    type: NotificationType.SUBSCRIPTION_WAIVED,
    title: "Subscription waived",
    message: `Your ${input.planName} membership dues are waived.`,
    href,
    entityType: "member_subscription",
    entityId: input.subscriptionId,
    dedupeKey: notificationDedupeKey(
      "notification",
      "subscription_waived",
      input.subscriptionId,
      input.recipient.id,
    ),
    preference: "billing",
    inAppDelivery: "transactional",
    email: {
      templateKey: "subscription_waived",
      data: {
        billingHref: href,
        planName: input.planName,
      },
      dedupeKey: notificationDedupeKey(
        "email",
        "subscription_waived",
        input.subscriptionId,
        input.recipient.id,
      ),
      delivery: "transactional",
    },
  });
}
