"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BookOpenText,
  CalendarDays,
  Gauge,
  MapPin,
  Megaphone,
  Menu,
  Settings,
  Shield,
  Users,
  Vote,
  X,
} from "lucide-react";

import { BrandLogo } from "@/components/app/brand-logo";
import { FeedbackBanner } from "@/components/app/feedback-banner";
import { logoutAction } from "@/features/auth/actions";
import { APP_LOGO_PATH, APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

type AppShellProps = {
  club: {
    name: string;
    description: string | null;
    meetingFrequency: string | null;
    location: string | null;
    logoUrl?: string | null;
    bannerUrl?: string | null;
  };
  user: {
    name?: string | null;
    email?: string | null;
    systemRole: string;
  };
  children: React.ReactNode;
};

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/books", label: "Books", icon: BookOpenText },
  { href: "/reading-plan", label: "Reading Plan", icon: BookOpenText },
  { href: "/meetings", label: "Meetings", icon: CalendarDays },
  { href: "/voting", label: "Voting", icon: Vote },
  { href: "/announcements", label: "Announcements", icon: Megaphone },
  { href: "/members", label: "Members", icon: Users },
  { href: "/admin", label: "Admin", icon: Shield },
];

function formatRoleLabel(role: string) {
  return role.toLowerCase().replace(/^\w/, (character) => character.toUpperCase());
}

export function AppShell({ club, user, children }: AppShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const canSeeAdmin = user.systemRole === "ADMIN";
  const mobileMenuId = "app-mobile-navigation";
  const errorMessage = searchParams.get("error");
  const successMessage = searchParams.get("success");

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 px-3 py-3 sm:gap-5 sm:px-4 sm:py-4 lg:flex-row lg:px-6 lg:py-6">
        <aside className="relative w-full rounded-[1.5rem] border border-stone-200/90 bg-[rgba(255,251,244,0.84)] p-3 shadow-[0_20px_60px_rgba(61,41,27,0.08)] backdrop-blur sm:p-4 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:w-80 lg:overflow-y-auto lg:p-5">
          <div className="relative overflow-hidden rounded-[1.35rem] border border-stone-200/80 bg-[linear-gradient(180deg,rgba(252,248,241,0.98),rgba(241,231,218,0.95))] p-4 text-stone-950 shadow-[0_16px_40px_rgba(61,41,27,0.08)] sm:p-5">
            {club.bannerUrl ? (
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-24 overflow-hidden opacity-[0.08]"
                style={{
                  backgroundImage: `url(${club.bannerUrl})`,
                  backgroundPosition: "center",
                  backgroundSize: "cover",
                }}
              />
            ) : null}

            <div className="relative space-y-4 sm:space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="w-20 shrink-0 sm:w-28">
                      <BrandLogo src={APP_LOGO_PATH} priority className="w-full" />
                    </div>
                    <button
                      type="button"
                      aria-controls={mobileMenuId}
                      aria-expanded={isMobileMenuOpen}
                      aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
                      onClick={() => setIsMobileMenuOpen((open) => !open)}
                      className="relative z-10 inline-flex size-10 items-center justify-center rounded-full border border-stone-300 bg-white/80 text-stone-700 transition-colors hover:bg-stone-100 lg:hidden"
                    >
                      {isMobileMenuOpen ? (
                        <X className="size-4" />
                      ) : (
                        <Menu className="size-4" />
                      )}
                    </button>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">
                      {APP_NAME}
                    </p>
                    <h1 className="text-2xl text-stone-950 sm:text-3xl">
                      {club.name}
                    </h1>
                    <p className="max-w-xs text-sm leading-6 text-stone-600 sm:max-w-sm">
                      {club.description ??
                        "Keep the current read, next discussion, and every club decision in one calm home."}
                    </p>
                  </div>
                </div>

                <div className="hidden shrink-0 rounded-full border border-stone-300 bg-white/75 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-stone-600 sm:inline-flex">
                  Est. 2026
                </div>
              </div>

              <div className="sm:hidden">
                <div className="inline-flex rounded-full border border-stone-300 bg-white/75 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-stone-600">
                  Est. 2026
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-2xl border border-stone-200 bg-white/70 px-3 py-2.5">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-stone-500">
                  Rhythm
                </p>
                <p className="mt-1 text-sm text-stone-900">
                  {club.meetingFrequency ?? "Schedule pending"}
                </p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-white/70 px-3 py-2.5">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-stone-500">
                  Base
                </p>
                <p className="mt-1 text-sm text-stone-900">
                  {club.location ?? "Location pending"}
                </p>
              </div>
            </div>
          </div>

          <div
            id={mobileMenuId}
            className={cn(
              "space-y-4 overflow-hidden transition-[margin,max-height,opacity,visibility] duration-200 ease-out lg:mt-5 lg:block lg:overflow-visible lg:transition-none",
              isMobileMenuOpen
                ? "mt-4 visible max-h-[80rem] opacity-100"
                : "mt-0 invisible max-h-0 opacity-0 pointer-events-none lg:mt-5 lg:visible lg:max-h-none lg:opacity-100 lg:pointer-events-auto",
            )}
          >
            <nav className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {navItems
                .filter((item) => (item.href === "/admin" ? canSeeAdmin : true))
                .map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={cn(
                        "inline-flex min-h-11 items-center gap-3 rounded-2xl border px-3.5 py-3 text-sm font-medium transition-colors",
                        isActive
                          ? "border-stone-900 bg-stone-900 text-stone-50 shadow-sm"
                          : "border-stone-200 bg-white/65 text-stone-700 hover:border-stone-300 hover:bg-stone-50 hover:text-stone-950",
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="min-w-0">{item.label}</span>
                    </Link>
                  );
                })}
            </nav>

            <div className="rounded-[1.35rem] border border-stone-300 bg-[#38281d] p-4 text-stone-50 shadow-[0_14px_36px_rgba(61,41,27,0.18)]">
              <div className="flex items-center gap-2 text-stone-100">
                <Settings className="size-4 shrink-0 text-[#d8b889]" />
                <span className="text-xs font-semibold uppercase tracking-[0.16em]">
                  Signed in
                </span>
              </div>
              <p className="mt-3 text-lg">{user.name ?? `${APP_NAME} member`}</p>
              <p className="mt-1 break-all text-sm text-stone-200/70">
                {user.email ?? "Signed in"}
              </p>
              <p className="mt-3 inline-flex rounded-full border border-[#d8b889]/25 bg-[#d8b889]/10 px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[#f6e7cf]">
                {formatRoleLabel(user.systemRole)}
              </p>
              <div className="mt-4 rounded-2xl border border-stone-100/10 bg-black/10 px-3 py-2 text-xs text-stone-200/80">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-[#d8b889]" />
                  <span>{club.location ?? "Location pending"}</span>
                </div>
              </div>
              <form action={logoutAction} className="mt-4">
                <button
                  type="submit"
                  className="min-h-11 w-full rounded-xl bg-[#f5ebdd] px-3 py-2.5 text-sm font-medium text-stone-950 transition-colors hover:bg-[#efe1ce]"
                >
                  Log out
                </button>
              </form>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-4 md:space-y-6">
          {errorMessage ? (
            <FeedbackBanner message={errorMessage} tone="error" />
          ) : null}
          {!errorMessage && successMessage ? (
            <FeedbackBanner message={successMessage} tone="success" />
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
