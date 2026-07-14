import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Apply to Join",
};

export default function SignupPage() {
  redirect("/join");
}
