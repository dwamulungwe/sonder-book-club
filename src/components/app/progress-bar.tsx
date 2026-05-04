import { cn } from "@/lib/utils";

type ProgressBarProps = {
  value: number;
  className?: string;
};

export function ProgressBar({
  value,
  className,
}: ProgressBarProps) {
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <div
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-zinc-200",
        className,
      )}
    >
      <div
        className="h-full rounded-full bg-stone-900 transition-[width]"
        style={{ width: `${clampedValue}%` }}
      />
    </div>
  );
}
