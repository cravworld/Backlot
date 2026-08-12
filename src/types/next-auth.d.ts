import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      orgId: string;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    orgId: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    orgId: string;
  }
}
