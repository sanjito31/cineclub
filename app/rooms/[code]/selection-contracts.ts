import type { ActionState } from "@/app/actions/types";
import type { RoomPhase } from "@/app/generated/prisma/enums";
import type { OverlapSuggestion, WatchedIndex, WatchedMember } from "@/lib/domain/watchboxd-selection";
import {
  applyLetterboxdRating,
  watchedMembersForMovie,
} from "@/lib/domain/watchboxd-selection";

export type { OverlapSuggestion, WatchedIndex, WatchedMember };

export type SelectionMovie = {
  tmdbId: number;
  title: string;
  releaseYear: number | null;
  overview: string | null;
  posterPath: string | null;
  posterUrl: string | null;
  tmdbRating: number | null;
  letterboxdRating: number | null;
  letterboxdRatingJobId: string | null;
  letterboxdUrl: string | null;
  letterboxdSlug: string | null;
  watchedByCurrentUser: boolean;
  watchedByMembers: WatchedMember[];
  overlappingParticipants: string[];
  alreadyNominatedBy: string[];
  suggestionReason: string | null;
};

export type MovieSearchResponse = {
  results: SelectionMovie[];
  suggestions: SelectionMovie[];
  page: number;
  totalPages: number;
  totalResults: number;
};

export type SelectionSlotValue = {
  slotIndex: number;
  movie: SelectionMovie | null;
};

export type SelectionSubmissionState = ActionState & {
  result?: {
    roomId: string;
    code: string;
    participantId: string;
    submittedAt: string;
    phase: RoomPhase;
    phaseTransitioned: boolean;
    nominations: {
      id: string;
      slotIndex: number;
      roomMovieId: string;
      tmdbId: number;
    }[];
    duplicateWarnings: {
      tmdbId: number;
      participantIds: string[];
    }[];
  };
};

