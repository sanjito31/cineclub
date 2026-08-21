import type { ActionState } from "@/app/actions/types";
import type { RoomPhase } from "@/app/generated/prisma/enums";
import { moviePosterSrc, tmdbMovieUrl, tmdbPosterUrl } from "@/app/rooms/[code]/selection-contracts";
import {
  isParticipantCoverageSatisfied,
  participantIdsCoveredByMovies,
  requiredRankingCount,
  type BallotMovieCoverage,
  type BallotSubmissionErrorCode,
  type BallotValidationErrorCode,
} from "@/lib/domain/voting";

export { moviePosterSrc, tmdbMovieUrl, tmdbPosterUrl };
export {
  isParticipantCoverageSatisfied,
  participantIdsCoveredByMovies,
  requiredRankingCount,
};

export type VotingNominator = {
  participantId: string;
  displayName: string;
  isCurrentUser: boolean;
};

export type VotingMovie = {
  roomMovieId: string;
  tmdbId: number;
  title: string;
  releaseYear: number | null;
  overview: string | null;
  posterPath: string | null;
  letterboxdRating: number | null;
  letterboxdSlug: string | null;
  letterboxdUrl: string | null;
  nominators: VotingNominator[];
};

export type VotingCoverageParticipant = VotingNominator & {
  covered: boolean;
};

export type VotingNominationGroup = VotingCoverageParticipant & {
  movies: VotingMovie[];
};

export type BallotSubmissionState = ActionState & {
  errorCode?:
    | BallotValidationErrorCode
    | BallotSubmissionErrorCode
    | "INVALID_ROOM_CODE"
    | "INVALID_RANKS";
  result?: {
    roomId: string;
    code: string;
    participantId: string;
    submittedAt: string;
    phase: RoomPhase;
    phaseTransitioned: boolean;
    rankedCount: number;
  };
};

export type SubmitBallotAction = (
  previousState: BallotSubmissionState,
  formData: FormData,
) => Promise<BallotSubmissionState>;

export type VotingClientContext = {
  id: string;
  code: string;
  name: string;
  phase: RoomPhase;
  requireParticipantCoverage: boolean;
  ownerId: string;
  currentParticipant: {
    id: string;
    votingSubmittedAt: string | null;
  };
  participants: VotingNominator[];
  participantCount: number;
  movies: VotingMovie[];
  requiredRankingCount: number;
  alreadySubmitted: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

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

function optionalLetterboxdRating(value: unknown) {
  if (value === null || value === undefined) return null;
  const rating = Number(value);
  return Number.isFinite(rating) && rating >= 0 && rating <= 5 ? rating : null;
}

export function letterboxdFilmUrl(
  slug: string | null | undefined,
  url: string | null | undefined = null,
) {
  const fromUrl = optionalHttpsUrl(url);
  if (fromUrl) return fromUrl;
  const trimmedSlug = optionalString(slug);
  return trimmedSlug
    ? `https://letterboxd.com/film/${encodeURIComponent(trimmedSlug)}/`
    : null;
}

function requiredString(value: unknown, label: string) {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new Error(`Voting ballot context is missing ${label}.`);
  }
  return parsed;
}

function parsePhase(value: unknown): RoomPhase {
  if (
    value === "SELECTION"
    || value === "VOTING"
    || value === "FINALIZING"
    || value === "REVEAL"
    || value === "COMPLETE"
  ) {
    return value;
  }
  throw new Error("Voting ballot context is missing a valid room phase.");
}

function parseTimestamp(value: unknown) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function parseNominator(value: unknown): VotingNominator | null {
  const nominator = asRecord(value);
  const participantId = optionalString(nominator?.participantId);
  const displayName = optionalString(nominator?.displayName);
  if (!nominator || !participantId || !displayName) return null;

  return {
    participantId,
    displayName,
    isCurrentUser: nominator.isCurrentUser === true,
  };
}

