import "server-only";

import { Prisma } from "@/app/generated/prisma/client";
import { RoomPhase } from "@/app/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { AuthorizationError, DomainError } from "@/lib/auth/errors";
import {
  runSerializableRoomTransaction,
  transitionRoomPhaseInTransaction,
} from "@/lib/domain/room-transitions";
import {
  assertParticipantCoverage,
  BallotSubmissionError,
  requiredRankingCount,
  validateBallotRanks,
} from "@/lib/domain/voting";
import { getTmdbMovieOverviews } from "@/lib/tmdb/client";

export type SubmitBallotInput = {
  userId: string;
  code: string;
  ranks: unknown;
};

export type SubmitBallotResult = {
  roomId: string;
  code: string;
  participantId: string;
  submittedAt: string;
  phase: RoomPhase;
  phaseTransitioned: boolean;
  rankedCount: number;
};

export type VotingBallotNominator = {
  participantId: string;
  displayName: string;
  isCurrentUser: boolean;
};

export type VotingBallotMovie = {
  roomMovieId: string;
  tmdbId: number;
  title: string;
  releaseYear: number | null;
  overview: string | null;
  posterPath: string | null;
  letterboxdRating: number | null;
  letterboxdSlug: string | null;
  letterboxdUrl: string | null;
  nominators: VotingBallotNominator[];
};

export type VotingBallotContext = {
  room: {
    id: string;
    code: string;
    name: string;
    phase: RoomPhase;
    requireParticipantCoverage: boolean;
    ownerId: string;
    rosterLockedAt: Date | null;
  };
  currentParticipant: {
    id: string;
    votingSubmittedAt: Date | null;
  };
  participants: VotingBallotNominator[];
  participantCount: number;
  movies: VotingBallotMovie[];
  requiredRankingCount: number;
  alreadySubmitted: boolean;
};

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function alreadySubmittedError() {
  return new BallotSubmissionError(
    "ALREADY_SUBMITTED",
    "Your ballot has already been submitted and cannot be changed.",
  );
}

function letterboxdFilmUrlFromSlug(slug: string | null | undefined) {
  const trimmed = slug?.trim();
  return trimmed ? `https://letterboxd.com/film/${encodeURIComponent(trimmed)}/` : null;
}

function letterboxdRatingFromValue(value: unknown) {
  if (value === null || value === undefined) return null;
  const rating = Number(value);
  return Number.isFinite(rating) ? rating : null;
}

