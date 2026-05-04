import Image from "next/image";

import { APP_LOGO_PATH, APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  priority?: boolean;
  src?: string | null;
};

export function BrandLogo({
  className,
  priority = false,
  src,
}: BrandLogoProps) {
  return (
    <Image
      src={src || APP_LOGO_PATH}
      alt={APP_NAME}
      width={598}
      height={718}
      priority={priority}
      className={cn("h-auto w-full object-contain", className)}
    />
  );
}
