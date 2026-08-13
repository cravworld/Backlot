"use client";

import { signOut } from "next-auth/react";

export function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="rounded-sm border border-line px-3 py-1.5 text-sm text-ink transition-colors hover:border-ink-soft"
    >
      Sign out
    </button>
  );
}
