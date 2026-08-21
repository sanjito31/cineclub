import "server-only";

import { Prisma } from "@/app/generated/prisma/client";
import { RoomPhase } from "@/app/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { AuthorizationError } from "@/lib/auth/errors";
import {
  assembleRoomResults,
  FinalizationError,
  letterboxdRatingFromValue,
  movieNeedsLetterboxdRatingLookup,
  type RoomMovieResultDraft,
} from "@/lib/domain/finalization";
import {
  runSerializableRoomTransaction,
  transitionRoomPhaseInTransaction,
} from "@/lib/domain/room-transitions";
import { lookupWatchboxdMovies } from "@/lib/data/watchboxd-room";

export type FinalizeRoomInput = {
  userId: string;
  code: string;
  signal?: AbortSignal;
};

export type FinalizeRoomPending = {
  status: "pending";
  phase: typeof RoomPhase.FINALIZING;
  retryAfter: number;
  pendingRatingCount: number;
  alreadyFinalized: false;
};

export type FinalizeRoomReady = {
  status: "ready";
  phase: RoomPhase;
  alreadyFinalized: boolean;
  resultCount: number;
  finalistCount: number;
};

export type FinalizeRoomResult = FinalizeRoomPending | FinalizeRoomReady;

const DEFAULT_RETRY_AFTER_SECONDS = 2;

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function toResultWrite(roomId: string, draft: RoomMovieResultDraft) {
  return {
    roomId,
    roomMovieId: draft.roomMovieId,
    aggregateScore: draft.aggregateScore,
    aggregateRank: draft.aggregateRank,
    tieBreakRating: draft.tieBreakRating,
    tieBreakRandom: draft.tieBreakRandom,
    isFinalist: draft.isFinalist,
    finalOrder: draft.finalOrder,
  };
}

async function loadFinalizationRoom(code: string) {
  return prisma.room.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      phase: true,
      rosterLockedAt: true,
      finalistOrdering: true,
      finalizedAt: true,
      participants: {
        select: {
          id: true,
          userId: true,
        },
      },
    },
  });
}

async function countRoomResults(roomId: string) {
  const [movieCount, resultCount, finalistCount] = await Promise.all([
    prisma.roomMovie.count({ where: { roomId } }),
    prisma.roomMovieResult.count({ where: { roomId } }),
    prisma.roomMovieResult.count({
      where: { roomId, isFinalist: true },
    }),
  ]);

  return { movieCount, resultCount, finalistCount };
}

