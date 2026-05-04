import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { db } from "@/lib/db";

export async function requireSessionUser() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return session.user;
}

export async function getMembershipForUser(userId: string) {
  return db.membership.findUnique({
    where: {
      userId,
    },
  });
}

export async function requireMembershipContext() {
  const user = await requireSessionUser();
  const membership = await getMembershipForUser(user.id);

  return {
    user,
    membership,
  };
}