export type SubmitSelectionsAction = (
  previousState: SelectionSubmissionState,
  formData: FormData,
) => Promise<SelectionSubmissionState>;

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalHttpsUrl(value: unknown) {
  const candidate = optionalString(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      .map((item) => item.trim())
    : [];
}

function optionalRating(value: unknown, maximum: number) {
  if (value === null || value === undefined) return null;
  const rating = Number(value);
  return Number.isFinite(rating) && rating >= 0 && rating <= maximum ? rating : undefined;
}

function parseWatchedMember(value: unknown): WatchedMember | null {
  if (!value || typeof value !== "object") return null;
  const member = value as Record<string, unknown>;
  const displayName = optionalString(member.displayName);
  const userId = optionalString(member.userId);
  if (!displayName) return null;

  return {
    userId: userId ?? displayName,
    displayName,
    avatarUrl: optionalHttpsUrl(member.avatarUrl),
    isCurrentUser: member.isCurrentUser === true,
  };
}

export function parseSelectionMovie(value: unknown): SelectionMovie | null {
  if (!value || typeof value !== "object") return null;
  const movie = value as Record<string, unknown>;
  const tmdbId = Number(movie.tmdbId);
  const letterboxdRating = optionalRating(movie.letterboxdRating, 5);
  const tmdbRating = optionalRating(movie.tmdbRating, 10);
  const releaseYear = movie.releaseYear === null || movie.releaseYear === undefined
    ? null
    : Number(movie.releaseYear);

  if (
    !Number.isSafeInteger(tmdbId)
    || tmdbId <= 0
    || typeof movie.title !== "string"
    || !movie.title.trim()
    || (releaseYear !== null && (!Number.isInteger(releaseYear) || releaseYear < 1888))
    || letterboxdRating === undefined
    || tmdbRating === undefined
  ) {
    return null;
  }

  const watchedByMembers = Array.isArray(movie.watchedByMembers)
    ? movie.watchedByMembers.flatMap((member) => {
        const parsed = parseWatchedMember(member);
        return parsed ? [parsed] : [];
      })
    : [];

  return {
    tmdbId,
    title: movie.title.trim(),
    releaseYear,
    overview: optionalString(movie.overview),
    posterPath: optionalString(movie.posterPath),
    posterUrl: optionalHttpsUrl(movie.posterUrl),
    tmdbRating,
    letterboxdRating,
    letterboxdRatingJobId: optionalString(movie.letterboxdRatingJobId),
    letterboxdUrl: optionalHttpsUrl(movie.letterboxdUrl),
    letterboxdSlug: optionalString(movie.letterboxdSlug),
    watchedByCurrentUser: movie.watchedByCurrentUser === true || watchedByMembers.some((member) => member.isCurrentUser),
    watchedByMembers,
    overlappingParticipants: stringList(movie.overlappingParticipants),
    alreadyNominatedBy: stringList(movie.alreadyNominatedBy),
    suggestionReason: optionalString(movie.suggestionReason),
  };
}

export function toSelectionMovie(input: {
  tmdbId: number;
  title: string;
  releaseYear: number | null;
  overview?: string | null;
  posterPath?: string | null;
  posterUrl?: string | null;
  tmdbRating?: number | null;
  letterboxdRating?: number | null;
  letterboxdRatingJobId?: string | null;
  letterboxdUrl?: string | null;
  letterboxdSlug?: string | null;
  watchedByCurrentUser?: boolean;
  watchedByMembers?: WatchedMember[];
  overlappingParticipants?: string[];
  alreadyNominatedBy?: string[];
  suggestionReason?: string | null;
}): SelectionMovie {
  const watchedByMembers = input.watchedByMembers ?? [];
  return {
    tmdbId: input.tmdbId,
    title: input.title,
    releaseYear: input.releaseYear,
    overview: input.overview ?? null,
    posterPath: input.posterPath ?? null,
    posterUrl: input.posterUrl ?? null,
    tmdbRating: input.tmdbRating ?? null,
    letterboxdRating: input.letterboxdRating ?? null,
    letterboxdRatingJobId: input.letterboxdRatingJobId ?? null,
    letterboxdUrl: input.letterboxdUrl ?? null,
    letterboxdSlug: input.letterboxdSlug ?? null,
    watchedByCurrentUser: input.watchedByCurrentUser === true
      || watchedByMembers.some((member) => member.isCurrentUser),
    watchedByMembers,
    overlappingParticipants: input.overlappingParticipants ?? [],
    alreadyNominatedBy: input.alreadyNominatedBy ?? [],
    suggestionReason: input.suggestionReason ?? null,
  };
}

export function tmdbMovieUrl(tmdbId: number) {
  return `https://www.themoviedb.org/movie/${tmdbId}`;
}

export function tmdbPosterUrl(posterPath: string) {
  return `https://image.tmdb.org/t/p/w92${posterPath}`;
}

export function moviePosterSrc(movie: {
  posterUrl?: string | null;
  posterPath?: string | null;
}) {
  if (movie.posterUrl) return movie.posterUrl;
  if (movie.posterPath) return tmdbPosterUrl(movie.posterPath);
  return null;
}

export function parseMovieSearchResponse(value: unknown): MovieSearchResponse | null {
  if (!value || typeof value !== "object") return null;
  const response = value as Record<string, unknown>;
  if (!Array.isArray(response.results)) return null;

  const results = response.results
    .map(parseSelectionMovie)
    .filter((movie): movie is SelectionMovie => movie !== null);
  const page = Number(response.page);
  const totalPages = Number(response.totalPages);
  const totalResults = Number(response.totalResults);

  return {
    results,
    suggestions: Array.isArray(response.suggestions)
      ? response.suggestions
        .map(parseSelectionMovie)
        .filter((movie): movie is SelectionMovie => movie !== null)
      : [],
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    totalPages: Number.isInteger(totalPages) && totalPages >= 0 ? totalPages : results.length > 0 ? 1 : 0,
    totalResults: Number.isInteger(totalResults) && totalResults >= 0 ? totalResults : results.length,
  };
}

export function parseOverlapSuggestion(value: unknown): OverlapSuggestion | null {
  if (!value || typeof value !== "object") return null;
  const film = value as Record<string, unknown>;
  const title = optionalString(film.title);
  const letterboxdUrl = optionalHttpsUrl(film.letterboxdUrl);
  const tmdbId = film.tmdbId === null || film.tmdbId === undefined ? null : Number(film.tmdbId);
  const releaseYear = film.releaseYear === null || film.releaseYear === undefined
    ? null
    : Number(film.releaseYear);
  const letterboxdRating = optionalRating(film.letterboxdRating, 5);
  const tmdbRating = optionalRating(film.tmdbRating, 10);

  if (
    !title
    || !letterboxdUrl
    || letterboxdRating === undefined
    || tmdbRating === undefined
    || (tmdbId !== null && (!Number.isSafeInteger(tmdbId) || tmdbId <= 0))
    || (releaseYear !== null && (!Number.isInteger(releaseYear) || releaseYear < 1888))
  ) {
    return null;
  }

  return {
    tmdbId,
    title,
    releaseYear,
    posterUrl: optionalHttpsUrl(film.posterUrl),
    posterPath: optionalString(film.posterPath),
    overview: optionalString(film.overview),
    tmdbRating,
    letterboxdRating,
    letterboxdUrl,
    letterboxdSlug: optionalString(film.letterboxdSlug),
    letterboxdMovieJobId: optionalString(film.letterboxdMovieJobId),
  };
}

export function parseWatchboxdContextResponse(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const status = body.status === "pending" || body.status === "ready" ? body.status : null;
  if (!status) return null;

  const retryAfter = Number(body.retryAfter);
  const overlapStatus: "ready" | "pending" | "skipped" | "unavailable" =
    body.overlapStatus === "ready"
    || body.overlapStatus === "pending"
    || body.overlapStatus === "skipped"
    || body.overlapStatus === "unavailable"
      ? body.overlapStatus
      : "unavailable";
  const watchedRecord = body.watched && typeof body.watched === "object"
    ? body.watched as { byTmdbId?: unknown; bySlug?: unknown; byTitleYear?: unknown }
    : null;

  function memberMap(value: unknown): Record<string, WatchedMember[]> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, members]) => [
        key,
        Array.isArray(members)
          ? members.flatMap((member) => {
              const parsed = parseWatchedMember(member);
              return parsed ? [parsed] : [];
            })
          : [],
      ]),
    );
  }

  return {
    status,
    retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 2,
    pendingJobIds: stringList(body.pendingJobIds),
    eligibleForOverlap: body.eligibleForOverlap === true,
    usernames: stringList(body.usernames),
    watched: {
      byTmdbId: memberMap(watchedRecord?.byTmdbId),
      bySlug: memberMap(watchedRecord?.bySlug),
      byTitleYear: memberMap(watchedRecord?.byTitleYear),
    } satisfies WatchedIndex,
    suggestions: Array.isArray(body.suggestions)
      ? body.suggestions.flatMap((suggestion) => {
          const parsed = parseOverlapSuggestion(suggestion);
          return parsed ? [parsed] : [];
        })
      : [],
    overlapStatus,
  };
}

