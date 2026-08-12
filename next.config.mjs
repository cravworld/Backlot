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
  },
};

export default nextConfig;
