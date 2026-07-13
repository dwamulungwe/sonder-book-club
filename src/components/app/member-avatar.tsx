import { cn } from "@/lib/utils";

type MemberAvatarProps = {
  name?: string | null;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeClasses = {
  sm: "size-12 text-sm",
  md: "size-16 text-lg",
  lg: "size-24 text-2xl",
};

function getInitials(name?: string | null) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];

  if (parts.length === 0) {
    return "SB";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function MemberAvatar({
  name,
  imageUrl,
  size = "md",
  className,
}: MemberAvatarProps) {
  const displayName = name?.trim() || "Sonder member";

  return (
    <div
      role="img"
      aria-label={
        imageUrl
          ? `${displayName} profile photo`
          : `${displayName} initials`
      }
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-stone-200 bg-[#efe1ce] bg-cover bg-center font-semibold text-stone-800 shadow-sm",
        sizeClasses[size],
        className,
      )}
      style={
        imageUrl
          ? { backgroundImage: `url(${JSON.stringify(imageUrl)})` }
          : undefined
      }
    >
      {imageUrl ? null : <span>{getInitials(name)}</span>}
    </div>
  );
}