export function parseMovieRatingsResponse(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const ratings = (value as { ratings?: unknown }).ratings;
  if (!Array.isArray(ratings)) return null;

  return ratings.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const rating = entry as Record<string, unknown>;
    const tmdbId = Number(rating.tmdbId);
    const letterboxdRating = optionalRating(rating.letterboxdRating, 5);
    if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0 || letterboxdRating === undefined) {
      return [];
    }
    return [{
      tmdbId,
      letterboxdRating,
      letterboxdRatingJobId: optionalString(rating.letterboxdRatingJobId),
      letterboxdUrl: optionalHttpsUrl(rating.letterboxdUrl),
      letterboxdSlug: optionalString(rating.letterboxdSlug),
      posterUrl: optionalHttpsUrl(rating.posterUrl),
    }];
  });
}

export function parseLetterboxdMovieLookupsResponse(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const movies = (value as { movies?: unknown }).movies;
  if (!Array.isArray(movies)) return null;

  return movies.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const movie = entry as Record<string, unknown>;
    const letterboxdSlug = optionalString(movie.letterboxdSlug);
    if (!letterboxdSlug) return [];

    const tmdbId = movie.tmdbId === null || movie.tmdbId === undefined ? null : Number(movie.tmdbId);
    const year = movie.year === null || movie.year === undefined
      ? null
      : Number(movie.year);
    const letterboxdRating = optionalRating(movie.letterboxdRating, 5);
    const tmdbRating = optionalRating(movie.tmdbRating, 10);
    if (
      letterboxdRating === undefined
      || tmdbRating === undefined
      || (tmdbId !== null && (!Number.isSafeInteger(tmdbId) || tmdbId <= 0))
      || (year !== null && (!Number.isInteger(year) || year < 1888))
    ) {
      return [];
    }

    return [{
      letterboxdSlug,
      tmdbId,
      title: optionalString(movie.title),
      year,
      letterboxdRating,
      letterboxdUrl: optionalHttpsUrl(movie.letterboxdUrl),
      posterUrl: optionalHttpsUrl(movie.posterUrl),
      letterboxdMovieJobId: optionalString(movie.letterboxdMovieJobId),
      overview: optionalString(movie.overview),
      tmdbRating,
      posterPath: optionalString(movie.posterPath),
    }];
  });
}

