import "server-only";

import {
  addWatchedPageToIndex,
  collectRoomLetterboxdMembers,
  emptyWatchedIndex,
  limitOverlapSuggestions,
  MAXIMUM_WATCHED_PAGES,
  WATCHED_PAGE_SIZE,
  type OverlapSuggestion,
  type WatchedIndex,
  type WatchedMember,
} from "@/lib/domain/watchboxd-selection";
import {
  decodeWatchboxdMovie,
  decodeWatchboxdOverlapPage,
  decodeWatchboxdWatchedPage,
} from "@/lib/watchboxd/decode";
import {
  getWatchboxdMovie,
  getWatchboxdOverlap,
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

export type RoomWatchboxdContext = {
  eligibleForOverlap: boolean;
  usernames: string[];
  watched: WatchedIndex;
  watchedPendingJobIds: string[];
  suggestions: OverlapSuggestion[];
  overlapStatus: "ready" | "pending" | "skipped" | "unavailable";
  overlapPendingJobIds: string[];
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

  const watchedResults = await Promise.all(
    members.map(async (member) => {
      try {
        const result = await loadWatchedPages(member.letterboxdUsername, input.signal);
        return { member, result };
      } catch {
        return {
          member,
          result: {
            status: "unavailable" as const,
            reason: "network_error" as const,
          },
        };
      }
    }),
  );

  for (const { member, result } of watchedResults) {
    if (isPendingResult(result)) {
      if (result.jobId) watchedPendingJobIds.push(result.jobId);
      retryAfter = Math.max(retryAfter ?? 0, result.retryAfter);
      continue;
    }
    if (result.status !== "ready") continue;

    const watchedMember: WatchedMember = {
      userId: member.userId,
      displayName: member.displayName,
      avatarUrl: result.data.user?.avatarUrl ?? null,
      isCurrentUser: member.userId === input.currentUserId,
    };
    addWatchedPageToIndex(watched, result.data, watchedMember);
  }

  const eligibleForOverlap = usernames.length >= 2;
  if (!eligibleForOverlap) {
    return {
      eligibleForOverlap,
      usernames,
      watched,
      watchedPendingJobIds,
      suggestions: [],
      overlapStatus: "skipped",
      overlapPendingJobIds: [],
      retryAfter,
    };
  }

  try {
    const overlap = await getWatchboxdOverlap(usernames, decodeWatchboxdOverlapPage, {
      query: { page: "1", pageSize: "10" },
      signal: input.signal,
    });
    if (overlap.status === "pending") {
      return {
        eligibleForOverlap,
        usernames,
        watched,
        watchedPendingJobIds,
        suggestions: [],
        overlapStatus: "pending",
        overlapPendingJobIds: overlap.jobId ? [overlap.jobId] : [],
        retryAfter: Math.max(retryAfter ?? 0, overlap.retryAfter) || overlap.retryAfter,
      };
    }
    if (overlap.status === "ready") {
      return {
        eligibleForOverlap,
        usernames,
        watched,
        watchedPendingJobIds,
        suggestions: limitOverlapSuggestions(overlap.data.films),
        overlapStatus: "ready",
        overlapPendingJobIds: [],
        retryAfter,
      };
    }
  } catch (error) {
    if (!(error instanceof WatchboxdInputError)) {
      return {
        eligibleForOverlap,
        usernames,
        watched,
        watchedPendingJobIds,
        suggestions: [],
        overlapStatus: "unavailable",
        overlapPendingJobIds: [],
        retryAfter,
      };
    }
  }

  return {
    eligibleForOverlap,
    usernames,
    watched,
    watchedPendingJobIds,
    suggestions: [],
    overlapStatus: "unavailable",
    overlapPendingJobIds: [],
    retryAfter,
  };
}
