import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcryptjs";
import { SystemRole } from "@prisma/client";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { loginSchema } from "@/features/auth/schemas";
import { db } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  trustHost: process.env.AUTH_TRUST_HOST === "true",
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);

        if (!parsed.success) {
          return null;
        }

        const user = await db.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });

        if (!user?.passwordHash) {
          return null;
        }

        const passwordsMatch = await compare(
          parsed.data.password,
          user.passwordHash,
        );

        if (!passwordsMatch) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          systemRole: user.systemRole ?? SystemRole.GUEST,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.name = user.name;
        token.email = user.email;
        token.picture = user.image;
        token.systemRole = user.systemRole ?? SystemRole.GUEST;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.systemRole =
          (token.systemRole as SystemRole | undefined) ??
          SystemRole.GUEST;
      }

      return session;
    },
  },
});
