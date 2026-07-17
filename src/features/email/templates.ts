import { formatDateTime } from "@/lib/formatters";
import { getTrustedAppBaseUrl } from "@/features/email/server-config";

export const EMAIL_TEMPLATE_VERSION = 1;

export type EmailTemplateKey =
  | "application_received"
  | "application_under_review"
  | "application_approved"
  | "application_rejected"
  | "application_waitlisted"
  | "community_comment"
  | "community_reply"
  | "announcement_published"
  | "meeting_updated"
  | "invoice_created"
  | "payment_recorded"
  | "payment_confirmed"
  | "payment_failed"
  | "subscription_past_due"
  | "subscription_waived";

export type EmailTemplateData = {
  recipientName?: string | null;
  actorName?: string | null;
  announcementTitle?: string | null;
  announcementBody?: string | null;
  meetingTitle?: string | null;
  meetingStartsAt?: Date | string | null;
  meetingLocation?: string | null;
  statusHref?: string | null;
  communityHref?: string | null;
  profileHref?: string | null;
  announcementHref?: string | null;
  meetingHref?: string | null;
  billingHref?: string | null;
  invoiceNumber?: string | null;
  amountFormatted?: string | null;
  paymentReference?: string | null;
  planName?: string | null;
};

export type RenderedEmailTemplate = {
  templateKey: EmailTemplateKey;
  templateVersion: number;
  subject: string;
  textBody: string;
  htmlBody: string;
  payload: Record<string, string | null>;
};

function cleanText(value: string | null | undefined, fallback = "") {
  return (value ?? fallback).replace(/\s+/g, " ").trim();
}

