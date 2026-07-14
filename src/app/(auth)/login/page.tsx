import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AuthCard } from "@/components/app/auth-card";
import { FeedbackBanner } from "@/components/app/feedback-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/features/auth/actions";
import { getNotice } from "@/lib/navigation";

export const metadata: Metadata = {
  title: "Log In",
};

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  const notice = getNotice(await searchParams);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(188,157,116,0.14),_transparent_36%),linear-gradient(180deg,#f8f2e8_0%,#f0e6d8_100%)] px-4 py-8 sm:py-12">
      <AuthCard
        title="Welcome back"
        description="Jump straight into the current read, the next discussion, and the club decisions that still need your input."
        footer={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>Want to join Sonder?</span>
            <Link href="/join" className="font-semibold text-amber-800">
              Apply to join
            </Link>
          </div>
        }
      >
        <form action={loginAction} className="space-y-4">
          <input type="hidden" name="redirectTo" value="/dashboard" />
          {notice ? (
            <FeedbackBanner
              message={notice.message}
              tone={notice.tone}
            />
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-amber-800"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              minLength={8}
              required
            />
          </div>
          <Button
            type="submit"
            className="h-11 w-full rounded-xl bg-stone-900 text-stone-50 hover:bg-stone-800"
          >
            Log in
          </Button>
        </form>
      </AuthCard>
    </main>
  );
}
