import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const toneClasses = {
  neutral: "border-stone-200 bg-stone-100 text-stone-700",
  emerald: "border-stone-800 bg-stone-900 text-stone-50",
  amber: "border-amber-200 bg-amber-100 text-amber-900",
  rose: "border-rose-200 bg-rose-100 text-rose-800",
  sky: "border-stone-300 bg-[#efe5d8] text-stone-800",
};

type StatusBadgeProps = {
  children: React.ReactNode;
  tone?: keyof typeof toneClasses;
};

export function StatusBadge({
  children,
  tone = "neutral",
}: StatusBadgeProps) {
  return (
    <Badge
      className={cn(
        "rounded-md border px-2.5 py-1 font-medium capitalize",
        toneClasses[tone],
      )}
    >
      {children}
    </Badge>
  );
}
