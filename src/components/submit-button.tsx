"use client";

import { useFormStatus } from "react-dom";

// Every mutation in this app is a real network round-trip to a
// cross-region Supabase instance, so the gap between click and result is
// real, not imagined. Without this, a slow response reads as "did that
// work?" and invites re-clicking — which is exactly what was happening.
// useFormStatus only sees the pending state of its nearest ancestor
// <form>, so this must be rendered as a child of the form it submits,
// not the component that renders the <form> tag itself.
export function SubmitButton({
  children,
  pendingText,
  className,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${className} disabled:opacity-60`}>
      {pending ? pendingText ?? "Saving…" : children}
    </button>
  );
}
