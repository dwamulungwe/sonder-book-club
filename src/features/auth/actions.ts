"use server";

import { MembershipStatus, SystemRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { AuthError } from "next-auth";

import { signIn, signOut } from "@/auth";
import { signupSchema } from "@/features/auth/schemas";
import { getString } from "@/lib/form-data";
import { db } from "@/lib/db";
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
  const parsed = signupSchema.safeParse({
    name: getString(formData, "name"),
    email: getString(formData, "email").toLowerCase(),
    password: getString(formData, "password"),
  });

  if (!parsed.success) {
    redirectWithNotice(
      "/signup",
      "error",
      parsed.error.issues[0]?.message ?? "Check the form and try again.",
    );
  }

  const existingUser = await db.user.findUnique({
    where: { email: parsed.data.email },
  });

  if (existingUser) {
    redirectWithNotice(
      "/signup",
      "error",
      "An account with that email already exists.",
    );
  }

  const passwordHash = await hash(parsed.data.password, 12);

  await db.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      systemRole: SystemRole.GUEST,
      membership: {
        create: {
          role: SystemRole.GUEST,
          status: MembershipStatus.ACTIVE,
        },
      },
    },
  });

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: resolveReturnPath(formData, "/dashboard"),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirectWithNotice(
        "/login",
        "success",
        "Account created. Sign in with your new password.",
      );
    }

    throw error;
  }
}

export async function logoutAction() {
  await signOut({
    redirectTo: "/login",
  });
}
