import { cn } from "@/lib/utils";

type NativeSelectProps = React.ComponentProps<"select">;

export function NativeSelect({
  className,
  children,
  ...props
}: NativeSelectProps) {
  return (
    <select
      className={cn(
        "h-8 w-full rounded-lg border border-input bg-white px-2.5 py-1 text-sm text-zinc-950 outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