export function applyWatchedIndexToMovie(movie: SelectionMovie, index: WatchedIndex): SelectionMovie {
  const watchedByMembers = watchedMembersForMovie(index, {
    tmdbId: movie.tmdbId,
    title: movie.title,
    releaseYear: movie.releaseYear,
    letterboxdSlug: movie.letterboxdSlug,
  });
  return {
    ...movie,
    watchedByMembers,
    watchedByCurrentUser: watchedByMembers.some((member) => member.isCurrentUser),
  };
}

export function applyRatingLookupToMovie(
  movie: SelectionMovie,
  update: {
    letterboxdRating: number | null;
    letterboxdRatingJobId: string | null;
    letterboxdUrl: string | null;
    letterboxdSlug: string | null;
    posterUrl: string | null;
  },
): SelectionMovie {
  return applyLetterboxdRating(movie, update);
}

export function overlapToSelectionMovie(suggestion: OverlapSuggestion): SelectionMovie | null {
  if (!suggestion.tmdbId) return null;
  return toSelectionMovie({
    tmdbId: suggestion.tmdbId,
    title: suggestion.title,
    releaseYear: suggestion.releaseYear,
    overview: suggestion.overview,
    posterPath: suggestion.posterPath,
    posterUrl: suggestion.posterUrl,
    tmdbRating: suggestion.tmdbRating,
    letterboxdRating: suggestion.letterboxdRating,
    letterboxdUrl: suggestion.letterboxdUrl,
    letterboxdSlug: suggestion.letterboxdSlug,
  });
}

export function createSelectionSlots(count: number): SelectionSlotValue[] {
  return Array.from({ length: count }, (_, index) => ({
    slotIndex: index + 1,
    movie: null,
  }));
}

export function duplicateSelectionIds(slots: SelectionSlotValue[]) {
  const seen = new Set<number>();
  const duplicates = new Set<number>();

  for (const slot of slots) {
    if (!slot.movie) continue;
    if (seen.has(slot.movie.tmdbId)) duplicates.add(slot.movie.tmdbId);
    seen.add(slot.movie.tmdbId);
  }

  return duplicates;
}

export function serializeSelectionSubmission(slots: SelectionSlotValue[]) {
  return JSON.stringify(
    slots.map(({ slotIndex, movie }) => ({
      slotIndex,
      tmdbId: movie?.tmdbId ?? null,
      title: movie?.title ?? null,
      releaseYear: movie?.releaseYear ?? null,
      overview: movie?.overview ?? null,
      posterPath: movie?.posterPath ?? null,
    })),
  );
}
