import { normalizeLetterboxdUsername } from "@/lib/validation/shared";
import type {
  WatchboxdCollectionPage,
  WatchboxdOverlapFilm,
  WatchboxdWatchedOverlapPage,
  WatchboxdWatchedItem,
} from "@/lib/watchboxd/decode";

export const OVERLAP_SUGGESTION_LIMIT = 10;
export const MAXIMUM_WATCHED_PAGES = 8;
export const WATCHED_PAGE_SIZE = 100;

export type RoomLetterboxdMember = {
  userId: string;
  displayName: string;
  letterboxdUsername: string;
};

export type WatchedMember = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  isCurrentUser: boolean;
};

export type WatchedIndex = {
  byTmdbId: Record<string, WatchedMember[]>;
  bySlug: Record<string, WatchedMember[]>;
  byTitleYear: Record<string, WatchedMember[]>;
};

export type OverlapSuggestion = {
  tmdbId: number | null;
  title: string;
  releaseYear: number | null;
  posterUrl: string | null;
  posterPath: string | null;
  overview: string | null;
  tmdbRating: number | null;
  letterboxdRating: number | null;
  letterboxdUrl: string;
  letterboxdSlug: string | null;
  letterboxdMovieJobId: string | null;
  overlapCount: number | null;
  runtimeMinutes: number | null;
  presentFor: OverlapUser[];
};

export type OverlapSuggestionSort = "rating" | "runtime" | "year" | "alphabetical";

export type OverlapSuggestionFilters = {
  ratingMin?: number | null;
  ratingMax?: number | null;
  yearMin?: number | null;
  yearMax?: number | null;
  usernames?: readonly string[];
};

