import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listUserFilms } from "@/lib/rbac";
import { CURRENT_FILM_COOKIE } from "@/lib/current-film";

// Plain GET + redirect, not a server action — the nav rail's film switcher
// (and /me's) needs to work from a server-rendered <a>, the same "real
// navigation over client state" tradeoff already made in
// me/film-switcher.tsx to sidestep a client-component staleness bug.
// This is the one mechanism both surfaces use, so switching film in
// either place moves the other.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const rawNext = req.nextUrl.searchParams.get("next") ?? "/me";
  // Open-redirect guard: only ever redirect within this app.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/me";

  const filmId = req.nextUrl.searchParams.get("filmId");
  const res = NextResponse.redirect(new URL(next, req.url));

  if (filmId) {
    // Re-validate server-side rather than trusting the query param — the
    // same defense-in-depth posture as every other write path in the app.
    const films = await listUserFilms(session.user.id);
    if (films.some((f) => f.filmId === filmId)) {
      res.cookies.set(CURRENT_FILM_COOKIE, filmId, {
        httpOnly: false,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
  }

  return res;
}
