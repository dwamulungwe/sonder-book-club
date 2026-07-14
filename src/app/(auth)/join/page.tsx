import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { FeedbackBanner } from "@/components/app/feedback-banner";
import { BrandLogo } from "@/components/app/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitMembershipApplicationAction } from "@/features/applications/actions";
import { APP_LOGO_PATH, APP_NAME } from "@/lib/brand";
import { getNotice } from "@/lib/navigation";

export const metadata: Metadata = {
  title: "Apply to Join",
};

type JoinPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function JoinPage({ searchParams }: JoinPageProps) {
  const session = await auth();

  if (session?.user) {
    redirect("/application-status");
  }

  const notice = getNotice(await searchParams);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(190,154,101,0.14),_transparent_34%),linear-gradient(180deg,#faf4ea_0%,#efe3d4_100%)] px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
        <section className="rounded-[1.5rem] border border-stone-200 bg-[rgba(255,251,244,0.86)] p-5 shadow-sm sm:p-6 lg:sticky lg:top-8">
          <div className="w-24 sm:w-32">
            <BrandLogo src={APP_LOGO_PATH} priority className="w-full" />
          </div>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">
            {APP_NAME}
          </p>
          <h1 className="mt-3 text-3xl text-stone-950 sm:text-4xl">
            Apply to join the reading room
          </h1>
          <p className="mt-4 text-sm leading-6 text-stone-600">
            Tell us about the books that move you, the conversations you want
            to share, and how Sonder can become part of your reading life.
          </p>
          <div className="mt-6 rounded-xl border border-stone-200 bg-white/70 p-4 text-sm leading-6 text-stone-600">
            Already approved or already applied?{" "}
            <Link href="/login" className="font-semibold text-amber-800">
              Sign in
            </Link>
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm sm:p-6">
          <form action={submitMembershipApplicationAction} className="space-y-6">
            {notice ? (
              <FeedbackBanner message={notice.message} tone={notice.tone} />
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="full-name">Full name</Label>
                <Input id="full-name" name="fullName" autoComplete="name" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <p className="text-xs text-stone-500">At least 8 characters.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password-confirmation">Confirm password</Label>
                <Input
                  id="password-confirmation"
                  name="passwordConfirmation"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="phone-number">Phone number</Label>
                <Input
                  id="phone-number"
                  name="phoneNumber"
                  autoComplete="tel"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  name="location"
                  autoComplete="address-level2"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="occupation">Occupation</Label>
                <Input id="occupation" name="occupation" autoComplete="organization-title" />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="reading-interests">Reading interests</Label>
                <Textarea
                  id="reading-interests"
                  name="readingInterests"
                  rows={5}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason-for-joining">Reason for joining</Label>
                <Textarea
                  id="reason-for-joining"
                  name="reasonForJoining"
                  rows={5}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="favourite-genres">Favourite genres</Label>
                <Input
                  id="favourite-genres"
                  name="favouriteGenres"
                  placeholder="Literary fiction, memoir, poetry"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="favourite-books">Favourite books</Label>
                <Input
                  id="favourite-books"
                  name="favouriteBooks"
                  placeholder="A few titles, if you have them"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="referral-source">How did you hear about Sonder?</Label>
              <Input id="referral-source" name="referralSource" />
            </div>

            <div className="space-y-3 rounded-xl border border-stone-200 bg-[rgba(255,251,244,0.78)] p-4">
              <label
                htmlFor="accepted-community-rules"
                className="flex gap-3 text-sm leading-6 text-stone-700"
              >
                <input
                  id="accepted-community-rules"
                  name="acceptedCommunityRules"
                  type="checkbox"
                  required
                  className="mt-1 size-4 rounded border-stone-300"
                />
                <span>I accept the Sonder community rules.</span>
              </label>
              <label
                htmlFor="accepted-privacy-policy"
                className="flex gap-3 text-sm leading-6 text-stone-700"
              >
                <input
                  id="accepted-privacy-policy"
                  name="acceptedPrivacyPolicy"
                  type="checkbox"
                  required
                  className="mt-1 size-4 rounded border-stone-300"
                />
                <span>I consent to Sonder storing my application details for review.</span>
              </label>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="submit"
                className="h-11 rounded-xl bg-stone-900 px-5 text-stone-50 hover:bg-stone-800"
              >
                Submit application
              </Button>
              <Link href="/login" className="text-sm font-semibold text-amber-800">
                Already have an account?
              </Link>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
