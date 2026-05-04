import { DefaultSession } from "next-auth";
import { SystemRole } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      systemRole: SystemRole;
    };
  }

  interface User {
    systemRole: SystemRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    systemRole?: SystemRole;
  }
}
