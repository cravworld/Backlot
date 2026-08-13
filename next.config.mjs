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
  },
};

export default nextConfig;
