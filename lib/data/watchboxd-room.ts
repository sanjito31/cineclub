import "server-only";

import {
  addWatchedOverlapPageToIndex,
  addWatchedPageToIndex,
  applyLetterboxdMovieLookupToSuggestion,
  applyTmdbDetailsToOverlapSuggestion,
  collectRoomLetterboxdMembers,
  emptyWatchedIndex,
  limitOverlapSuggestions,
  MAXIMUM_WATCHED_PAGES,
  watchboxdMovieNeedsResolution,
  WATCHED_PAGE_SIZE,
  type LetterboxdMovieLookup,
  type OverlapSuggestion,
  type WatchedIndex,
  type WatchedMember,
} from "@/lib/domain/watchboxd-selection";
import { getTmdbMovie } from "@/lib/tmdb/client";
import {
  decodeWatchboxdMovie,
  decodeWatchboxdOverlapPage,
  decodeWatchboxdWatchedOverlapPage,
  decodeWatchboxdWatchedPage,
} from "@/lib/watchboxd/decode";
import {
  getWatchboxdMovie,
  getWatchboxdMovieByLetterboxdSlug,
  getWatchboxdOverlap,
  getWatchboxdWatchedOverlap,
  getWatchboxdWatchedHistory,
} from "@/lib/watchboxd/client";
import { WatchboxdInputError } from "@/lib/watchboxd/core";

export type MovieRatingLookup = {
  tmdbId: number;
  letterboxdRating: number | null;
  letterboxdRatingJobId: string | null;
  letterboxdUrl: string | null;
  letterboxdSlug: string | null;
  posterUrl: string | null;
};

export type { LetterboxdMovieLookup };

export const MAXIMUM_LETTERBOXD_SLUGS = 10;

export type RoomWatchboxdContext = {
  eligibleForOverlap: boolean;
  usernames: string[];
  watched: WatchedIndex;
  watchedPendingJobIds: string[];
  suggestions: OverlapSuggestion[];
  overlapStatus: "ready" | "pending" | "skipped" | "unavailable";
  overlapPendingJobIds: string[];
  overlapPagination: { page: number; pageSize: number; total: number; totalPages: number };
  retryAfter: number | null;
};

export type RoomOverlapSuggestionsPage = {
  eligibleForOverlap: boolean;
  usernames: string[];
  suggestions: OverlapSuggestion[];
  overlapStatus: "ready" | "pending" | "skipped" | "unavailable";
  overlapPendingJobIds: string[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  retryAfter: number | null;
};

function isPendingResult(
  result: { status: string },
): result is { status: "pending"; retryAfter: number; jobId: string | null } {
  return result.status === "pending";
}

async function loadWatchedPages(username: string, signal?: AbortSignal) {
  const first = await getWatchboxdWatchedHistory(username, decodeWatchboxdWatchedPage, {
    query: { page: "1", pageSize: String(WATCHED_PAGE_SIZE) },
    signal,
  });
  if (first.status !== "ready") return first;

  const pages = [first.data];
  const totalPages = Math.min(first.data.pagination.totalPages, MAXIMUM_WATCHED_PAGES);
  if (totalPages <= 1) return first;

  const remaining = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      getWatchboxdWatchedHistory(username, decodeWatchboxdWatchedPage, {
        query: {
          page: String(index + 2),
          pageSize: String(WATCHED_PAGE_SIZE),
        },
        signal,
      }),
    ),
  );

  for (const page of remaining) {
    if (page.status === "pending") return page;
    if (page.status === "ready") pages.push(page.data);
  }

  return {
    status: "ready" as const,
    data: {
      ...first.data,
      items: pages.flatMap((page) => page.items),
    },
  };
}

async function loadWatchedOverlapPages(
  usernames: readonly string[],
  signal?: AbortSignal,
) {
  const first = await getWatchboxdWatchedOverlap(
    usernames,
    decodeWatchboxdWatchedOverlapPage,
    {
      query: { page: "1", pageSize: String(WATCHED_PAGE_SIZE) },
      signal,
    },
  );
  if (first.status !== "ready") return first;

  const pages = [first.data];
  const totalPages = Math.min(first.data.pagination.totalPages, MAXIMUM_WATCHED_PAGES);
  if (totalPages <= 1) return first;

  const remaining = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      getWatchboxdWatchedOverlap(
        usernames,
        decodeWatchboxdWatchedOverlapPage,
        {
          query: {
            page: String(index + 2),
            pageSize: String(WATCHED_PAGE_SIZE),
          },
          signal,
        },
      ),
    ),
  );

  for (const page of remaining) {
    if (page.status === "pending") return page;
    if (page.status === "ready") pages.push(page.data);
  }

  return {
    status: "ready" as const,
    data: {
      ...first.data,
      films: pages.flatMap((page) => page.films),
    },
  };
}

