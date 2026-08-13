"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "backlot-theme";

// Day/night toggle per backlot-design-system.md: "let the user switch,
// and remember the choice per device" (localStorage, not account-level —
// this is about the physical conditions of a shoot day, not identity).
// Reads [data-theme="night"] on <html>, the convention already wired
// into globals.css and tailwind.config.ts's darkMode selector. A small
// blocking script in the root layout's <head> sets the attribute before
// first paint so there's no flash of the wrong theme; this component
// only needs to stay in sync with that after hydration.
export function ThemeToggle() {
  const [theme, setThemeState] = useState<"day" | "night">("day");

  useEffect(() => {
    setThemeState(document.documentElement.getAttribute("data-theme") === "night" ? "night" : "day");
  }, []);

  function setTheme(next: "day" | "night") {
    setThemeState(next);
    if (next === "night") {
      document.documentElement.setAttribute("data-theme", "night");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing / storage disabled — theme just won't persist
      // across reloads, not worth surfacing as an error.
    }
  }

  return (
    <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-ink-soft">
      <span className="hidden sm:inline">Shoot mode</span>
      <div className="flex rounded-full border border-line bg-paper-raised p-[3px]">
        <button
          type="button"
          onClick={() => setTheme("day")}
          aria-pressed={theme === "day"}
          className={`rounded-full px-3.5 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors ${
            theme === "day" ? "bg-ink text-paper" : "text-ink-soft"
          }`}
        >
          Day
        </button>
        <button
          type="button"
          onClick={() => setTheme("night")}
          aria-pressed={theme === "night"}
          className={`rounded-full px-3.5 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors ${
            theme === "night" ? "bg-ink text-paper" : "text-ink-soft"
          }`}
        >
          Night
        </button>
      </div>
    </div>
  );
}