function parseVotingMovie(value: unknown): VotingMovie | null {
  const movie = asRecord(value);
  if (!movie) return null;

  const roomMovieId = optionalString(movie.roomMovieId);
  const tmdbId = Number(movie.tmdbId);
  const title = optionalString(movie.title);
  const releaseYear = movie.releaseYear === null || movie.releaseYear === undefined
    ? null
    : Number(movie.releaseYear);

  if (
    !roomMovieId
    || !title
    || !Number.isSafeInteger(tmdbId)
    || tmdbId <= 0
    || (releaseYear !== null && (!Number.isInteger(releaseYear) || releaseYear < 1888))
  ) {
    return null;
  }

  const letterboxdSlug = optionalString(movie.letterboxdSlug);
  return {
    roomMovieId,
    tmdbId,
    title,
    releaseYear,
    overview: optionalString(movie.overview),
    posterPath: optionalString(movie.posterPath),
    letterboxdRating: optionalLetterboxdRating(movie.letterboxdRating),
    letterboxdSlug,
    letterboxdUrl: letterboxdFilmUrl(letterboxdSlug, optionalString(movie.letterboxdUrl)),
    nominators: Array.isArray(movie.nominators)
      ? uniqueNominators(movie.nominators.flatMap((nominator) => {
          const parsed = parseNominator(nominator);
          return parsed ? [parsed] : [];
        }))
      : [],
  };
}

export function uniqueNominators(
  nominators: readonly VotingNominator[],
): VotingNominator[] {
  const byId = new Map<string, VotingNominator>();
  for (const nominator of nominators) {
    if (!byId.has(nominator.participantId)) {
      byId.set(nominator.participantId, nominator);
    }
  }
  return [...byId.values()];
}

export function uniqueVotingMovies(movies: readonly VotingMovie[]): VotingMovie[] {
  const byId = new Map<string, VotingMovie>();

  for (const movie of movies) {
    const existing = byId.get(movie.roomMovieId);
    if (!existing) {
      byId.set(movie.roomMovieId, {
        ...movie,
        nominators: uniqueNominators(movie.nominators),
      });
      continue;
    }

    existing.nominators = uniqueNominators([
      ...existing.nominators,
      ...movie.nominators,
    ]);
    if (!existing.overview && movie.overview) {
      existing.overview = movie.overview;
    }
  }

  return [...byId.values()];
}

export function toBallotMovieCoverage(
  movies: readonly VotingMovie[],
): BallotMovieCoverage[] {
  return movies.map((movie) => ({
    roomMovieId: movie.roomMovieId,
    nominatorParticipantIds: uniqueNominators(movie.nominators).map(
      (nominator) => nominator.participantId,
    ),
  }));
}

export function rankedMoviesForIds(
  movies: readonly VotingMovie[],
  rankedRoomMovieIds: readonly string[],
) {
  const byId = new Map(movies.map((movie) => [movie.roomMovieId, movie]));
  return rankedRoomMovieIds.flatMap((roomMovieId) => {
    const movie = byId.get(roomMovieId);
    return movie ? [movie] : [];
  });
}

export function unrankedMoviesForIds(
  movies: readonly VotingMovie[],
  rankedRoomMovieIds: readonly string[],
) {
  const ranked = new Set(rankedRoomMovieIds);
  return movies.filter((movie) => !ranked.has(movie.roomMovieId));
}

export function participantCoverageFromRankedIds(
  movies: readonly VotingMovie[],
  rankedRoomMovieIds: readonly string[],
  participants: readonly VotingNominator[] = uniqueNominators(
    movies.flatMap((movie) => movie.nominators),
  ),
): VotingCoverageParticipant[] {
  const covered = new Set(
    participantIdsCoveredByMovies(
      rankedRoomMovieIds,
      toBallotMovieCoverage(movies),
    ),
  );

  return uniqueNominators(participants).map((participant) => ({
    ...participant,
    covered: covered.has(participant.participantId),
  }));
}

function compareNominationGroups(
  left: VotingNominator,
  right: VotingNominator,
) {
  if (left.isCurrentUser !== right.isCurrentUser) {
    return left.isCurrentUser ? -1 : 1;
  }

  const byName = left.displayName.localeCompare(right.displayName);
  if (byName !== 0) return byName;
  return left.participantId.localeCompare(right.participantId);
}

export function nominationGroupsForParticipants(
  movies: readonly VotingMovie[],
  participants: readonly VotingNominator[],
  rankedRoomMovieIds: readonly string[],
): VotingNominationGroup[] {
  const uniqueMovies = uniqueVotingMovies(movies);
  const coverage = participantCoverageFromRankedIds(
    uniqueMovies,
    rankedRoomMovieIds,
    participants,
  );

  return [...coverage].sort(compareNominationGroups).map((participant) => ({
    ...participant,
    movies: uniqueMovies.filter((movie) =>
      movie.nominators.some(
        (nominator) => nominator.participantId === participant.participantId,
      ),
    ),
  }));
}