export async function lookupWatchboxdMovies(
  tmdbIds: readonly number[],
  signal?: AbortSignal,
): Promise<MovieRatingLookup[]> {
  const uniqueIds = [...new Set(tmdbIds.filter((tmdbId) => Number.isSafeInteger(tmdbId) && tmdbId > 0))];
  const lookups = await Promise.all(
    uniqueIds.map(async (tmdbId) => {
      try {
        const result = await getWatchboxdMovie(tmdbId, decodeWatchboxdMovie, { signal });
        if (result.status === "ready") {
          return {
            tmdbId,
            letterboxdRating: result.data.letterboxdRating,
            letterboxdRatingJobId: null,
            letterboxdUrl: result.data.letterboxdUrl,
            letterboxdSlug: result.data.letterboxdSlug,
            posterUrl: result.data.posterUrl,
          } satisfies MovieRatingLookup;
        }
        if (result.status === "pending") {
          return {
            tmdbId,
            letterboxdRating: null,
            letterboxdRatingJobId: result.jobId,
            letterboxdUrl: null,
            letterboxdSlug: null,
            posterUrl: null,
          } satisfies MovieRatingLookup;
        }
        return {
          tmdbId,
          letterboxdRating: null,
          letterboxdRatingJobId: null,
          letterboxdUrl: null,
          letterboxdSlug: null,
          posterUrl: null,
        } satisfies MovieRatingLookup;
      } catch {
        return {
          tmdbId,
          letterboxdRating: null,
          letterboxdRatingJobId: null,
          letterboxdUrl: null,
          letterboxdSlug: null,
          posterUrl: null,
        } satisfies MovieRatingLookup;
      }
    }),
  );

  return lookups;
}

export async function lookupRoomWatchedIndex(input: {
  participants: readonly {
    userId: string;
    letterboxdUsernameSnapshot?: string | null;
    user?: { displayName?: string | null; letterboxdUsername?: string | null };
  }[];
  currentUserId: string;
  tmdbIds: readonly number[];
  signal?: AbortSignal;
}): Promise<WatchedIndex> {
  const watched = emptyWatchedIndex();
  const members = collectRoomLetterboxdMembers(input.participants);
  const tmdbIds = [...new Set(
    input.tmdbIds.filter((tmdbId) => Number.isSafeInteger(tmdbId) && tmdbId > 0),
  )];
  if (members.length === 0 || tmdbIds.length === 0) return watched;

  if (members.length >= 2) {
    const usernames = members.map((member) => member.letterboxdUsername);
    const results = await Promise.all(
      tmdbIds.map(async (tmdbId) => {
        try {
          return await getWatchboxdWatchedOverlap(
            usernames,
            decodeWatchboxdWatchedOverlapPage,
            {
              query: { tmdbId: String(tmdbId), page: "1", pageSize: "1" },
              signal: input.signal,
            },
          );
        } catch {
          return null;
        }
      }),
    );
    for (const result of results) {
      if (result?.status !== "ready") continue;
      addWatchedOverlapPageToIndex(
        watched,
        result.data,
        members,
        input.currentUserId,
      );
    }
    return watched;
  }

  const member = members[0];
  const results = await Promise.all(
    tmdbIds.map(async (tmdbId) => {
      try {
        return await getWatchboxdWatchedHistory(
          member.letterboxdUsername,
          decodeWatchboxdWatchedPage,
          {
            query: { tmdbId: String(tmdbId), page: "1", pageSize: "1" },
            signal: input.signal,
          },
        );
      } catch {
        return null;
      }
    }),
  );
  const watchedMember: WatchedMember = {
    userId: member.userId,
    displayName: member.displayName,
    avatarUrl: null,
    isCurrentUser: true,
  };
  for (const result of results) {
    if (result?.status !== "ready") continue;
    addWatchedPageToIndex(watched, result.data, watchedMember);
  }
  return watched;
}

async function tmdbSnapshotForId(tmdbId: number | null, signal?: AbortSignal) {
  if (!tmdbId) return null;
  try {
    const movie = await getTmdbMovie(tmdbId, { signal });
    return {
      overview: movie.overview,
      voteAverage: movie.voteAverage,
      posterPath: movie.posterPath,
    };
  } catch {
    return null;
  }
}

