import { formatDateTime } from "@/lib/formatters";

export type EmailTemplateKey =
  | "application_received"
  | "application_under_review"
  | "application_approved"
  | "application_rejected"
  | "application_waitlisted"
  | "community_comment"
  | "community_reply"
  | "announcement_published"
  | "meeting_updated";

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
};

export type RenderedEmailTemplate = {
  templateKey: EmailTemplateKey;
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
  const statusHref = cleanText(data.statusHref, "/application-status");
  const communityHref = cleanText(data.communityHref, "/community");
  const profileHref = cleanText(data.profileHref, "/profile");
  const announcementHref = cleanText(data.announcementHref, "/announcements");
  const meetingHref = cleanText(data.meetingHref, "/meetings");
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
          `You can check your application status here: ${statusHref}`,
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
          `You can check your status here: ${statusHref}`,
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
          `You can complete your profile here: ${profileHref}`,
          `You can join the community conversation here: ${communityHref}`,
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
          `You can view your current status here: ${statusHref}`,
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
          `You can check your status here: ${statusHref}`,
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
          `Open the community feed: ${communityHref}`,
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
          `Open the community feed: ${communityHref}`,
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
          `Read it in Sonder: ${announcementHref}`,
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
          `Open meetings in Sonder: ${meetingHref}`,
        ],
        {
          meetingHref,
          meetingTitle,
          meetingStartsAt: meetingTime,
          meetingLocation,
        },
      );
  }
}