export function serializeBallotSubmission(rankedRoomMovieIds: readonly string[]) {
  return JSON.stringify(
    rankedRoomMovieIds.map((roomMovieId, index) => ({
      roomMovieId,
      rank: index + 1,
    })),
  );
}

export function appendRankedMovie(
  rankedRoomMovieIds: readonly string[],
  roomMovieId: string,
) {
  if (rankedRoomMovieIds.includes(roomMovieId)) return [...rankedRoomMovieIds];
  return [...rankedRoomMovieIds, roomMovieId];
}

export function removeRankedMovie(
  rankedRoomMovieIds: readonly string[],
  roomMovieId: string,
) {
  return rankedRoomMovieIds.filter((id) => id !== roomMovieId);
}

export function moveRankedMovie(
  rankedRoomMovieIds: readonly string[],
  roomMovieId: string,
  direction: -1 | 1,
) {
  const index = rankedRoomMovieIds.indexOf(roomMovieId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= rankedRoomMovieIds.length) {
    return [...rankedRoomMovieIds];
  }

  const next = [...rankedRoomMovieIds];
  const current = next[index];
  const swap = next[nextIndex];
  if (current === undefined || swap === undefined) return next;
  next[index] = swap;
  next[nextIndex] = current;
  return next;
}

export function moveRankedMovieToIndex(
  rankedRoomMovieIds: readonly string[],
  roomMovieId: string,
  toIndex: number,
) {
  const fromIndex = rankedRoomMovieIds.indexOf(roomMovieId);
  if (fromIndex < 0) return [...rankedRoomMovieIds];

  const next = [...rankedRoomMovieIds];
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) return [...rankedRoomMovieIds];

  const clampedIndex = Math.max(0, Math.min(toIndex, next.length));
  next.splice(clampedIndex, 0, moved);
  return next;
}

export function formatNominatorList(nominators: readonly VotingNominator[]) {
  const names = nominators.map((nominator) => (
    nominator.isCurrentUser ? "You" : nominator.displayName
  ));
  if (names.length === 0) return "";
  if (names.length === 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

export function minimumRankingCopy(
  requiredCount: number,
  movieCount: number,
) {
  return `Rank at least ${requiredCount} of ${movieCount} movies`;
}

export function toVotingClientContext(input: unknown): VotingClientContext {
  const value = asRecord(input);
  if (!value) {
    throw new Error("Voting ballot context is missing.");
  }

  const room = asRecord(value.room) ?? value;
  const movies = uniqueVotingMovies(
    Array.isArray(value.movies)
      ? value.movies.flatMap((movie) => {
          const parsed = parseVotingMovie(movie);
          return parsed ? [parsed] : [];
        })
      : [],
  );
  const parsedParticipantCount = Number(value.participantCount);
  const currentParticipant = asRecord(value.currentParticipant);
  const votingSubmittedAt = parseTimestamp(currentParticipant?.votingSubmittedAt);
  const providedRequiredCount = Number(value.requiredRankingCount);
  const nominators = uniqueNominators(movies.flatMap((movie) => movie.nominators));
  const participants = uniqueNominators(
    Array.isArray(value.participants)
      ? value.participants.flatMap((participant) => {
          const parsed = parseNominator(participant);
          return parsed ? [parsed] : [];
        })
      : nominators,
  );
  const participantCount = Number.isInteger(parsedParticipantCount) && parsedParticipantCount >= 0
    ? parsedParticipantCount
    : participants.length;

  return {
    id: requiredString(room.id, "a room id"),
    code: requiredString(room.code, "a room code"),
    name: requiredString(room.name, "a room name"),
    phase: parsePhase(room.phase),
    requireParticipantCoverage: room.requireParticipantCoverage === true,
    ownerId: requiredString(room.ownerId, "an owner id"),
    currentParticipant: {
      id: requiredString(currentParticipant?.id, "the current participant"),
      votingSubmittedAt,
    },
    participants,
    participantCount,
    movies,
    requiredRankingCount: Number.isInteger(providedRequiredCount) && providedRequiredCount >= 0
      ? providedRequiredCount
      : requiredRankingCount(participantCount, movies.length),
    alreadySubmitted: value.alreadySubmitted === true || Boolean(votingSubmittedAt),
  };
}
