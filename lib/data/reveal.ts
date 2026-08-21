import "server-only";

import { Prisma } from "@/app/generated/prisma/client";
import { RoomPhase } from "@/app/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { AuthorizationError } from "@/lib/auth/errors";
import { letterboxdRatingFromValue } from "@/lib/domain/finalization";
import {
  assertRevealAllowed,
  buildSpoilerSafeRevealView,
  lastRevealedFinalist,
  nextUnrevealedFinalist,
  revealCooldownEndsAt,
  RevealError,
  type RevealedMovieView,
  type RevealMovieDetails,
  type RevealResultRow,
  type SpoilerSafeRevealView,
} from "@/lib/domain/reveal";
import {
  runSerializableRoomTransaction,
  transitionRoomPhaseInTransaction,
} from "@/lib/domain/room-transitions";

const resultInclude = {
  roomMovie: {
    select: {
      id: true,
      title: true,
      releaseYear: true,
      posterPath: true,
      letterboxdRating: true,
      letterboxdSlug: true,
      nominations: {
        select: {
          participantId: true,
          participant: {
            select: {
              user: { select: { displayName: true } },
            },
          },
        },
      },
    },
  },
} as const;

type ResultRow = Prisma.RoomMovieResultGetPayload<{ include: typeof resultInclude }>;

export type RevealContext = SpoilerSafeRevealView & {
  roomId: string;
  code: string;
  name: string;
  ownerId: string;
  isOwner: boolean;
};

export type RevealNextInput = {
  userId: string;
  code: string;
  confirmEarlyReveal?: boolean;
  now?: Date;
};

export type RevealNextNeedsConfirmation = {
  status: "needs_confirmation";
  phase: typeof RoomPhase.REVEAL;
  cooldownEndsAt: string;
};

export type RevealNextRevealed = {
  status: "revealed" | "already_revealed";
  phase: RoomPhase;
  alreadyRevealed: boolean;
  revealedMovie: RevealedMovieView;
  remainingCount: number;
};

export type RevealNextComplete = {
  status: "complete";
  phase: typeof RoomPhase.COMPLETE;
  remainingCount: 0;
};

export type RevealNextResult =
  | RevealNextNeedsConfirmation
  | RevealNextRevealed
  | RevealNextComplete;

function movieDetailsFromRow(row: ResultRow): RevealMovieDetails {
  return {
    title: row.roomMovie.title,
    releaseYear: row.roomMovie.releaseYear,
    posterPath: row.roomMovie.posterPath,
    letterboxdRating: letterboxdRatingFromValue(row.roomMovie.letterboxdRating),
    letterboxdSlug: row.roomMovie.letterboxdSlug,
    nominators: row.roomMovie.nominations.map((nomination) => ({
      participantId: nomination.participantId,
      displayName: nomination.participant.user.displayName,
    })),
  };
}

function toRevealResultRow(row: ResultRow): RevealResultRow & {
  movie: RevealMovieDetails | null;
} {
  return {
    roomMovieId: row.roomMovieId,
    isFinalist: row.isFinalist,
    finalOrder: row.finalOrder,
    scheduledRevealAt: row.scheduledRevealAt,
    revealedAt: row.revealedAt,
    movie: row.revealedAt ? movieDetailsFromRow(row) : null,
  };
}

function revealedMovieView(row: ResultRow): RevealedMovieView {
  if (!row.revealedAt || row.finalOrder == null) {
    throw new RevealError(
      "NOTHING_TO_REVEAL",
      "That movie has not been revealed yet.",
    );
  }

  const movie = movieDetailsFromRow(row);
  return {
    roomMovieId: row.roomMovieId,
    title: movie.title,
    releaseYear: movie.releaseYear,
    posterPath: movie.posterPath,
    letterboxdRating: movie.letterboxdRating,
    letterboxdSlug: movie.letterboxdSlug,
    nominators: movie.nominators,
    revealedAt: row.revealedAt.toISOString(),
    revealPosition: row.finalOrder,
  };
}

async function loadRevealRoom(code: string) {
  return prisma.room.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      name: true,
      phase: true,
      ownerId: true,
      participants: {
        select: { userId: true },
      },
    },
  });
}

async function loadResultRows(
  tx: Prisma.TransactionClient | typeof prisma,
  roomId: string,
) {
  return tx.roomMovieResult.findMany({
    where: { roomId },
    include: resultInclude,
  });
}

export async function getRevealContext(
  code: string,
  userId: string,
  now = new Date(),
): Promise<RevealContext> {
  const room = await loadRevealRoom(code);
  if (!room) {
    throw new RevealError("ROOM_NOT_FOUND", "That room does not exist.");
  }

  if (!room.participants.some((participant) => participant.userId === userId)) {
    throw new AuthorizationError("You are not a member of this room.");
  }

  if (room.phase !== RoomPhase.REVEAL && room.phase !== RoomPhase.COMPLETE) {
    throw new RevealError(
      "WRONG_PHASE",
      "Results can only be read after finalization.",
    );
  }

  const rows = await loadResultRows(prisma, room.id);
  const view = buildSpoilerSafeRevealView({
    phase: room.phase,
    now,
    results: rows.map(toRevealResultRow),
  });

  return {
    ...view,
    roomId: room.id,
    code: room.code,
    name: room.name,
    ownerId: room.ownerId,
    isOwner: room.ownerId === userId,
  };
}

