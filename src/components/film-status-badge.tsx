import type { FilmStatus } from "@prisma/client";

// Four-color status vocabulary from the design system, applied to film
// lifecycle: SHOOT is the "on track / active" state (verdigris), POST is
// ongoing work that still needs attention (ochre), everything else —
// PREP, WRAPPED, ARCHIVED — is a neutral/informational state (sky).
// Never introduce a fifth color; see backlot-design-system.md.
const STATUS_STYLE: Record<FilmStatus, { color: string; label: string }> = {
  PREP: { color: "var(--sky)", label: "Prep" },
  SHOOT: { color: "var(--verdigris)", label: "Shoot" },
  POST: { color: "var(--ochre)", label: "Post" },
  WRAPPED: { color: "var(--sky)", label: "Wrapped" },
  ARCHIVED: { color: "var(--sky)", label: "Archived" },
};

export function FilmStatusBadge({ status }: { status: FilmStatus }) {
  const { color, label } = STATUS_STYLE[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
