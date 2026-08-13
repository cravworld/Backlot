// One-off generator for the static brand images Next.js's file-based
// metadata convention serves directly (src/app/apple-icon.png,
// opengraph-image.png, twitter-image.png). Not run at request time or
// build time — run manually (`node scripts/generate-brand-assets.mjs`)
// whenever the brand mark changes, then commit the resulting PNGs.
//
// Static files, not next/og's dynamic ImageResponse: next/og's bundled
// default-font loader is broken on Windows (constructs an invalid
// file:// URL from `import.meta.url`, 500s on every request,
// unconditionally, at module-import time — before ImageResponse's own
// `fonts` option ever gets a chance to matter). Calling `satori` and
// `@resvg/resvg-js` directly — the same two libraries next/og wraps —
// sidesteps that broken wrapper entirely and has zero runtime cost since
// these are static files, not a per-request route.
//
// Also sidesteps a second issue: rasterizing an SVG with fonts embedded
// as base64 @font-face data URIs (the "just build an SVG by hand"
// approach) doesn't reliably work — librsvg (what `sharp`'s SVG loader
// uses) has weak/inconsistent support for embedded-font @font-face in
// <style>, and silently falls back to a generic system font instead of
// erroring. satori avoids the question entirely: it does its own text
// shaping against the font bytes you hand it and emits actual vector
// path geometry, so by the time resvg rasterizes the SVG there's no font
// resolution left to do.

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(__dirname, "brand-fonts");
const OUT_DIR = path.join(__dirname, "..", "src", "app");

const regular = readFileSync(path.join(FONT_DIR, "ibm-plex-sans-regular.ttf"));
const bold = readFileSync(path.join(FONT_DIR, "ibm-plex-sans-bold.ttf"));
const fonts = [
  { name: "IBM Plex Sans", data: regular, weight: 400, style: "normal" },
  { name: "IBM Plex Sans", data: bold, weight: 700, style: "normal" },
];

// satori's element format: plain objects, not JSX (no React dependency
// needed for a one-off script). Every node needs `display: "flex"` or
// "none" explicitly — satori assumes nothing by default, same
// requirement as next/og's ImageResponse (which is satori underneath).
function el(type, props, ...children) {
  return { type, props: { ...props, children: children.flat() } };
}

const MARK_GRADIENT =
  "linear-gradient(135deg, #1e6e60 0%, #1e6e60 50%, #b8842e 50%, #b8842e 100%)";

async function renderPng(node, width, height, outPath) {
  const svg = await satori(node, { width, height, fonts });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();
  writeFileSync(outPath, png);
  console.log("wrote", path.relative(process.cwd(), outPath));
}

// --- apple-icon.png (180x180) — full-bleed, no pre-rounding; iOS masks
// apple-touch-icons into its own rounded-squircle shape itself. ---
const appleIconNode = el("div", {
  style: { width: "100%", height: "100%", display: "flex", background: MARK_GRADIENT },
});

// --- opengraph-image.png / twitter-image.png (1200x630) ---
const ogNode = el(
  "div",
  {
    style: {
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      background: "#f2f0e9",
      fontFamily: "IBM Plex Sans",
    },
  },
  el(
    "div",
    { style: { flex: 1, display: "flex", alignItems: "center", padding: "0 96px", gap: 48 } },
    el("div", {
      style: {
        width: 140,
        height: 140,
        flexShrink: 0,
        display: "flex",
        borderRadius: 24,
        background: MARK_GRADIENT,
      },
    }),
    el(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 20 } },
      el(
        "div",
        {
          style: {
            display: "flex",
            fontSize: 104,
            fontWeight: 700,
            letterSpacing: -2,
            color: "#191d22",
          },
        },
        "BACKLOT"
      ),
      el(
        "div",
        { style: { display: "flex", fontSize: 32, fontWeight: 400, color: "#4a5058" } },
        "Internal production management platform"
      )
    )
  ),
  // Four-color status-vocabulary strip, echoing the design system's
  // "spine" motif rather than inventing a new decorative element.
  el(
    "div",
    { style: { display: "flex", width: "100%", height: 16 } },
    el("div", { style: { display: "flex", flex: 1, background: "#1e6e60" } }),
    el("div", { style: { display: "flex", flex: 1, background: "#b8842e" } }),
    el("div", { style: { display: "flex", flex: 1, background: "#a8452f" } }),
    el("div", { style: { display: "flex", flex: 1, background: "#3c6e92" } })
  )
);

mkdirSync(OUT_DIR, { recursive: true });
await renderPng(appleIconNode, 180, 180, path.join(OUT_DIR, "apple-icon.png"));
await renderPng(ogNode, 1200, 630, path.join(OUT_DIR, "opengraph-image.png"));

// Twitter card reuses the identical image — no reason to render twice.
const ogPath = path.join(OUT_DIR, "opengraph-image.png");
const twitterPath = path.join(OUT_DIR, "twitter-image.png");
writeFileSync(twitterPath, readFileSync(ogPath));
console.log("wrote", path.relative(process.cwd(), twitterPath), "(copy of opengraph-image.png)");
