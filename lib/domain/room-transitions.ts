import "server-only";

import { Prisma } from "@/app/generated/prisma/client";
import { RoomPhase } from "@/app/generated/prisma/enums";
import { AuthorizationError, DomainError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";
import { assertRoomPhaseTransition } from "@/lib/domain/room-lifecycle";

const phaseOrder: readonly RoomPhase[] = [
  RoomPhase.SELECTION,
  RoomPhase.VOTING,
  RoomPhase.FINALIZING,
  RoomPhase.REVEAL,
  RoomPhase.COMPLETE,
];

const maximumTransactionAttempts = 3;

export type RoomTransitionTarget =
  | typeof RoomPhase.VOTING
  | typeof RoomPhase.FINALIZING
  | typeof RoomPhase.REVEAL;

export type RoomTransitionBlocker =
  | "ROSTER_UNLOCKED"
  | "NO_PARTICIPANTS"
  | "SELECTIONS_PENDING"
  | "BALLOTS_PENDING"
  | "RESULTS_PENDING";

export type RoomTransitionResult = {
  roomId: string;
  previousPhase: RoomPhase;
  phase: RoomPhase;
  transitioned: boolean;
  alreadyReached: boolean;
  blocker: RoomTransitionBlocker | null;
};

function hasReachedPhase(current: RoomPhase, target: RoomPhase) {
  return phaseOrder.indexOf(current) >= phaseOrder.indexOf(target);
}

function isTransactionConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

export async function runSerializableRoomTransaction<Result>(
  operation: (tx: Prisma.TransactionClient) => Promise<Result>,
) {
  for (let attempt = 1; attempt <= maximumTransactionAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isTransactionConflict(error) || attempt === maximumTransactionAttempts) {
        throw error;
      }
    }
  }

  throw new Error("Serializable room transaction exhausted its retry budget.");
}

async function getTransitionBlocker(
  tx: Prisma.TransactionClient,
  room: {
    id: string;
    phase: RoomPhase;
    rosterLockedAt: Date | null;
  },
  targetPhase: RoomTransitionTarget,
): Promise<RoomTransitionBlocker | null> {
  if (!room.rosterLockedAt) {
    return "ROSTER_UNLOCKED";
  }

  if (targetPhase === RoomPhase.VOTING) {
    const participantCount = await tx.roomParticipant.count({
      where: { roomId: room.id },
    });

    if (participantCount === 0) {
      return "NO_PARTICIPANTS";
    }

    const pendingSelectionCount = await tx.roomParticipant.count({
      where: {
        roomId: room.id,
        selectionSubmittedAt: null,
      },
    });

    return pendingSelectionCount === 0 ? null : "SELECTIONS_PENDING";
  }

  if (targetPhase === RoomPhase.FINALIZING) {
    const participantCount = await tx.roomParticipant.count({
      where: { roomId: room.id },
    });

    if (participantCount === 0) {
      return "NO_PARTICIPANTS";
    }

    const pendingBallotCount = await tx.roomParticipant.count({
      where: {
        roomId: room.id,
        votingSubmittedAt: null,
      },
    });

    return pendingBallotCount === 0 ? null : "BALLOTS_PENDING";
  }

  const [movieCount, resultCount] = await Promise.all([
    tx.roomMovie.count({ where: { roomId: room.id } }),
    tx.roomMovieResult.count({ where: { roomId: room.id } }),
  ]);

  return resultCount === movieCount ? null : "RESULTS_PENDING";
}

/**
 * Use from an already-authorized mutation so its write and phase check commit
 * atomically. Standalone callers should use transitionRoomPhase instead.
 */
export async function transitionRoomPhaseInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    roomId: string;
    targetPhase: RoomTransitionTarget;
  },
): Promise<RoomTransitionResult> {
  const room = await tx.room.findUnique({
    where: { id: input.roomId },
    select: {
      id: true,
      phase: true,
      rosterLockedAt: true,
      finalizedAt: true,
    },
  });

  if (!room) {
    throw new DomainError("That room does not exist.");
  }

  if (hasReachedPhase(room.phase, input.targetPhase)) {
    return {
      roomId: room.id,
      previousPhase: room.phase,
      phase: room.phase,
      transitioned: false,
      alreadyReached: true,
      blocker: null,
    };
  }

  assertRoomPhaseTransition(room.phase, input.targetPhase);

  const blocker = await getTransitionBlocker(tx, room, input.targetPhase);

  if (blocker) {
    return {
      roomId: room.id,
      previousPhase: room.phase,
      phase: room.phase,
      transitioned: false,
      alreadyReached: false,
      blocker,
    };
  }

  const transitionedAt = new Date();
  const updated = await tx.room.update({
    where: {
      id: room.id,
      phase: room.phase,
    },
    data: {
      phase: input.targetPhase,
      finalizedAt:
        input.targetPhase === RoomPhase.REVEAL
          ? (room.finalizedAt ?? transitionedAt)
          : undefined,
    },
    select: { phase: true },
  });

  return {
    roomId: room.id,
    previousPhase: room.phase,
    phase: updated.phase,
    transitioned: true,
    alreadyReached: false,
    blocker: null,
  };
}

export async function transitionRoomPhase(input: {
  roomId: string;
  userId: string;
  targetPhase: RoomTransitionTarget;
}) {
  return runSerializableRoomTransaction(async (tx) => {
    const participant = await tx.roomParticipant.findUnique({
      where: {
        roomId_userId: {
          roomId: input.roomId,
          userId: input.userId,
        },
      },
      select: { id: true },
    });

    if (!participant) {
      throw new AuthorizationError("You are not a member of this room.");
    }

    return transitionRoomPhaseInTransaction(tx, input);
  });
}
