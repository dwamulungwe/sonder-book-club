import type { Metadata } from "next";
import Link from "next/link";
import { MembershipApplicationStatus, MembershipStatus } from "@prisma/client";

import { BrandLogo } from "@/components/app/brand-logo";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { getMyApplicationStatusData } from "@/features/applications/queries";
import { logoutAction } from "@/features/auth/actions";
import { APP_LOGO_PATH, APP_NAME } from "@/lib/brand";
import { formatMembershipApplicationStatus } from "@/lib/formatters";
import { requireSessionUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Application Status",
};

const statusCopy: Record<
  MembershipApplicationStatus,
  { title: string; body: string; tone?: "amber" | "sky" | "emerald" | "rose" }
> = {
  DRAFT: {
    title: "Your application is not submitted yet",
    body: "Your application is still a draft. Submit a completed application when you are ready for review.",
    tone: "amber",
  },
  SUBMITTED: {
    title: "Your application has been received",
    body: "Thank you for applying. The Sonder team will review your application with care.",
    tone: "sky",
  },
  UNDER_REVIEW: {
    title: "Your application is under review",
    body: "A reviewer is reading through your application. You can check back here for the latest decision.",
    tone: "amber",
  },
  APPROVED: {
    title: "Welcome to Sonder",
    body: "Your membership has been approved. You can complete your profile and join the community conversation.",
    tone: "emerald",
  },
  REJECTED: {
    title: "Your application has been reviewed",
    body: "Sonder is not able to offer membership at this time. Thank you for taking the time to apply.",
    tone: "rose",
  },
  WAITLISTED: {
    title: "You are on the waitlist",
    body: "Your application is still active, and the team will revisit it as space opens.",
    tone: "amber",
  },
};

export default async function ApplicationStatusPage() {
  const sessionUser = await requireSessionUser();
  const data = await getMyApplicationStatusData(sessionUser.id);
  const application = data.application;
  const isActiveMember =
    data.user?.membership?.status === MembershipStatus.ACTIVE;
  const status = application?.status;
  const copy = status ? statusCopy[status] : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(188,157,116,0.14),_transparent_36%),linear-gradient(180deg,#f8f2e8_0%,#f0e6d8_100%)] px-4 py-8 sm:py-12">
      <section className="w-full max-w-2xl rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm sm:p-7">
        <div className="w-24">
          <BrandLogo src={APP_LOGO_PATH} priority className="w-full" />
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">
          {APP_NAME}
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl text-stone-950">Application status</h1>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Signed in as {data.user?.name ?? sessionUser.email ?? "applicant"}.
            </p>
          </div>
          {status ? (
            <StatusBadge tone={copy?.tone}>
              {formatMembershipApplicationStatus(status)}
            </StatusBadge>
          ) : null}
        </div>

        <div className="mt-6 rounded-xl border border-stone-200 bg-[rgba(255,251,244,0.75)] p-5">
          {copy ? (
            <>
              <h2 className="text-xl font-semibold text-stone-950">
                {copy.title}
              </h2>
              <p className="mt-3 text-sm leading-6 text-stone-700">
                {copy.body}
              </p>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-stone-950">
                No application found
              </h2>
              <p className="mt-3 text-sm leading-6 text-stone-700">
                This account does not have a membership application attached to
                it. If you are already a member, continue to the club workspace.
              </p>
            </>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {status === MembershipApplicationStatus.APPROVED || isActiveMember ? (
            <>
              <Link
                href="/profile"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-800"
              >
                Complete profile
              </Link>
              <Link
                href="/community"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
              >
                Visit Community
              </Link>
            </>
          ) : null}
          <form action={logoutAction}>
            <Button
              type="submit"
              variant="outline"
              className="h-11 rounded-xl border-stone-200 bg-white px-4 text-stone-700 hover:bg-stone-50"
            >
              Sign out
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
