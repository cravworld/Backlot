import type { Config } from "tailwindcss";

// Backlot design system tokens, wired as CSS variables — never hardcode a hex
// in a component. See backlot-design-system.md for the rationale.
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: ["selector", '[data-theme="night"]'],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        "ink-soft": "var(--ink-soft)",
        paper: "var(--paper)",
        "paper-raised": "var(--paper-raised)",
        line: "var(--line)",
        slate: "var(--slate)",
        verdigris: "var(--verdigris)",
        "verdigris-ink": "var(--verdigris-ink)",
        ochre: "var(--ochre)",
        clay: "var(--clay)",
        sky: "var(--sky)",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        mal: ["var(--font-mal)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
      },
    },
  },
  plugins: [],
};

export default config;
