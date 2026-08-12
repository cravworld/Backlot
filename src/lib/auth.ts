import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// Phase 0 decision: email/password via Credentials provider, JWT session
// strategy. No magic-link yet — that needs the email adapter, which is a
// later spine component (notification/dispatch service). No SSO, no
// self-serve signup: accounts are created by an org admin (via seed data
// for now, an admin UI later). See phase-0-findings.md open question 7.
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        });

        if (!user || user.status !== "ACTIVE") {
          return null;
        }

        const passwordValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!passwordValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          orgId: user.orgId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // `user` is only present on initial sign-in; keep the token minimal
      // (id + orgId) and resolve org role / film assignments / capabilities
      // fresh from the DB on every request via lib/rbac.ts — a permission
      // change should take effect immediately, not wait for token refresh.
      if (user) {
        token.id = user.id;
        token.orgId = (user as { orgId: string }).orgId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.orgId = token.orgId as string;
      }
      return session;
    },
  },
};