function truncate(value: string, length: number) {
  if (value.length <= length) {
    return value;
  }

  return `${value.slice(0, length - 1).trimEnd()}...`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function paragraphHtml(lines: string[]) {
  return lines
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

function trustedAppHref(value: string | null | undefined, fallbackPath: string) {
  const baseUrl = getTrustedAppBaseUrl();
  if (!baseUrl) {
    return null;
  }

  const path = cleanText(value, fallbackPath);
  const safePath = path.startsWith("/") && !path.startsWith("//") ? path : fallbackPath;

  try {
    const url = new URL(safePath, baseUrl);
    return url.origin === baseUrl.origin ? url.toString() : null;
  } catch {
    return null;
  }
}

function linkLine(label: string, href: string | null) {
  return href ? `${label}: ${href}` : `${label} in Sonder.`;
}

function greeting(name: string | null | undefined) {
  const cleaned = cleanText(name);
  return cleaned ? `Hi ${cleaned},` : "Hi,";
}

function render(
  templateKey: EmailTemplateKey,
  subject: string,
  lines: string[],
  payload: Record<string, string | null>,
): RenderedEmailTemplate {
  return {
    templateKey,
    templateVersion: EMAIL_TEMPLATE_VERSION,
    subject,
    textBody: lines.join("\n\n"),
    htmlBody: paragraphHtml(lines),
    payload,
  };
}

export function renderEmailTemplate(
  templateKey: EmailTemplateKey,
  data: EmailTemplateData,
) {
  const recipientName = cleanText(data.recipientName, "reader");
  const actorName = cleanText(data.actorName, "A Sonder member");
  const statusHref = trustedAppHref(data.statusHref, "/application-status");
  const communityHref = trustedAppHref(data.communityHref, "/community");
  const profileHref = trustedAppHref(data.profileHref, "/profile");
  const announcementHref = trustedAppHref(data.announcementHref, "/announcements");
  const meetingHref = trustedAppHref(data.meetingHref, "/meetings");
  const billingHref = trustedAppHref(data.billingHref, "/membership/billing");
  const invoiceNumber = truncate(cleanText(data.invoiceNumber, "membership invoice"), 80);
  const amountFormatted = cleanText(data.amountFormatted, "the recorded amount");
  const paymentReference = truncate(cleanText(data.paymentReference, "payment reference pending"), 80);
  const planName = truncate(cleanText(data.planName, "membership plan"), 120);
  const announcementTitle = truncate(
    cleanText(data.announcementTitle, "New Sonder announcement"),
    120,
  );
  const announcementBody = truncate(cleanText(data.announcementBody), 600);
  const meetingTitle = truncate(cleanText(data.meetingTitle, "Sonder meeting"), 120);
  const meetingTime = data.meetingStartsAt
    ? formatDateTime(data.meetingStartsAt)
    : "the scheduled time";
  const meetingLocation = truncate(cleanText(data.meetingLocation, "Location pending"), 160);

  switch (templateKey) {
    case "application_received":
      return render(
        templateKey,
        "Sonder received your application",
        [
          greeting(recipientName),
          "Thank you for applying to join Sonder Book Club. Your application has been received and the team will review it with care.",
          linkLine("Check your application status", statusHref),
        ],
        { statusHref },
      );
    case "application_under_review":
      return render(
        templateKey,
        "Your Sonder application is under review",
        [
          greeting(recipientName),
          "Your application is now under review. We will keep the process thoughtful and let you know when there is a decision.",
          linkLine("Check your application status", statusHref),
        ],
        { statusHref },
      );
    case "application_approved":
      return render(
        templateKey,
        "Welcome to Sonder Book Club",
        [
          greeting(recipientName),
          "Your membership has been approved. Welcome to Sonder. We are glad to have another thoughtful reader in the room.",
          linkLine("Complete your profile", profileHref),
          linkLine("Join the community conversation", communityHref),
        ],
        { profileHref, communityHref },
      );
    case "application_rejected":
      return render(
        templateKey,
        "Your Sonder application has been reviewed",
        [
          greeting(recipientName),
          "Thank you for taking the time to apply. Sonder is not able to offer membership at this time.",
          "We appreciate the care you put into your application and wish you steady, generous reading ahead.",
          linkLine("View your current status", statusHref),
        ],
        { statusHref },
      );
    case "application_waitlisted":
      return render(
        templateKey,
        "Your Sonder application is on the waitlist",
        [
          greeting(recipientName),
          "Thank you for applying to Sonder. Your application is still active, and we have placed it on the waitlist while the team manages the next intake window.",
          linkLine("Check your application status", statusHref),
        ],
        { statusHref },
      );
    case "community_comment":
      return render(
        templateKey,
        "New comment on your Sonder post",
        [
          greeting(recipientName),
          `${actorName} commented on your community post.`,
          linkLine("Open the community feed", communityHref),
        ],
        { communityHref },
      );
    case "community_reply":
      return render(
        templateKey,
        "New reply to your Sonder comment",
        [
          greeting(recipientName),
          `${actorName} replied to your comment in the community feed.`,
          linkLine("Open the community feed", communityHref),
        ],
        { communityHref },
      );
    case "announcement_published":
      return render(
        templateKey,
        `Sonder announcement: ${announcementTitle}`,
        [
          greeting(recipientName),
          `A new announcement was published: ${announcementTitle}`,
          announcementBody || "Open Sonder to read the full update.",
          linkLine("Read it in Sonder", announcementHref),
        ],
        {
          announcementHref,
          announcementTitle,
        },
      );
    case "meeting_updated":
      return render(
        templateKey,
        `Sonder meeting update: ${meetingTitle}`,
        [
          greeting(recipientName),
          `There is a meeting update for ${meetingTitle}.`,
          `When: ${meetingTime}`,
          `Where: ${meetingLocation}`,
          linkLine("Open meetings in Sonder", meetingHref),
        ],
        {
          meetingHref,
          meetingTitle,
          meetingStartsAt: meetingTime,
          meetingLocation,
        },
      );
    case "invoice_created":
      return render(
        templateKey,
        `Sonder invoice ${invoiceNumber}`,
        [
          greeting(recipientName),
          `A Sonder membership invoice has been created for ${amountFormatted}.`,
          `Invoice: ${invoiceNumber}`,
          linkLine("Open billing in Sonder", billingHref),
        ],
        {
          billingHref,
          invoiceNumber,
          amountFormatted,
        },
      );
    case "payment_recorded":
      return render(
        templateKey,
        "Sonder payment recorded",
        [
          greeting(recipientName),
          `A membership payment for ${amountFormatted} has been recorded and is awaiting confirmation.`,
          `Reference: ${paymentReference}`,
          invoiceNumber ? `Invoice: ${invoiceNumber}` : "Invoice: not linked",
          linkLine("Open billing in Sonder", billingHref),
        ],
        {
          billingHref,
          invoiceNumber,
          amountFormatted,
          paymentReference,
        },
      );
    case "payment_confirmed":
      return render(
        templateKey,
        "Sonder payment confirmed",
        [
          greeting(recipientName),
          `Your membership payment for ${amountFormatted} has been confirmed.`,
          `Reference: ${paymentReference}`,
          invoiceNumber ? `Invoice: ${invoiceNumber}` : "Invoice: not linked",
          linkLine("Open billing in Sonder", billingHref),
        ],
        {
          billingHref,
          invoiceNumber,
          amountFormatted,
          paymentReference,
        },
      );
    case "payment_failed":
      return render(
        templateKey,
        "Sonder payment could not be confirmed",
        [
          greeting(recipientName),
          `A membership payment for ${amountFormatted} could not be confirmed.`,
          invoiceNumber ? `Invoice: ${invoiceNumber}` : "Invoice: not linked",
          linkLine("Open billing in Sonder", billingHref),
        ],
        {
          billingHref,
          invoiceNumber,
          amountFormatted,
        },
      );
    case "subscription_past_due":
      return render(
        templateKey,
        "Sonder membership past due",
        [
          greeting(recipientName),
          "Your Sonder membership has an overdue invoice.",
          linkLine("Open billing in Sonder", billingHref),
        ],
        {
          billingHref,
        },
      );
    case "subscription_waived":
      return render(
        templateKey,
        "Sonder membership dues waived",
        [
          greeting(recipientName),
          `Your ${planName} membership dues are waived.`,
          linkLine("Open billing in Sonder", billingHref),
        ],
        {
          billingHref,
          planName,
        },
      );
  }
}
