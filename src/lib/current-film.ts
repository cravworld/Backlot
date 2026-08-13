import { cookies } from "next/headers";
import { listUserFilms, type FilmSummary } from "@/lib/rbac";

export const CURRENT_FILM_COOKIE = "backlot_film";

/**
 * Resolves which film the nav rail's module tabs (and /me's detail view)
 * should resolve against. Deliberately NOT stored in the session/JWT —
 * same "always a fresh read" posture as the rest of rbac.ts, so switching
 * films takes effect on the next request rather than waiting for a token
 * refresh.
 *
 * Falls back to the user's first active assignment if no cookie is set
 * yet, or if the cookie names a film the user is no longer actively
 * assigned to (switched account in the same browser, assignment ended).
 * Returns null only when the user has zero active film assignments —
 * the nav rail's empty state.
 */
export async function getCurrentFilm(
  userId: string,
  films?: FilmSummary[]
): Promise<FilmSummary | null> {
  const list = films ?? (await listUserFilms(userId));
  if (list.length === 0) return null;

  const requested = cookies().get(CURRENT_FILM_COOKIE)?.value;
  return list.find((f) => f.filmId === requested) ?? list[0];
}
