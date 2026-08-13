"use client";

import { signOut } from "next-auth/react";

export function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="rounded-sm border border-line px-4 py-2 text-base text-ink transition-colors hover:border-ink-soft"
    >
      Sign out
    </button>
  );
}
