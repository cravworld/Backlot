import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";
import { LogoutButton } from "@/components/logout-button";

// Persistent top bar per backlot-style-guide.html's .topbar — brand mark
// left, day/night toggle + sign out right. Sits above the rail+content
// row, full width, on every authenticated page.
export function TopBar({ name }: { name?: string | null }) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-paper px-6 py-3">
      <Link href="/me" className="flex items-center gap-2.5">
        <div
          className="h-[22px] w-[22px] flex-shrink-0 rounded-[3px]"
          style={{
            background: "linear-gradient(135deg, var(--verdigris) 0 50%, var(--ochre) 50% 100%)",
          }}
        />
        <span className="font-display text-lg font-bold tracking-wide text-ink">BACKLOT</span>
      </Link>
      <div className="flex items-center gap-4">
        {name && <span className="hidden text-sm text-ink-soft sm:inline">{name}</span>}
        <ThemeToggle />
        <LogoutButton />
      </div>
    </header>
  );
}
