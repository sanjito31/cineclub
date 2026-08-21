import { requireRoomMemberApi, noStoreJson } from "@/app/api/rooms/[code]/member-request";
import {
  lookupWatchboxdMoviesByLetterboxdSlugs,
  MAXIMUM_LETTERBOXD_SLUGS,
} from "@/lib/data/watchboxd-room";
import { WatchboxdInputError } from "@/lib/watchboxd/core";

function readSlugs(value: string | null) {
  if (!value) return [];
  const slugs = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return [...new Set(slugs)].slice(0, MAXIMUM_LETTERBOXD_SLUGS);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const access = await requireRoomMemberApi((await params).code);
  if (!access.ok) return access.error;

  const url = new URL(request.url);
  const slugs = readSlugs(url.searchParams.get("slugs") ?? url.searchParams.get("slug"));
  if (slugs.length === 0) {
    return noStoreJson(
      { error: "Provide one or more Letterboxd movie slugs." },
      { status: 400 },
    );
  }

  try {
    const movies = await lookupWatchboxdMoviesByLetterboxdSlugs(slugs, request.signal);
    const pending = movies.some((movie) => movie.letterboxdMovieJobId);
    return noStoreJson(
      { movies },
      pending
        ? {
            status: 202,
            headers: { "Retry-After": "2" },
          }
        : undefined,
    );
  } catch (error) {
    if (error instanceof WatchboxdInputError) {
      return noStoreJson({ error: error.message }, { status: 400 });
    }
    return noStoreJson(
      { error: "Letterboxd movie details are unavailable right now." },
      { status: 503 },
    );
  }
}