function emptyLetterboxdMovieLookup(
  letterboxdSlug: string,
  extras: Partial<LetterboxdMovieLookup> = {},
): LetterboxdMovieLookup {
  return {
    letterboxdSlug,
    tmdbId: extras.tmdbId ?? null,
    title: extras.title ?? null,
    year: extras.year ?? null,
    letterboxdRating: extras.letterboxdRating ?? null,
    letterboxdUrl: extras.letterboxdUrl ?? null,
    posterUrl: extras.posterUrl ?? null,
    letterboxdMovieJobId: extras.letterboxdMovieJobId ?? null,
    overview: extras.overview ?? null,
    tmdbRating: extras.tmdbRating ?? null,
    posterPath: extras.posterPath ?? null,
  };
}

export async function lookupWatchboxdMoviesByLetterboxdSlugs(
  slugs: readonly string[],
  signal?: AbortSignal,
): Promise<LetterboxdMovieLookup[]> {
  const uniqueSlugs = [...new Set(
    slugs.map((slug) => slug.trim()).filter(Boolean),
  )].slice(0, MAXIMUM_LETTERBOXD_SLUGS);

  return Promise.all(
    uniqueSlugs.map(async (letterboxdSlug) => {
      try {
        const result = await getWatchboxdMovieByLetterboxdSlug(
          letterboxdSlug,
          decodeWatchboxdMovie,
          { signal },
        );
        if (result.status === "pending") {
          return emptyLetterboxdMovieLookup(letterboxdSlug, {
            letterboxdMovieJobId: result.jobId,
          });
        }
        if (result.status !== "ready") {
          return emptyLetterboxdMovieLookup(letterboxdSlug);
        }

        const tmdb = await tmdbSnapshotForId(result.data.tmdbId, signal);
        return emptyLetterboxdMovieLookup(letterboxdSlug, {
          tmdbId: result.data.tmdbId,
          title: result.data.title,
          year: result.data.year,
          letterboxdRating: result.data.letterboxdRating,
          letterboxdUrl: result.data.letterboxdUrl,
          posterUrl: result.data.posterUrl,
          overview: tmdb?.overview ?? null,
          tmdbRating: tmdb?.voteAverage ?? null,
          posterPath: tmdb?.posterPath ?? null,
        });
      } catch {
        return emptyLetterboxdMovieLookup(letterboxdSlug);
      }
    }),
  );
}

async function hydrateOverlapSuggestions(
  suggestions: OverlapSuggestion[],
  signal?: AbortSignal,
): Promise<OverlapSuggestion[]> {
  const pendingSlugs = suggestions.flatMap((suggestion) => (
    watchboxdMovieNeedsResolution(suggestion) && suggestion.letterboxdSlug
      ? [suggestion.letterboxdSlug]
      : []
  ));
  const lookups = pendingSlugs.length > 0
    ? await lookupWatchboxdMoviesByLetterboxdSlugs(pendingSlugs, signal)
    : [];
  const lookupBySlug = new Map(
    lookups.map((lookup) => [lookup.letterboxdSlug.toLowerCase(), lookup]),
  );

  const withLetterboxd = suggestions.map((suggestion) => {
    const slug = suggestion.letterboxdSlug?.toLowerCase();
    const lookup = slug ? lookupBySlug.get(slug) : undefined;
    return lookup
      ? applyLetterboxdMovieLookupToSuggestion(suggestion, lookup)
      : suggestion;
  });

  return Promise.all(
    withLetterboxd.map(async (suggestion) => {
      if (!suggestion.tmdbId || suggestion.overview || suggestion.tmdbRating != null) {
        return suggestion;
      }
      const tmdb = await tmdbSnapshotForId(suggestion.tmdbId, signal);
      return applyTmdbDetailsToOverlapSuggestion(suggestion, tmdb);
    }),
  );
}

