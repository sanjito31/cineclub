import { DomainError } from "@/lib/auth/errors";

export type BallotRank = {
  roomMovieId: string;
  rank: number;
};

export type BallotMovieCoverage = {
  roomMovieId: string;
  nominatorParticipantIds: readonly string[];
};

export type BallotValidationErrorCode =
  | "INVALID_RANKS"
  | "INVALID_RANK"
  | "DUPLICATE_RANK"
  | "DUPLICATE_MOVIE"
  | "NONCONTIGUOUS_RANKS"
  | "INSUFFICIENT_RANKS"
  | "UNKNOWN_MOVIE"
  | "COVERAGE_INCOMPLETE";

export type BallotSubmissionErrorCode =
  | "ROOM_NOT_FOUND"
  | "NOT_PARTICIPANT"
  | "WRONG_PHASE"
  | "ROSTER_UNLOCKED"
  | "ALREADY_SUBMITTED";

export class BallotSubmissionError extends DomainError {
  readonly code: BallotSubmissionErrorCode;

  constructor(code: BallotSubmissionErrorCode, message: string) {
    super(message);
    this.name = "BallotSubmissionError";
    this.code = code;
  }
}

export class BallotValidationError extends DomainError {
  readonly code: BallotValidationErrorCode;

  constructor(code: BallotValidationErrorCode, message: string) {
    super(message);
    this.name = "BallotValidationError";
    this.code = code;
  }
}

export function requiredRankingCount(
  participantCount: number,
  movieCount: number,
) {
  if (participantCount <= 0 || movieCount <= 0) {
    return 0;
  }

  return Math.min(participantCount, movieCount);
}

function toAllowedMovieIdSet(
  allowedMovieIds: ReadonlySet<string> | readonly string[],
) {
  return allowedMovieIds instanceof Set
    ? allowedMovieIds
    : new Set(allowedMovieIds);
}

export function validateBallotRanks(
  value: unknown,
  input: {
    requiredCount: number;
    allowedMovieIds: ReadonlySet<string> | readonly string[];
    movieCount: number;
  },
): BallotRank[] {
  if (!Array.isArray(value)) {
    throw new BallotValidationError(
      "INVALID_RANKS",
      "Ranks must be submitted as a list.",
    );
  }

  if (value.length > input.movieCount) {
    throw new BallotValidationError(
      "INVALID_RANKS",
      "You cannot rank more movies than are in this room.",
    );
  }

  const ranks = value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new BallotValidationError(
        "INVALID_RANKS",
        "Each rank must be a movie ranking object.",
      );
    }

    const rankEntry = entry as Record<string, unknown>;
    if (
      typeof rankEntry.roomMovieId !== "string" ||
      rankEntry.roomMovieId.trim().length === 0
    ) {
      throw new BallotValidationError(
        "INVALID_RANKS",
        "Each rank must include a room movie ID.",
      );
    }

    if (
      typeof rankEntry.rank !== "number" ||
      !Number.isInteger(rankEntry.rank) ||
      rankEntry.rank < 1
    ) {
      throw new BallotValidationError(
        "INVALID_RANK",
        "Each rank must be a positive integer starting at 1.",
      );
    }

    if (rankEntry.rank > input.movieCount) {
      throw new BallotValidationError(
        "INVALID_RANK",
        "Rank values cannot exceed the number of movies in this room.",
      );
    }

    return {
      roomMovieId: rankEntry.roomMovieId.trim(),
      rank: rankEntry.rank,
    };
  });

  const rankValues = ranks.map(({ rank }) => rank);
  if (new Set(rankValues).size !== rankValues.length) {
    throw new BallotValidationError(
      "DUPLICATE_RANK",
      "Each rank may only be used once.",
    );
  }

  const movieIds = ranks.map(({ roomMovieId }) => roomMovieId);
  if (new Set(movieIds).size !== movieIds.length) {
    throw new BallotValidationError(
      "DUPLICATE_MOVIE",
      "Each movie may only be ranked once.",
    );
  }

  const sortedRanks = [...ranks].sort((left, right) => left.rank - right.rank);
  if (sortedRanks.some((entry, position) => entry.rank !== position + 1)) {
    throw new BallotValidationError(
      "NONCONTIGUOUS_RANKS",
      `Ranks must be contiguous from 1 to ${ranks.length}.`,
    );
  }

  const allowedMovieIds = toAllowedMovieIdSet(input.allowedMovieIds);
  if (sortedRanks.some((entry) => !allowedMovieIds.has(entry.roomMovieId))) {
    throw new BallotValidationError(
      "UNKNOWN_MOVIE",
      "Every ranked movie must belong to this room.",
    );
  }

  if (sortedRanks.length < input.requiredCount) {
    throw new BallotValidationError(
      "INSUFFICIENT_RANKS",
      input.requiredCount === 1
        ? "Rank at least 1 movie."
        : `Rank at least ${input.requiredCount} movies.`,
    );
  }

  return sortedRanks;
}

export function participantIdsCoveredByMovies(
  rankedMovieIds: readonly string[],
  movies: readonly BallotMovieCoverage[],
): string[] {
  const rankedMovieIdSet = new Set(rankedMovieIds);
  const coveredParticipantIds = new Set<string>();

  for (const movie of movies) {
    if (!rankedMovieIdSet.has(movie.roomMovieId)) {
      continue;
    }

    for (const participantId of movie.nominatorParticipantIds) {
      coveredParticipantIds.add(participantId);
    }
  }

  return [...coveredParticipantIds].sort();
}

export function isParticipantCoverageSatisfied(
  rankedMovieIds: readonly string[],
  movies: readonly BallotMovieCoverage[],
  allParticipantIds: readonly string[],
): boolean {
  if (allParticipantIds.length === 0) {
    return true;
  }

  const coveredParticipantIds = new Set(
    participantIdsCoveredByMovies(rankedMovieIds, movies),
  );

  return allParticipantIds.every((participantId) =>
    coveredParticipantIds.has(participantId),
  );
}

export function assertParticipantCoverage(
  rankedMovieIds: readonly string[],
  movies: readonly BallotMovieCoverage[],
  allParticipantIds: readonly string[],
) {
  if (
    !isParticipantCoverageSatisfied(
      rankedMovieIds,
      movies,
      allParticipantIds,
    )
  ) {
    throw new BallotValidationError(
      "COVERAGE_INCOMPLETE",
      "Your ranking must include at least one movie from every participant.",
    );
  }
}