export async function revealNextMovie(
  input: RevealNextInput,
): Promise<RevealNextResult> {
  const now = input.now ?? new Date();
  let targetMovieId: string | undefined;

  return runSerializableRoomTransaction(async (tx) => {
    const room = await tx.room.findUnique({
      where: { code: input.code },
      select: {
        id: true,
        code: true,
        phase: true,
        ownerId: true,
        participants: {
          select: { userId: true },
        },
      },
    });

    if (!room) {
      throw new RevealError("ROOM_NOT_FOUND", "That room does not exist.");
    }

    if (!room.participants.some((participant) => participant.userId === input.userId)) {
      throw new AuthorizationError("You are not a member of this room.");
    }

    if (room.ownerId !== input.userId) {
      throw new AuthorizationError("Only the room host can reveal the next movie.");
    }

    if (room.phase === RoomPhase.COMPLETE) {
      return {
        status: "complete" as const,
        phase: RoomPhase.COMPLETE,
        remainingCount: 0 as const,
      };
    }

    if (room.phase !== RoomPhase.REVEAL) {
      throw new RevealError(
        "WRONG_PHASE",
        "Movies can only be revealed after finalization.",
      );
    }

    const rows = await loadResultRows(tx, room.id);
    const mapped = rows.map(toRevealResultRow);
    const target = targetMovieId
      ? mapped.find((row) => row.roomMovieId === targetMovieId) ?? null
      : nextUnrevealedFinalist(mapped);

    if (targetMovieId && target?.revealedAt) {
      const revealedRow = rows.find((row) => row.roomMovieId === targetMovieId);
      if (!revealedRow) {
        throw new RevealError("NOTHING_TO_REVEAL", "There is nothing left to reveal.");
      }
      return {
        status: "already_revealed" as const,
        phase: room.phase,
        alreadyRevealed: true,
        revealedMovie: revealedMovieView(revealedRow),
        remainingCount: mapped.filter(
          (row) => row.isFinalist && row.revealedAt === null,
        ).length,
      };
    }

    const next = target && target.revealedAt === null ? target : null;
    if (!next) {
      const completion = await transitionRoomPhaseInTransaction(tx, {
        roomId: room.id,
        targetPhase: RoomPhase.COMPLETE,
      });
      if (completion.phase !== RoomPhase.COMPLETE) {
        throw new RevealError(
          "NOTHING_TO_REVEAL",
          "There is nothing left to reveal.",
        );
      }
      return {
        status: "complete" as const,
        phase: RoomPhase.COMPLETE,
        remainingCount: 0 as const,
      };
    }

    targetMovieId = next.roomMovieId;
    const previous = lastRevealedFinalist(mapped);
    const cooldownEndsAt = revealCooldownEndsAt({
      scheduledRevealAt: next.scheduledRevealAt,
      previousRevealedAt: previous?.revealedAt ?? null,
    });

    if (isRevealOnCooldownForAction(cooldownEndsAt, now, input.confirmEarlyReveal)) {
      return {
        status: "needs_confirmation" as const,
        phase: RoomPhase.REVEAL,
        cooldownEndsAt: (cooldownEndsAt ?? now).toISOString(),
      };
    }

    const updated = await tx.roomMovieResult.updateMany({
      where: {
        roomId: room.id,
        roomMovieId: next.roomMovieId,
        revealedAt: null,
      },
      data: { revealedAt: now },
    });

    if (updated.count === 0) {
      const current = await tx.roomMovieResult.findUnique({
        where: {
          roomId_roomMovieId: {
            roomId: room.id,
            roomMovieId: next.roomMovieId,
          },
        },
        include: resultInclude,
      });
      if (!current?.revealedAt) {
        throw new RevealError("NOTHING_TO_REVEAL", "There is nothing left to reveal.");
      }
      return {
        status: "already_revealed" as const,
        phase: room.phase,
        alreadyRevealed: true,
        revealedMovie: revealedMovieView(current),
        remainingCount: mapped.filter(
          (row) =>
            row.isFinalist
            && row.revealedAt === null
            && row.roomMovieId !== next.roomMovieId,
        ).length,
      };
    }

    const remainingCount = mapped.filter(
      (row) =>
        row.isFinalist
        && row.revealedAt === null
        && row.roomMovieId !== next.roomMovieId,
    ).length;

    let phase: RoomPhase = room.phase;
    if (remainingCount === 0) {
      const completion = await transitionRoomPhaseInTransaction(tx, {
        roomId: room.id,
        targetPhase: RoomPhase.COMPLETE,
      });
      if (completion.phase !== RoomPhase.COMPLETE) {
        throw new RevealError(
          "NOTHING_TO_REVEAL",
          "There is nothing left to reveal.",
        );
      }
      phase = RoomPhase.COMPLETE;
    }

    const revealedRow = await tx.roomMovieResult.findUnique({
      where: {
        roomId_roomMovieId: {
          roomId: room.id,
          roomMovieId: next.roomMovieId,
        },
      },
      include: resultInclude,
    });
    if (!revealedRow) {
      throw new RevealError("NOTHING_TO_REVEAL", "There is nothing left to reveal.");
    }

    return {
      status: "revealed" as const,
      phase,
      alreadyRevealed: false,
      revealedMovie: revealedMovieView(revealedRow),
      remainingCount,
    };
  });
}

function isRevealOnCooldownForAction(
  cooldownEndsAt: Date | null,
  now: Date,
  confirmEarlyReveal: boolean | undefined,
) {
  try {
    assertRevealAllowed({
      cooldownEndsAt,
      now,
      confirmEarlyReveal: Boolean(confirmEarlyReveal),
    });
    return false;
  } catch (error) {
    if (error instanceof RevealError && error.code === "COOLDOWN_UNCONFIRMED") {
      return true;
    }
    throw error;
  }
}