async function persistReadyResults(input: {
  roomId: string;
  drafts: RoomMovieResultDraft[];
}): Promise<FinalizeRoomReady> {
  try {
    return await runSerializableRoomTransaction(async (tx) => {
      const existingCount = await tx.roomMovieResult.count({
        where: { roomId: input.roomId },
      });
      if (existingCount === 0 && input.drafts.length > 0) {
        await tx.roomMovieResult.createMany({
          data: input.drafts.map((draft) => toResultWrite(input.roomId, draft)),
        });
      }

      const transition = await transitionRoomPhaseInTransaction(tx, {
        roomId: input.roomId,
        targetPhase: RoomPhase.REVEAL,
      });
      const resultCount = await tx.roomMovieResult.count({
        where: { roomId: input.roomId },
      });
      const finalistCount = await tx.roomMovieResult.count({
        where: { roomId: input.roomId, isFinalist: true },
      });

      return {
        status: "ready" as const,
        phase: transition.phase,
        alreadyFinalized: existingCount > 0 || !transition.transitioned,
        resultCount,
        finalistCount,
      };
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const counts = await countRoomResults(input.roomId);
    const transition = await runSerializableRoomTransaction((tx) =>
      transitionRoomPhaseInTransaction(tx, {
        roomId: input.roomId,
        targetPhase: RoomPhase.REVEAL,
      }),
    );

    return {
      status: "ready",
      phase: transition.phase,
      alreadyFinalized: true,
      resultCount: counts.resultCount,
      finalistCount: counts.finalistCount,
    };
  }
}

async function resolveMissingLetterboxdRatings(
  roomId: string,
  signal?: AbortSignal,
) {
  const movies = await prisma.roomMovie.findMany({
    where: { roomId },
    select: {
      id: true,
      tmdbId: true,
      letterboxdRating: true,
      letterboxdSlug: true,
      ratingFetchedAt: true,
      letterboxdJobId: true,
    },
  });

  const unresolved = movies.filter((movie) =>
    movieNeedsLetterboxdRatingLookup({
      letterboxdRating: letterboxdRatingFromValue(movie.letterboxdRating),
      ratingFetchedAt: movie.ratingFetchedAt,
    }),
  );
  if (unresolved.length === 0) {
    return { pendingCount: 0, retryAfter: DEFAULT_RETRY_AFTER_SECONDS };
  }

  const lookups = await lookupWatchboxdMovies(
    unresolved.map((movie) => movie.tmdbId),
    signal,
  );
  const lookupByTmdbId = new Map(lookups.map((lookup) => [lookup.tmdbId, lookup]));
  const fetchedAt = new Date();
  let pendingCount = 0;

  for (const movie of unresolved) {
    const lookup = lookupByTmdbId.get(movie.tmdbId);
    if (!lookup) {
      pendingCount += 1;
      continue;
    }

    if (lookup.letterboxdRatingJobId) {
      pendingCount += 1;
      await prisma.roomMovie.update({
        where: { id: movie.id },
        data: {
          letterboxdJobId: lookup.letterboxdRatingJobId,
          letterboxdSlug: lookup.letterboxdSlug ?? movie.letterboxdSlug,
        },
      });
      continue;
    }

    await prisma.roomMovie.update({
      where: { id: movie.id },
      data: {
        letterboxdRating: lookup.letterboxdRating,
        letterboxdSlug: lookup.letterboxdSlug ?? movie.letterboxdSlug,
        letterboxdJobId: null,
        ratingFetchedAt: fetchedAt,
      },
    });
  }

  return { pendingCount, retryAfter: DEFAULT_RETRY_AFTER_SECONDS };
}

async function loadAggregationInput(roomId: string) {
  const [movies, ballots, participants] = await Promise.all([
    prisma.roomMovie.findMany({
      where: { roomId },
      select: {
        id: true,
        letterboxdRating: true,
        nominations: {
          select: { participantId: true },
        },
      },
    }),
    prisma.ballot.findMany({
      where: { roomId },
      select: {
        participantId: true,
        ranks: {
          select: {
            roomMovieId: true,
            rank: true,
          },
        },
      },
    }),
    prisma.roomParticipant.findMany({
      where: { roomId },
      select: { id: true },
    }),
  ]);

  return {
    movies: movies.map((movie) => ({
      roomMovieId: movie.id,
      nominatorParticipantIds: movie.nominations.map(
        (nomination) => nomination.participantId,
      ),
      letterboxdRating: letterboxdRatingFromValue(movie.letterboxdRating),
    })),
    ballots: ballots.map((ballot) => ({
      participantId: ballot.participantId,
      ranks: ballot.ranks,
    })),
    participantIds: participants.map((participant) => participant.id),
  };
}

export async function finalizeRoom(
  input: FinalizeRoomInput,
): Promise<FinalizeRoomResult> {
  const room = await loadFinalizationRoom(input.code);
  if (!room) {
    throw new FinalizationError("ROOM_NOT_FOUND", "That room does not exist.");
  }

  const participant = room.participants.find(
    (entry) => entry.userId === input.userId,
  );
  if (!participant) {
    throw new AuthorizationError("You are not a member of this room.");
  }

  if (
    room.phase === RoomPhase.REVEAL
    || room.phase === RoomPhase.COMPLETE
  ) {
    const counts = await countRoomResults(room.id);
    return {
      status: "ready",
      phase: room.phase,
      alreadyFinalized: true,
      resultCount: counts.resultCount,
      finalistCount: counts.finalistCount,
    };
  }

  if (room.phase !== RoomPhase.FINALIZING) {
    throw new FinalizationError(
      "WRONG_PHASE",
      "Room must be finalizing before results can be written.",
    );
  }

  if (!room.rosterLockedAt) {
    throw new FinalizationError(
      "ROSTER_UNLOCKED",
      "Finalization cannot start until the room roster is locked.",
    );
  }

  const existing = await countRoomResults(room.id);
  if (existing.resultCount === existing.movieCount) {
    return persistReadyResults({ roomId: room.id, drafts: [] });
  }

  const ratings = await resolveMissingLetterboxdRatings(room.id, input.signal);
  if (ratings.pendingCount > 0) {
    return {
      status: "pending",
      phase: RoomPhase.FINALIZING,
      retryAfter: ratings.retryAfter,
      pendingRatingCount: ratings.pendingCount,
      alreadyFinalized: false,
    };
  }

  const aggregation = await loadAggregationInput(room.id);
  const drafts = assembleRoomResults({
    movies: aggregation.movies,
    ballots: aggregation.ballots,
    participantIds: aggregation.participantIds,
    ordering: room.finalistOrdering,
  });

  return persistReadyResults({
    roomId: room.id,
    drafts,
  });
}
