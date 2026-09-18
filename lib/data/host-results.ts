import "server-only";

import { RoomPhase } from "@/app/generated/prisma/enums";
import { AuthorizationError, DomainError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";
import {
  getFinalistOrderingStrategy,
  listFinalistOrderingStrategies,
  orderFinalists,
} from "@/lib/domain/finalist-ordering";

export async function getHostResults(code: string, userId: string) {
  const room = await prisma.room.findUnique({
    where: { code },
    select: { id: true, ownerId: true, phase: true, finalistOrdering: true },
  });

  if (!room) throw new DomainError("That room does not exist.");
  if (room.ownerId !== userId) {
    throw new AuthorizationError("Only the room host can view all finalist results.");
  }
  if (room.phase !== RoomPhase.REVEAL && room.phase !== RoomPhase.COMPLETE) {
    return null;
  }

  // Read the persisted ranking and shuffle values, including unrevealed finalists.
  const results = await prisma.roomMovieResult.findMany({
    where: { roomId: room.id, isFinalist: true },
    orderBy: { aggregateRank: "asc" },
    select: {
      roomMovieId: true,
      aggregateRank: true,
      aggregateScore: true,
      tieBreakRandom: true,
      finalOrder: true,
      revealedAt: true,
      roomMovie: {
        select: {
          title: true,
          releaseYear: true,
          _count: { select: { ballotRanks: true } },
        },
      },
    },
  });

  return {
    officialOrderingLabel: getFinalistOrderingStrategy(room.finalistOrdering).label,
    finalists: results.map((result, index) => ({
      roomMovieId: result.roomMovieId,
      title: result.roomMovie.title,
      releaseYear: result.roomMovie.releaseYear,
      finalistRank: index + 1,
      aggregateRank: result.aggregateRank,
      score: result.aggregateScore,
      voteCount: result.roomMovie._count.ballotRanks,
      revealed: result.revealedAt !== null,
    })),
    orders: [
      {
        id: "OFFICIAL",
        label: "Official reveal order",
        description: "The reveal order chosen for this club.",
        movieIds: [...results]
          .sort((a, b) => (a.finalOrder ?? Infinity) - (b.finalOrder ?? Infinity))
          .map((result) => result.roomMovieId),
      },
      ...listFinalistOrderingStrategies().map((strategy) => ({
        id: strategy.id,
        label: strategy.label,
        description: strategy.id === "RANDOM"
          ? "A fixed random order that stays the same when you return."
          : strategy.description,
        movieIds: orderFinalists(strategy.id, results),
      })),
    ],
  };
}

export type HostResults = NonNullable<Awaited<ReturnType<typeof getHostResults>>>;