export type OverlapUser = {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type TmdbMovieSnapshot = {
  overview: string | null;
  voteAverage: number | null;
  posterPath: string | null;
};

export type LetterboxdMovieLookup = {
  letterboxdSlug: string;
  tmdbId: number | null;
  title: string | null;
  year: number | null;
  letterboxdRating: number | null;
  letterboxdUrl: string | null;
  posterUrl: string | null;
  letterboxdMovieJobId: string | null;
  overview: string | null;
  tmdbRating: number | null;
  posterPath: string | null;
};

export function watchboxdMovieNeedsResolution(movie: {
  tmdbId: number | null;
  letterboxdSlug?: string | null;
  resolutionStatus?: string | null;
}) {
  if (movie.tmdbId != null || !movie.letterboxdSlug) return false;
  const status = movie.resolutionStatus?.trim().toLowerCase();
  return status !== "failed";
}

export function overlapSuggestionFromFilm(
  film: WatchboxdOverlapFilm,
): OverlapSuggestion | null {
  if (!film.letterboxdUrl) return null;
  const status = film.resolutionStatus?.trim().toLowerCase();
  if (status === "failed") return null;

  return {
    tmdbId: film.tmdbId,
    title: film.title,
    releaseYear: film.year,
    posterUrl: film.posterUrl,
    posterPath: null,
    overview: null,
    tmdbRating: null,
    letterboxdRating: film.letterboxdRating,
    letterboxdUrl: film.letterboxdUrl,
    letterboxdSlug: film.letterboxdSlug,
    letterboxdMovieJobId: null,
    overlapCount: film.overlapCount,
    runtimeMinutes: film.runtimeMinutes,
    presentFor: film.presentFor.map((user) => ({
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    })),
  };
}

export function filterAndSortOverlapSuggestions(
  suggestions: readonly OverlapSuggestion[],
  sort: OverlapSuggestionSort,
  filters: OverlapSuggestionFilters,
) {
  const usernames = new Set(
    (filters.usernames ?? []).map((username) => username.toLowerCase()),
  );
  const filtered = suggestions.filter((suggestion) => {
    if (
      filters.ratingMin != null
      && (suggestion.letterboxdRating == null || suggestion.letterboxdRating < filters.ratingMin)
    ) return false;
    if (
      filters.ratingMax != null
      && (suggestion.letterboxdRating == null || suggestion.letterboxdRating > filters.ratingMax)
    ) return false;
    if (
      filters.yearMin != null
      && (suggestion.releaseYear == null || suggestion.releaseYear < filters.yearMin)
    ) return false;
    if (
      filters.yearMax != null
      && (suggestion.releaseYear == null || suggestion.releaseYear > filters.yearMax)
    ) return false;
    if (usernames.size > 0) {
      const present = new Set(suggestion.presentFor.map((user) => user.username.toLowerCase()));
      if ([...usernames].some((username) => !present.has(username))) return false;
    }
    return true;
  });

  const nullLastDescending = (left: number | null, right: number | null) => {
    if (left == null) return right == null ? 0 : 1;
    if (right == null) return -1;
    return right - left;
  };
  const nullLastAscending = (left: number | null, right: number | null) => {
    if (left == null) return right == null ? 0 : 1;
    if (right == null) return -1;
    return left - right;
  };

  return [...filtered].sort((left, right) => {
    const overlapOrder = nullLastDescending(left.overlapCount, right.overlapCount);
    if (overlapOrder !== 0) return overlapOrder;

    let withinGroupOrder = 0;
    if (sort === "rating") {
      withinGroupOrder = nullLastDescending(left.letterboxdRating, right.letterboxdRating);
    } else if (sort === "runtime") {
      withinGroupOrder = nullLastAscending(left.runtimeMinutes, right.runtimeMinutes);
    } else if (sort === "year") {
      withinGroupOrder = nullLastDescending(left.releaseYear, right.releaseYear);
    } else {
      withinGroupOrder = left.title.localeCompare(right.title);
    }
    return withinGroupOrder || left.title.localeCompare(right.title);
  });
}

export function applyTmdbDetailsToOverlapSuggestion(
  suggestion: OverlapSuggestion,
  tmdb: TmdbMovieSnapshot | null | undefined,
): OverlapSuggestion {
  if (!tmdb) return suggestion;
  return {
    ...suggestion,
    overview: tmdb.overview ?? suggestion.overview,
    tmdbRating: tmdb.voteAverage ?? suggestion.tmdbRating,
    posterPath: tmdb.posterPath ?? suggestion.posterPath,
  };
}

export function applyLetterboxdMovieLookupToSuggestion(
  suggestion: OverlapSuggestion,
  lookup: LetterboxdMovieLookup,
): OverlapSuggestion {
  const suggestionSlug = suggestion.letterboxdSlug?.toLowerCase() ?? null;
  const lookupSlug = lookup.letterboxdSlug.toLowerCase();
  if (!suggestionSlug || suggestionSlug !== lookupSlug) return suggestion;

  const pending = Boolean(lookup.letterboxdMovieJobId);
  return {
    ...suggestion,
    tmdbId: lookup.tmdbId ?? suggestion.tmdbId,
    title: lookup.title?.trim() || suggestion.title,
    releaseYear: lookup.year ?? suggestion.releaseYear,
    posterUrl: lookup.posterUrl ?? suggestion.posterUrl,
    posterPath: lookup.posterPath ?? suggestion.posterPath,
    overview: pending ? suggestion.overview : lookup.overview ?? suggestion.overview,
    tmdbRating: pending ? suggestion.tmdbRating : lookup.tmdbRating ?? suggestion.tmdbRating,
    letterboxdRating: pending ? suggestion.letterboxdRating : lookup.letterboxdRating ?? suggestion.letterboxdRating,
    letterboxdUrl: lookup.letterboxdUrl ?? suggestion.letterboxdUrl,
    letterboxdSlug: lookup.letterboxdSlug || suggestion.letterboxdSlug,
    letterboxdMovieJobId: lookup.letterboxdMovieJobId,
  };
}

export function mergeOverlapSuggestion(
  incoming: OverlapSuggestion,
  existing: OverlapSuggestion | undefined,
): OverlapSuggestion {
  if (!existing) return incoming;
  const tmdbId = incoming.tmdbId ?? existing.tmdbId;
  return {
    ...incoming,
    tmdbId,
    posterUrl: incoming.posterUrl ?? existing.posterUrl,
    posterPath: incoming.posterPath ?? existing.posterPath,
    overview: incoming.overview ?? existing.overview,
    tmdbRating: incoming.tmdbRating ?? existing.tmdbRating,
    letterboxdRating: incoming.letterboxdRating ?? existing.letterboxdRating,
    runtimeMinutes: incoming.runtimeMinutes ?? existing.runtimeMinutes,
    letterboxdMovieJobId: tmdbId ? null : incoming.letterboxdMovieJobId ?? existing.letterboxdMovieJobId,
  };
}

export function letterboxdUsernameForParticipant(participant: {
  letterboxdUsernameSnapshot?: string | null;
  user?: { letterboxdUsername?: string | null };
}) {
  return normalizeLetterboxdUsername(
    participant.letterboxdUsernameSnapshot
      ?? participant.user?.letterboxdUsername
      ?? null,
  );
}

export function collectRoomLetterboxdMembers(
  participants: readonly {
    userId: string;
    letterboxdUsernameSnapshot?: string | null;
    user?: { displayName?: string | null; letterboxdUsername?: string | null };
  }[],
): RoomLetterboxdMember[] {
  const members: RoomLetterboxdMember[] = [];
  const seen = new Set<string>();

  for (const participant of participants) {
    const letterboxdUsername = letterboxdUsernameForParticipant(participant);
    if (!letterboxdUsername) continue;
    const key = letterboxdUsername.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    members.push({
      userId: participant.userId,
      displayName: participant.user?.displayName?.trim() || letterboxdUsername,
      letterboxdUsername,
    });
    if (members.length === 10) break;
  }

  return members;
}

function appendWatchedMember(
  index: Record<string, WatchedMember[]>,
  key: string,
  member: WatchedMember,
) {
  const existing = index[key] ?? [];
  if (existing.some((candidate) => candidate.userId === member.userId)) {
    index[key] = existing;
    return;
  }
  index[key] = [...existing, member];
}

export function emptyWatchedIndex(): WatchedIndex {
  return { byTmdbId: {}, bySlug: {}, byTitleYear: {} };
}

export function movieTitleKey(title: string | null | undefined) {
  if (!title) return null;
  const normalized = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return normalized || null;
}

export function movieTitleYearKey(
  title: string | null | undefined,
  year: number | null | undefined,
) {
  const normalizedTitle = movieTitleKey(title);
  if (!normalizedTitle || year == null || !Number.isInteger(year)) return null;
  return `${normalizedTitle}|${year}`;
}

export function addWatchedPageToIndex(
  index: WatchedIndex,
  page: WatchboxdCollectionPage<WatchboxdWatchedItem>,
  member: WatchedMember,
) {
  const avatarUrl = member.avatarUrl ?? page.user?.avatarUrl ?? null;
  const watchedMember = { ...member, avatarUrl };

  for (const item of page.items) {
    if (item.tmdbId) {
      appendWatchedMember(index.byTmdbId, String(item.tmdbId), watchedMember);
    }
    if (item.letterboxdSlug) {
      appendWatchedMember(
        index.bySlug,
        item.letterboxdSlug.toLowerCase(),
        watchedMember,
      );
    }
    const titleYearKey = movieTitleYearKey(item.title, item.year);
    if (titleYearKey) {
      appendWatchedMember(index.byTitleYear, titleYearKey, watchedMember);
    }
  }

  return index;
}

export function addWatchedOverlapPageToIndex(
  index: WatchedIndex,
  page: WatchboxdWatchedOverlapPage,
  members: readonly RoomLetterboxdMember[],
  currentUserId: string,
) {
  const memberByUsername = new Map(
    members.map((member) => [member.letterboxdUsername.toLowerCase(), member]),
  );
  const currentUsername = members.find(
    (member) => member.userId === currentUserId,
  )?.letterboxdUsername.toLowerCase();

  for (const film of page.films) {
    for (const watcher of film.watchedBy) {
      const normalizedUsername = watcher.username.toLowerCase();
      const member = memberByUsername.get(normalizedUsername);

      const watchedMember: WatchedMember = {
        userId: member?.userId ?? `letterboxd:${normalizedUsername}`,
        displayName: member?.displayName ?? watcher.displayName ?? watcher.username,
        avatarUrl: watcher.avatarUrl,
        isCurrentUser:
          member?.userId === currentUserId
          || normalizedUsername === currentUsername,
      };
      if (film.tmdbId) {
        appendWatchedMember(index.byTmdbId, String(film.tmdbId), watchedMember);
      }
      if (film.letterboxdSlug) {
        appendWatchedMember(
          index.bySlug,
          film.letterboxdSlug.toLowerCase(),
          watchedMember,
        );
      }
      const titleYearKey = movieTitleYearKey(film.title, film.year);
      if (titleYearKey) {
        appendWatchedMember(index.byTitleYear, titleYearKey, watchedMember);
      }
    }
  }

  return index;
}

export function watchedMembersForMovie(
  index: WatchedIndex,
  movie: {
    tmdbId: number;
    title?: string | null;
    releaseYear?: number | null;
    letterboxdSlug?: string | null;
  },
): WatchedMember[] {
  const titleYearKey = movieTitleYearKey(movie.title, movie.releaseYear);
  const members = [
    ...(index.byTmdbId[String(movie.tmdbId)] ?? []),
    ...(movie.letterboxdSlug
      ? index.bySlug[movie.letterboxdSlug.toLowerCase()] ?? []
      : []),
    ...(titleYearKey ? index.byTitleYear[titleYearKey] ?? [] : []),
  ];

  const unique: WatchedMember[] = [];
  for (const member of members) {
    if (unique.some((candidate) => candidate.userId === member.userId)) continue;
    unique.push(member);
  }
  return unique;
}

export function watchedWarningCopy(members: readonly WatchedMember[]) {
  if (members.length === 0) return null;

  if (members.length === 1 && members[0]?.isCurrentUser) {
    return "You’ve already watched this.";
  }
  if (members.length === 1) {
    return "1 person in this room has watched this already.";
  }
  return `${members.length} people in this room have watched this already.`;
}

export function limitOverlapSuggestions(
  films: readonly WatchboxdOverlapFilm[],
  limit = OVERLAP_SUGGESTION_LIMIT,
): OverlapSuggestion[] {
  const suggestions: OverlapSuggestion[] = [];

  for (const film of films) {
    if (suggestions.length >= limit) break;
    const suggestion = overlapSuggestionFromFilm(film);
    if (!suggestion) continue;
    suggestions.push(suggestion);
  }

  return suggestions;
}

export function applyLetterboxdRating<T extends {
  letterboxdRating: number | null;
  letterboxdRatingJobId?: string | null;
  letterboxdUrl?: string | null;
  letterboxdSlug?: string | null;
  posterUrl?: string | null;
}>(
  movie: T,
  update: {
    letterboxdRating: number | null;
    letterboxdRatingJobId?: string | null;
    letterboxdUrl?: string | null;
    letterboxdSlug?: string | null;
    posterUrl?: string | null;
  },
): T {
  const pending = Boolean(update.letterboxdRatingJobId);
  return {
    ...movie,
    letterboxdRating: pending ? movie.letterboxdRating : update.letterboxdRating,
    letterboxdRatingJobId: update.letterboxdRatingJobId ?? null,
    letterboxdUrl: update.letterboxdUrl ?? movie.letterboxdUrl ?? null,
    letterboxdSlug: update.letterboxdSlug ?? movie.letterboxdSlug ?? null,
    posterUrl: update.posterUrl ?? movie.posterUrl ?? null,
  };
}