export async function loadRoomOverlapSuggestionsPage(input: {
  participants: readonly {
    userId: string;
    letterboxdUsernameSnapshot?: string | null;
    user?: { displayName?: string | null; letterboxdUsername?: string | null };
  }[];
  page?: number;
  letterboxdRatingMin?: number | null;
  yearMin?: number | null;
  yearMax?: number | null;
  signal?: AbortSignal;
}): Promise<RoomOverlapSuggestionsPage> {
  const usernames = collectRoomLetterboxdMembers(input.participants)
    .map((member) => member.letterboxdUsername);
  const page = input.page ?? 1;
  const emptyPagination = { page, pageSize: 10, total: 0, totalPages: 0 };
  if (usernames.length < 2) {
    return {
      eligibleForOverlap: false,
      usernames,
      suggestions: [],
      overlapStatus: "skipped",
      overlapPendingJobIds: [],
      pagination: emptyPagination,
      retryAfter: null,
    };
  }

  const query: Record<string, string> = {
    page: String(page),
    pageSize: "10",
    includeMetadata: "true",
  };
  if (input.letterboxdRatingMin != null) {
    query.letterboxdRatingMin = String(input.letterboxdRatingMin);
  }
  if (input.yearMin != null) query.releaseDateFrom = `${input.yearMin}-01-01`;
  if (input.yearMax != null) query.releaseDateTo = `${input.yearMax}-12-31`;

  try {
    const overlap = await getWatchboxdOverlap(usernames, decodeWatchboxdOverlapPage, {
      query,
      signal: input.signal,
    });
    if (overlap.status === "pending") {
      return {
        eligibleForOverlap: true,
        usernames,
        suggestions: [],
        overlapStatus: "pending",
        overlapPendingJobIds: overlap.jobId ? [overlap.jobId] : [],
        pagination: emptyPagination,
        retryAfter: overlap.retryAfter,
      };
    }
    if (overlap.status === "ready") {
      return {
        eligibleForOverlap: true,
        usernames,
        suggestions: await hydrateOverlapSuggestions(
          limitOverlapSuggestions(overlap.data.films),
          input.signal,
        ),
        overlapStatus: "ready",
        overlapPendingJobIds: [],
        pagination: overlap.data.pagination,
        retryAfter: null,
      };
    }
  } catch (error) {
    if (error instanceof WatchboxdInputError) throw error;
  }

  return {
    eligibleForOverlap: true,
    usernames,
    suggestions: [],
    overlapStatus: "unavailable",
    overlapPendingJobIds: [],
    pagination: emptyPagination,
    retryAfter: null,
  };
}

export async function loadRoomWatchboxdContext(input: {
  participants: readonly {
    userId: string;
    letterboxdUsernameSnapshot?: string | null;
    user?: { displayName?: string | null; letterboxdUsername?: string | null };
  }[];
  currentUserId: string;
  signal?: AbortSignal;
}): Promise<RoomWatchboxdContext> {
  const members = collectRoomLetterboxdMembers(input.participants);
  const usernames = members.map((member) => member.letterboxdUsername);
  const watched = emptyWatchedIndex();
  const watchedPendingJobIds: string[] = [];
  let retryAfter: number | null = null;

  if (members.length >= 2) {
    try {
      const result = await loadWatchedOverlapPages(usernames, input.signal);
      if (isPendingResult(result)) {
        if (result.jobId) watchedPendingJobIds.push(result.jobId);
        retryAfter = Math.max(retryAfter ?? 0, result.retryAfter);
      } else if (result.status === "ready") {
        addWatchedOverlapPageToIndex(
          watched,
          result.data,
          members,
          input.currentUserId,
        );
      }
    } catch {
      // Watched history is warning-only context; watchlist overlap can still load.
    }
  } else if (members.length === 1) {
    const member = members[0];
    try {
      const result = await loadWatchedPages(member.letterboxdUsername, input.signal);
      if (isPendingResult(result)) {
        if (result.jobId) watchedPendingJobIds.push(result.jobId);
        retryAfter = Math.max(retryAfter ?? 0, result.retryAfter);
      } else if (result.status === "ready") {
        const watchedMember: WatchedMember = {
          userId: member.userId,
          displayName: member.displayName,
          avatarUrl: result.data.user?.avatarUrl ?? null,
          isCurrentUser: member.userId === input.currentUserId,
        };
        addWatchedPageToIndex(watched, result.data, watchedMember);
      }
    } catch {
      // Watched history is warning-only context.
    }
  }

  const overlap = await loadRoomOverlapSuggestionsPage({
    participants: input.participants,
    signal: input.signal,
  });
  return {
    eligibleForOverlap: overlap.eligibleForOverlap,
    usernames,
    watched,
    watchedPendingJobIds,
    suggestions: overlap.suggestions,
    overlapStatus: overlap.overlapStatus,
    overlapPendingJobIds: overlap.overlapPendingJobIds,
    overlapPagination: overlap.pagination,
    retryAfter: Math.max(retryAfter ?? 0, overlap.retryAfter ?? 0) || null,
  };
}
