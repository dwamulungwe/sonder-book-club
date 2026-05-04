import { cn } from "@/lib/utils";

type FeedbackBannerProps = {
  message: string;
  tone: "error" | "success";
};

export function FeedbackBanner({
  message,
  tone,
}: FeedbackBannerProps) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3 text-sm",
        tone === "success"
          ? "border-amber-300 bg-amber-50 text-stone-900"
          : "border-rose-300 bg-rose-50 text-rose-900",
      )}
    >
      {message}
    </div>
  );
}
