"use client";

import { CreditCard } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

export function OnlinePaymentSubmitButton({
  amountLabel,
}: {
  amountLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending}
      className="h-10 gap-2 rounded-lg bg-stone-900 px-3 text-stone-50 hover:bg-stone-800"
    >
      <CreditCard className="size-4" />
      {pending ? "Creating checkout..." : `Pay ${amountLabel}`}
    </Button>
  );
}
