import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AuthCard } from "@/components/app/auth-card";
import { FeedbackBanner } from "@/components/app/feedback-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signupAction } from "@/features/auth/actions";
import { getNotice } from "@/lib/navigation";

export const metadata: Metadata = {
  title: "Sign Up",
};

type SignupPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignupPage({
  searchParams,
}: SignupPageProps) {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  const notice = getNotice(await searchParams);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_right,_rgba(191,164,128,0.16),_transparent_35%),linear-gradient(180deg,#f8f2e8_0%,#eee2d3_100%)] px-4 py-8 sm:py-12">
      <AuthCard
        title="Create your account"
        description="Start with guest access, explore the club workspace, and stay close to the next book, plan, and meeting."
        footer={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>Already registered?</span>
            <Link href="/login" className="font-semibold text-amber-800">
              Sign in
            </Link>
          </div>
        }
      >
        <form action={signupAction} className="space-y-4">
          <input type="hidden" name="redirectTo" value="/dashboard" />
          {notice ? (
            <FeedbackBanner
              message={notice.message}
              tone={notice.tone}
            />
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" name="name" minLength={2} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
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
            Create account
          </Button>
        </form>
      </AuthCard>
    </main>
  );
}
