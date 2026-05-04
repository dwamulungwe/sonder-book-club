import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/app/auth-card";

export const metadata: Metadata = {
  title: "Reset Password",
};

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(191,164,128,0.12),_transparent_35%),linear-gradient(180deg,#f8f2e8_0%,#efe3d5_100%)] px-4 py-8 sm:py-12">
      <AuthCard
        title="Reset password"
        description="This route is ready for a real recovery email flow, even though password delivery is still intentionally out of scope for the MVP."
        footer={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>Back to your session</span>
            <Link href="/login" className="font-semibold text-amber-800">
              Return to login
            </Link>
          </div>
        }
      >
        <div className="space-y-4 text-sm text-zinc-600">
          <p>
            Connect your email provider here when you are ready to send reset links in production.
          </p>
          <Link
            href="/login"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-zinc-950 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            Go to sign in
          </Link>
        </div>
      </AuthCard>
    </main>
  );
}
