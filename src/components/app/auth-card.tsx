import Link from "next/link";

import { BrandLogo } from "@/components/app/brand-logo";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { APP_NAME } from "@/lib/brand";

type AuthCardProps = {
  title: string;
  description: string;
  footer: React.ReactNode;
  children: React.ReactNode;
};

export function AuthCard({
  title,
  description,
  footer,
  children,
}: AuthCardProps) {
  return (
    <Card className="w-full max-w-lg border-stone-200 bg-[rgba(255,251,244,0.95)] shadow-[0_24px_60px_rgba(61,41,27,0.12)] backdrop-blur">
      <CardHeader className="space-y-4 p-6 sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <Link href="/" className="block w-20 sm:w-28">
            <BrandLogo priority className="w-full" />
          </Link>
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-stone-500 sm:pt-2">
            Editorial reading club
          </span>
        </div>
        <div className="min-w-0 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">
            {APP_NAME}
          </p>
          <CardTitle className="text-2xl text-zinc-950 sm:text-3xl">
            {title}
          </CardTitle>
          <p className="max-w-md text-sm leading-6 text-zinc-600">{description}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-6 pt-0 sm:p-8 sm:pt-0">
        {children}
        <div className="border-t border-stone-200 pt-4 text-sm text-zinc-600">
          {footer}
        </div>
      </CardContent>
    </Card>
  );
}
