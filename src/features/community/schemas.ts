import { z } from "zod";

export const communityPostTypeValues = [
  "GENERAL",
  "READING_UPDATE",
  "BOOK_RECOMMENDATION",
  "CURRENTLY_LISTENING",
  "ANNOUNCEMENT",
  "NEW_MEMBER_WELCOME",
] as const;

export const postReactionTypeValues = [
  "INSIGHTFUL",
  "BEAUTIFULLY_SAID",
  "ADDING_TO_MY_LIST",
  "I_AGREE",
  "MADE_ME_THINK",
  "APPLAUSE",
] as const;

export const reportStatusValues = [
  "REVIEWING",
  "RESOLVED",
  "DISMISSED",
] as const;

function optionalHttpUrl(label: string) {
  return z
    .string()
    .max(500, `${label} must be 500 characters or fewer.`)
    .refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    }, `${label} must be a valid HTTP or HTTPS URL.`)
    .optional();
}

export const communityPostSchema = z
  .object({
    postType: z.enum(communityPostTypeValues),
    body: z
      .string()
      .max(2000, "Post text must be 2000 characters or fewer.")
      .optional(),
    relatedBookId: z
      .string()
      .max(128, "Related book id is invalid.")
      .optional(),
    listeningTitle: z
      .string()
      .max(180, "Listening title must be 180 characters or fewer.")
      .optional(),
    listeningCreator: z
      .string()
      .max(180, "Listening creator must be 180 characters or fewer.")
      .optional(),
    listeningUrl: optionalHttpUrl("Listening URL"),
  })
  .superRefine((data, context) => {
    const body = data.body?.trim() ?? "";
    const hasRelatedBook = Boolean(data.relatedBookId);
    const hasListeningTitle = Boolean(data.listeningTitle?.trim());
    const hasListeningCreator = Boolean(data.listeningCreator?.trim());
    const hasListeningUrl = Boolean(data.listeningUrl?.trim());

    if (data.postType === "GENERAL" && !body) {
      context.addIssue({
        code: "custom",
        path: ["body"],
        message: "General posts need a little text.",
      });
    }

    if (data.postType === "ANNOUNCEMENT" && !body) {
      context.addIssue({
        code: "custom",
        path: ["body"],
        message: "Announcements need body text.",
      });
    }

    if (data.postType === "NEW_MEMBER_WELCOME" && !body) {
      context.addIssue({
        code: "custom",
        path: ["body"],
        message: "Welcome posts need body text.",
      });
    }

    if (data.postType === "READING_UPDATE" && !body && !hasRelatedBook) {
      context.addIssue({
        code: "custom",
        path: ["body"],
        message: "Reading updates need text or a related book.",
      });
    }

    if (data.postType === "BOOK_RECOMMENDATION") {
      if (!hasRelatedBook) {
        context.addIssue({
          code: "custom",
          path: ["relatedBookId"],
          message: "Book recommendations need a related book.",
        });
      }

      if (!body) {
        context.addIssue({
          code: "custom",
          path: ["body"],
          message: "Book recommendations need recommendation text.",
        });
      }
    }

    if (data.postType === "CURRENTLY_LISTENING") {
      if (!hasListeningTitle) {
        context.addIssue({
          code: "custom",
          path: ["listeningTitle"],
          message: "Listening posts need a title.",
        });
      }

      if (!hasListeningCreator && !hasListeningUrl) {
        context.addIssue({
          code: "custom",
          path: ["listeningCreator"],
          message: "Add a creator or a safe listening link.",
        });
      }
    }
  });

export const commentSchema = z.object({
  body: z
    .string()
    .min(1, "Comments need a little text.")
    .max(1200, "Comments must be 1200 characters or fewer."),
});

export const reactionSchema = z.object({
  reactionType: z.enum(postReactionTypeValues),
});

export const contentReportSchema = z.object({
  reason: z
    .string()
    .min(3, "Choose a report reason.")
    .max(120, "Report reason must be 120 characters or fewer."),
  details: z
    .string()
    .max(1000, "Report details must be 1000 characters or fewer.")
    .optional(),
});

export const reportReviewSchema = z.object({
  status: z.enum(reportStatusValues),
  deleteReportedContent: z.boolean(),
});
