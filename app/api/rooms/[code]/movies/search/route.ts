import { noStoreJson, requireRoomMemberApi } from "@/app/api/rooms/[code]/member-request";
import { toRoomSelectionMovies } from "@/app/api/rooms/[code]/movies/room-selection-movies";
import { AuthorizationError, DomainError } from "@/lib/auth/errors";
import {
  MAXIMUM_SEARCH_PAGE,
  normalizeSearchPage,
  paginateTmdbSearchPage,
  searchTmdbMovies,
  tmdbPageForSearchPage,
  TmdbServiceError,
} from "@/lib/tmdb/client";

function readPage(value: string | null) {
  if (value === null) return 1;
  if (!/^\d+$/.test(value)) return null;
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 && page <= MAXIMUM_SEARCH_PAGE
    ? page
    : null;
}

function tmdbErrorResponse(error: TmdbServiceError) {
  const status =
    error.code === "invalid_query"
      ? 400
      : error.code === "timeout"
        ? 504
        : error.code === "aborted"
          ? 408
          : error.code === "configuration"
            ? 503
            : 502;
  const headers = error.retryAfter
    ? { "Retry-After": String(error.retryAfter) }
    : undefined;

  const message = error.code === "invalid_query"
    ? error.message
    : error.code === "timeout"
      ? "Movie search took too long. Please try again."
      : error.code === "aborted"
        ? "Movie search was cancelled."
        : "Movie search is unavailable right now.";

  return noStoreJson({ error: message, code: error.code }, { status, headers });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const access = await requireRoomMemberApi((await params).code);
  if (!access.ok) {
    if (access.error.status === 401) {
      return noStoreJson(
        { error: "Sign in before searching for movies." },
        { status: 401 },
      );
    }
    return access.error;
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const page = readPage(url.searchParams.get("page"));
  if (page === null) {
    return noStoreJson(
      { error: `Movie search pages must be integers between 1 and ${MAXIMUM_SEARCH_PAGE}.` },
      { status: 400 },
    );
  }

  try {
    const searchPage = normalizeSearchPage(page);
    const tmdbPage = await searchTmdbMovies(query, {
      page: tmdbPageForSearchPage(searchPage),
      signal: request.signal,
    });
    const paginated = paginateTmdbSearchPage(tmdbPage, searchPage);
    const results = await toRoomSelectionMovies({
      roomId: access.room.id,
      participants: access.room.participants,
      currentUserId: access.user.id,
      movies: paginated.results,
      signal: request.signal,
    });

    return noStoreJson({
      results,
      suggestions: [],
      page: paginated.page,
      totalPages: paginated.totalPages,
      totalResults: paginated.totalResults,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return noStoreJson({ error: error.message }, { status: 403 });
    }
    if (error instanceof DomainError) {
      return noStoreJson({ error: error.message }, { status: 404 });
    }
    if (error instanceof TmdbServiceError) {
      return tmdbErrorResponse(error);
    }
    return noStoreJson(
      { error: "Unable to search for movies right now." },
      { status: 500 },
    );
  }
}
