"use server";

import { AuthError } from "next-auth";

import { signIn, signOut } from "@/auth";
import { getString } from "@/lib/form-data";
import {
  redirectWithNotice,
  resolveReturnPath,
} from "@/lib/navigation";

export async function loginAction(formData: FormData) {
  const email = getString(formData, "email").toLowerCase();
  const password = getString(formData, "password");

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: resolveReturnPath(formData, "/dashboard"),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirectWithNotice(
        "/login",
        "error",
        "Invalid email or password.",
      );
    }

    throw error;
  }
}

export async function signupAction(formData: FormData) {
  const redirectTo = resolveReturnPath(formData, "/join");

  redirectWithNotice(
    redirectTo === "/dashboard" ? "/join" : redirectTo,
    "success",
    "Sonder membership now starts with an application.",
  );
}

export async function logoutAction() {
  await signOut({
    redirectTo: "/login",
  });
}
