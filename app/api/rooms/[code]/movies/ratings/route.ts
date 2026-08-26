import { requireRoomMemberApi, noStoreJson } from "@/app/api/rooms/[code]/member-request";
import { lookupWatchboxdMovies } from "@/lib/data/watchboxd-room";

const MAXIMUM_RATING_IDS = 20;

function readTmdbIds(value: string | null) {
  if (!value) return [];
  const ids = value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((tmdbId) => Number.isSafeInteger(tmdbId) && tmdbId > 0);
  return [...new Set(ids)].slice(0, MAXIMUM_RATING_IDS);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const access = await requireRoomMemberApi((await params).code);
  if (!access.ok) return access.error;

  const url = new URL(request.url);
  const tmdbIds = readTmdbIds(
    url.searchParams.get("tmdbIds") ?? url.searchParams.get("tmdbId"),
  );
  if (tmdbIds.length === 0) {
    return noStoreJson(
      { error: "Provide one or more valid movie IDs." },
      { status: 400 },
    );
  }

  try {
    const ratings = await lookupWatchboxdMovies(tmdbIds, request.signal);
    return noStoreJson({ ratings });
  } catch {
    return noStoreJson(
      { error: "Letterboxd ratings are unavailable right now." },
      { status: 503 },
    );
  }
}