export async function getVotingBallotContext(
  code: string,
  userId: string,
): Promise<VotingBallotContext> {
  const room = await prisma.room.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      name: true,
      phase: true,
      requireParticipantCoverage: true,
      ownerId: true,
      rosterLockedAt: true,
      participants: {
        orderBy: { joinedAt: "asc" },
        select: {
          id: true,
          userId: true,
          votingSubmittedAt: true,
          user: { select: { displayName: true } },
        },
      },
      movies: {
        orderBy: [{ title: "asc" }, { tmdbId: "asc" }],
        select: {
          id: true,
          tmdbId: true,
          title: true,
          releaseYear: true,
          posterPath: true,
          letterboxdSlug: true,
          letterboxdRating: true,
          nominations: {
            select: {
              participantId: true,
              participant: {
                select: {
                  userId: true,
                  user: { select: { displayName: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!room) {
    throw new DomainError("That room does not exist.");
  }

  const currentParticipant = room.participants.find(
    (participant) => participant.userId === userId,
  );

  if (!currentParticipant) {
    throw new AuthorizationError("Join this room before opening its lobby.");
  }

  let overviewsByTmdbId = new Map<number, string | null>();
  try {
    overviewsByTmdbId = await getTmdbMovieOverviews(
      room.movies.map((movie) => movie.tmdbId),
    );
  } catch {
    overviewsByTmdbId = new Map();
  }

  return {
    room: {
      id: room.id,
      code: room.code,
      name: room.name,
      phase: room.phase,
      requireParticipantCoverage: room.requireParticipantCoverage,
      ownerId: room.ownerId,
      rosterLockedAt: room.rosterLockedAt,
    },
    currentParticipant: {
      id: currentParticipant.id,
      votingSubmittedAt: currentParticipant.votingSubmittedAt,
    },
    participants: room.participants.map((participant) => ({
      participantId: participant.id,
      displayName: participant.user.displayName,
      isCurrentUser: participant.userId === userId,
    })),
    participantCount: room.participants.length,
    movies: room.movies.map((movie) => {
      const letterboxdSlug = movie.letterboxdSlug?.trim() || null;
      return {
        roomMovieId: movie.id,
        tmdbId: movie.tmdbId,
        title: movie.title,
        releaseYear: movie.releaseYear,
        overview: overviewsByTmdbId.get(movie.tmdbId) ?? null,
        posterPath: movie.posterPath,
        letterboxdRating: letterboxdRatingFromValue(movie.letterboxdRating),
        letterboxdSlug,
        letterboxdUrl: letterboxdFilmUrlFromSlug(letterboxdSlug),
        nominators: movie.nominations.map((nomination) => ({
          participantId: nomination.participantId,
          displayName: nomination.participant.user.displayName,
          isCurrentUser: nomination.participant.userId === userId,
        })),
      };
    }),
    requiredRankingCount: requiredRankingCount(
      room.participants.length,
      room.movies.length,
    ),
    alreadySubmitted: Boolean(currentParticipant.votingSubmittedAt),
  };
}

export async function submitBallot(
  input: SubmitBallotInput,
): Promise<SubmitBallotResult> {
  return runSerializableRoomTransaction(async (tx) => {
    const room = await tx.room.findUnique({
      where: { code: input.code },
      select: {
        id: true,
        code: true,
        phase: true,
        rosterLockedAt: true,
        requireParticipantCoverage: true,
      },
    });

    if (!room) {
      throw new BallotSubmissionError(
        "ROOM_NOT_FOUND",
        "That room does not exist.",
      );
    }

    if (room.phase !== RoomPhase.VOTING) {
      throw new BallotSubmissionError(
        "WRONG_PHASE",
        "Room must be in voting to submit a ballot.",
      );
    }

    const participant = await tx.roomParticipant.findUnique({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: input.userId,
        },
      },
      select: {
        id: true,
        votingSubmittedAt: true,
      },
    });

    if (!participant) {
      throw new BallotSubmissionError(
        "NOT_PARTICIPANT",
        "You are not a member of this room.",
      );
    }

    if (!room.rosterLockedAt) {
      throw new BallotSubmissionError(
        "ROSTER_UNLOCKED",
        "Voting cannot start until the room roster is locked.",
      );
    }

    const existingBallot = await tx.ballot.findUnique({
      where: {
        roomId_participantId: {
          roomId: room.id,
          participantId: participant.id,
        },
      },
      select: { id: true },
    });

    if (participant.votingSubmittedAt || existingBallot) {
      throw alreadySubmittedError();
    }

    const [movies, participants] = await Promise.all([
      tx.roomMovie.findMany({
        where: { roomId: room.id },
        select: {
          id: true,
          nominations: {
            select: { participantId: true },
          },
        },
      }),
      tx.roomParticipant.findMany({
        where: { roomId: room.id },
        select: { id: true },
      }),
    ]);

    const allowedMovieIds = movies.map((movie) => movie.id);
    const ranks = validateBallotRanks(input.ranks, {
      requiredCount: requiredRankingCount(participants.length, movies.length),
      allowedMovieIds,
      movieCount: movies.length,
    });

    if (room.requireParticipantCoverage) {
      assertParticipantCoverage(
        ranks.map((rank) => rank.roomMovieId),
        movies.map((movie) => ({
          roomMovieId: movie.id,
          nominatorParticipantIds: movie.nominations.map(
            (nomination) => nomination.participantId,
          ),
        })),
        participants.map((roomParticipant) => roomParticipant.id),
      );
    }

    const submittedAt = new Date();

    try {
      await tx.ballot.create({
        data: {
          roomId: room.id,
          participantId: participant.id,
          submittedAt,
          ranks: {
            create: ranks.map((rank) => ({
              roomId: room.id,
              roomMovieId: rank.roomMovieId,
              rank: rank.rank,
            })),
          },
        },
        select: { id: true },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw alreadySubmittedError();
      }

      throw error;
    }

    const submissionUpdate = await tx.roomParticipant.updateMany({
      where: {
        id: participant.id,
        roomId: room.id,
        votingSubmittedAt: null,
      },
      data: { votingSubmittedAt: submittedAt },
    });

    if (submissionUpdate.count !== 1) {
      throw alreadySubmittedError();
    }

    const transition = await transitionRoomPhaseInTransaction(tx, {
      roomId: room.id,
      targetPhase: RoomPhase.FINALIZING,
    });

    return {
      roomId: room.id,
      code: room.code,
      participantId: participant.id,
      submittedAt: submittedAt.toISOString(),
      phase: transition.phase,
      phaseTransitioned: transition.transitioned,
      rankedCount: ranks.length,
    };
  });
}
