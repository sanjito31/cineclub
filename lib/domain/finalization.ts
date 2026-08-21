import { randomInt } from "node:crypto";
import { DomainError } from "@/lib/auth/errors";
import {
  orderFinalists,
  type FinalistOrdering,
} from "@/lib/domain/finalist-ordering";

export type FinalizationErrorCode =
  | "ROOM_NOT_FOUND"
  | "NOT_PARTICIPANT"
  | "WRONG_PHASE"
  | "ROSTER_UNLOCKED";

export class FinalizationError extends DomainError {
  readonly code: FinalizationErrorCode;

  constructor(code: FinalizationErrorCode, message: string) {
    super(message);
    this.name = "FinalizationError";
    this.code = code;
  }
}

export type FinalizationRank = {
  roomMovieId: string;
  rank: number;
};

export type FinalizationBallot = {
  participantId: string;
  ranks: readonly FinalizationRank[];
};

export type FinalizationMovie = {
  roomMovieId: string;
  nominatorParticipantIds: readonly string[];
  letterboxdRating: number | null;
};

export type RoomMovieResultDraft = {
  roomMovieId: string;
  aggregateScore: number;
  aggregateRank: number;
  tieBreakRating: number | null;
  tieBreakRandom: number;
  isFinalist: boolean;
  finalOrder: number | null;
};

export type AssembleRoomResultsInput = {
  movies: readonly FinalizationMovie[];
  ballots: readonly FinalizationBallot[];
  participantIds: readonly string[];
  ordering: FinalistOrdering;
  tieBreakRandoms?: Readonly<Record<string, number>>;
  createTieBreakRandom?: () => number;
};

const TIE_BREAK_RANDOM_DENOMINATOR = 1_000_000_000;

export function bordaPoints(rank: number, movieCount: number) {
  if (
    !Number.isInteger(rank)
    || rank < 1
    || !Number.isInteger(movieCount)
    || movieCount < 1
    || rank > movieCount
  ) {
    return 0;
  }

  return movieCount - rank + 1;
}

export function generateTieBreakRandom(
  createRandomInt: (min: number, max: number) => number = randomInt,
) {
  return createRandomInt(0, TIE_BREAK_RANDOM_DENOMINATOR) / TIE_BREAK_RANDOM_DENOMINATOR;
}

export function letterboxdRatingFromValue(value: unknown) {
  if (value === null || value === undefined) return null;
  const rating = Number(value);
  return Number.isFinite(rating) && rating >= 0 && rating <= 5 ? rating : null;
}

function scoreByMovieId(
  movies: readonly FinalizationMovie[],
  ballots: readonly FinalizationBallot[],
) {
  const movieCount = movies.length;
  const scores = new Map<string, number>();

  for (const movie of movies) {
    scores.set(movie.roomMovieId, 0);
  }

  for (const ballot of ballots) {
    for (const rank of ballot.ranks) {
      if (!scores.has(rank.roomMovieId)) continue;
      scores.set(
        rank.roomMovieId,
        (scores.get(rank.roomMovieId) ?? 0) + bordaPoints(rank.rank, movieCount),
      );
    }
  }

  return scores;
}

function compareRankedMovies(
  left: RoomMovieResultDraft,
  right: RoomMovieResultDraft,
) {
  if (left.aggregateScore !== right.aggregateScore) {
    return right.aggregateScore - left.aggregateScore;
  }

  const leftRating = left.tieBreakRating ?? Number.NEGATIVE_INFINITY;
  const rightRating = right.tieBreakRating ?? Number.NEGATIVE_INFINITY;
  if (leftRating !== rightRating) {
    return rightRating - leftRating;
  }

  if (left.tieBreakRandom !== right.tieBreakRandom) {
    return right.tieBreakRandom - left.tieBreakRandom;
  }

  return left.roomMovieId.localeCompare(right.roomMovieId);
}

export function selectFinalistMovieIds(
  rankedMovieIds: readonly string[],
  movies: readonly FinalizationMovie[],
  participantIds: readonly string[],
) {
  const remaining = new Set(participantIds);
  const nominatorsByMovieId = new Map(
    movies.map((movie) => [movie.roomMovieId, movie.nominatorParticipantIds]),
  );
  const finalistIds: string[] = [];

  for (const roomMovieId of rankedMovieIds) {
    if (remaining.size === 0) break;

    const nominators = nominatorsByMovieId.get(roomMovieId) ?? [];
    const representsUncovered = nominators.some((participantId) =>
      remaining.has(participantId),
    );
    if (!representsUncovered) continue;

    finalistIds.push(roomMovieId);
    for (const participantId of nominators) {
      remaining.delete(participantId);
    }
  }

  return finalistIds;
}

export function assembleRoomResults(
  input: AssembleRoomResultsInput,
): RoomMovieResultDraft[] {
  if (input.movies.length === 0) {
    return [];
  }

  const movieIds = input.movies.map((movie) => movie.roomMovieId);
  if (new Set(movieIds).size !== movieIds.length) {
    throw new DomainError("Each room movie may only appear once during finalization.");
  }

  const scores = scoreByMovieId(input.movies, input.ballots);
  const createTieBreakRandom = input.createTieBreakRandom ?? generateTieBreakRandom;
  const drafts: RoomMovieResultDraft[] = input.movies.map((movie) => ({
    roomMovieId: movie.roomMovieId,
    aggregateScore: scores.get(movie.roomMovieId) ?? 0,
    aggregateRank: 0,
    tieBreakRating: letterboxdRatingFromValue(movie.letterboxdRating),
    tieBreakRandom:
      input.tieBreakRandoms?.[movie.roomMovieId]
      ?? createTieBreakRandom(),
    isFinalist: false,
    finalOrder: null,
  }));

  drafts.sort(compareRankedMovies);
  drafts.forEach((draft, index) => {
    draft.aggregateRank = index + 1;
  });

  const finalistIds = selectFinalistMovieIds(
    drafts.map((draft) => draft.roomMovieId),
    input.movies,
    input.participantIds,
  );
  const finalistIdSet = new Set(finalistIds);
  const orderedFinalistIds = orderFinalists(
    input.ordering,
    drafts.filter((draft) => finalistIdSet.has(draft.roomMovieId)),
  );

  const finalOrderByMovieId = new Map(
    orderedFinalistIds.map((roomMovieId, index) => [roomMovieId, index + 1]),
  );

  return drafts.map((draft) => ({
    ...draft,
    isFinalist: finalistIdSet.has(draft.roomMovieId),
    finalOrder: finalOrderByMovieId.get(draft.roomMovieId) ?? null,
  }));
}

export function movieNeedsLetterboxdRatingLookup(movie: {
  letterboxdRating: number | null;
  ratingFetchedAt: Date | null;
}) {
  return movie.ratingFetchedAt === null && movie.letterboxdRating === null;
}
