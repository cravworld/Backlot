/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Next's client Router Cache otherwise keeps a dynamic route's
    // previously-rendered RSC payload for ~30s and can reuse it across a
    // navigation that only changes search params — e.g. the /me film
    // switcher briefly showing stale highlight state after a switch.
    // Every page here reads a live session/DB state, so it should never
    // serve a cached client-side render. See
    // https://nextjs.org/docs/app/api-reference/next-config-js/staleTimes
    staleTimes: {
      dynamic: 0,
    },
    // Server Actions default to a 1MB request body — fine for every form
    // so far, but the document store's upload form posts a file through a
    // Server Action too (kept consistent with every other form in the
    // app rather than splitting uploads off to a separate REST endpoint).
    // Downloads still go through a Route Handler (src/app/api/media) since
    // a Server Action can't stream bytes back.
    serverActions: {
      bodySizeLimit: "20mb",
    },
    // Vercel's serverless build only bundles files it can trace through
    // static imports/requires — a font read via fs.readFileSync(path...)
    // for the bilingual call sheet PDF (lib/pdf/call-sheet-pdf.tsx) isn't
    // reliably picked up by that tracing on its own. Without this, the
    // Malayalam font works in local dev (real filesystem, no tracing step)
    // and then 404s/ENOENTs in production — exactly the "worked in
    // testing, broke in prod" gap this project has hit before. Scoped to
    // the one route that actually renders a PDF, not every route.
    outputFileTracingIncludes: {
      "/films/[id]/callsheet-ops/[dayId]": ["./src/lib/pdf/fonts/**"],
    },
  },
};

export default nextConfig;
