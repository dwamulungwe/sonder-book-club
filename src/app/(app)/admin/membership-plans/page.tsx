import type { Metadata } from "next";
import Link from "next/link";
import { BillingInterval } from "@prisma/client";
import { Save, Tags } from "lucide-react";

import { SectionHeading } from "@/components/app/section-heading";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveMembershipPlanAction } from "@/features/billing/actions";
import {
  formatMinorUnits,
  minorUnitsToDecimalString,
} from "@/features/billing/currency";
import { getMembershipPlansAdminPageData } from "@/features/billing/queries";
import { requireBillingAdmin } from "@/features/billing/permissions";
import { formatBillingInterval } from "@/lib/formatters";

export const metadata: Metadata = {
  title: "Membership Plans",
};

const intervalOptions = [
  BillingInterval.MONTHLY,
  BillingInterval.QUARTERLY,
  BillingInterval.ANNUAL,
  BillingInterval.ONE_TIME,
] as const;

type PlanFormProps = {
  plan?: Awaited<ReturnType<typeof getMembershipPlansAdminPageData>>["plans"][number];
};

function PlanFields({ plan }: PlanFormProps) {
  return (
    <>
      {plan ? <input type="hidden" name="planId" value={plan.id} /> : null}
      <input type="hidden" name="redirectTo" value="/admin/membership-plans" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${plan?.id ?? "new"}-name`}>Plan name</Label>
          <Input
            id={`${plan?.id ?? "new"}-name`}
            name="name"
            defaultValue={plan?.name ?? ""}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${plan?.id ?? "new"}-amount`}>Amount</Label>
          <Input
            id={`${plan?.id ?? "new"}-amount`}
            name="amount"
            inputMode="decimal"
            defaultValue={
              plan ? minorUnitsToDecimalString(plan.amountMinor, plan.currency) : ""
            }
            placeholder="100.00"
            required
          />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-[120px_1fr_120px]">
        <div className="space-y-2">
          <Label htmlFor={`${plan?.id ?? "new"}-currency`}>Currency</Label>
          <Input
            id={`${plan?.id ?? "new"}-currency`}
            name="currency"
            defaultValue={plan?.currency ?? "ZMW"}
            maxLength={3}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${plan?.id ?? "new"}-interval`}>
            Billing interval
          </Label>
          <select
            id={`${plan?.id ?? "new"}-interval`}
            name="billingInterval"
            defaultValue={plan?.billingInterval ?? BillingInterval.MONTHLY}
            className="flex h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
          >
            {intervalOptions.map((interval) => (
              <option key={interval} value={interval}>
                {formatBillingInterval(interval)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${plan?.id ?? "new"}-count`}>Count</Label>
          <Input
            id={`${plan?.id ?? "new"}-count`}
            name="intervalCount"
            type="number"
            min={1}
            max={36}
            defaultValue={plan?.intervalCount ?? 1}
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${plan?.id ?? "new"}-description`}>Description</Label>
        <Textarea
          id={`${plan?.id ?? "new"}-description`}
          name="description"
          rows={3}
          defaultValue={plan?.description ?? ""}
        />
      </div>
      <div className="flex flex-wrap gap-4 text-sm text-stone-700">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={plan?.isActive ?? true}
            className="size-4 rounded border-stone-300"
          />
          Active
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            name="isDefault"
            defaultChecked={plan?.isDefault ?? false}
            className="size-4 rounded border-stone-300"
          />
          Default
        </label>
      </div>
    </>
  );
}

export default async function MembershipPlansPage() {
  const { user, membership } = await requireBillingAdmin("/dashboard");
  const data = await getMembershipPlansAdminPageData({ user, membership });

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm sm:p-6">
        <SectionHeading
          eyebrow="Admin"
          title="Membership plans"
          description="Create and maintain the dues plans used for membership subscriptions."
          action={
            <Link
              href="/admin/billing"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-stone-300 hover:bg-stone-50"
            >
              Billing administration
            </Link>
          }
        />
      </section>

      <section className="rounded-[1rem] border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <Tags className="size-4 text-stone-500" />
          <h2 className="text-lg font-semibold text-stone-950">
            Create plan
          </h2>
        </div>
        <form action={saveMembershipPlanAction} className="space-y-4">
          <PlanFields />
          <Button
            type="submit"
            className="h-10 gap-2 rounded-lg bg-stone-900 px-3 text-stone-50 hover:bg-stone-800"
          >
            <Save className="size-4" />
            Save plan
          </Button>
        </form>
      </section>

      <section className="grid gap-4">
        {data.plans.map((plan) => (
          <article
            key={plan.id}
            className="rounded-[1rem] border border-stone-200 bg-white p-4 shadow-sm sm:p-5"
          >
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-stone-950">
                    {plan.name}
                  </h2>
                  <StatusBadge tone={plan.isActive ? "emerald" : "neutral"}>
                    {plan.isActive ? "active" : "inactive"}
                  </StatusBadge>
                  {plan.isDefault ? (
                    <StatusBadge tone="sky">default</StatusBadge>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-stone-600">
                  {formatMinorUnits(plan.amountMinor, plan.currency)} /{" "}
                  {formatBillingInterval(plan.billingInterval)}
                </p>
              </div>
              <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
                {plan._count.subscriptions} subscriptions
              </div>
            </div>
            <form action={saveMembershipPlanAction} className="space-y-4">
              <PlanFields plan={plan} />
              <Button
                type="submit"
                className="h-10 gap-2 rounded-lg bg-stone-900 px-3 text-stone-50 hover:bg-stone-800"
              >
                <Save className="size-4" />
                Save changes
              </Button>
            </form>
          </article>
        ))}
      </section>
    </div>
  );
}
