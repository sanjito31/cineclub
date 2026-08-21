import "server-only";

import { randomInt } from "node:crypto";
import { Prisma } from "@/app/generated/prisma/client";
import { FinalistOrdering, RoomPhase } from "@/app/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { AuthorizationError, DomainError } from "@/lib/auth/errors";
import { requireProfile } from "@/lib/data/profiles";
import { assertRoomPhase } from "@/lib/domain/room-lifecycle";
import {
  runSerializableRoomTransaction,
  transitionRoomPhaseInTransaction,
} from "@/lib/domain/room-transitions";

const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const roomCodeLength = 6;

function generateRoomCode() {
  return Array.from(
    { length: roomCodeLength },
    () => codeAlphabet[randomInt(codeAlphabet.length)],
  ).join("");
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export type CreateRoomInput = {
  ownerId: string;
  name: string;
  maxParticipants: number;
  selectionsPerUser: number;
  requireParticipantCoverage: boolean;
  finalistOrdering: FinalistOrdering;
  joinDeadline: Date | null;
  selectionDeadline: Date | null;
  votingDeadline: Date | null;
};

export async function createRoom(input: CreateRoomInput) {
  const profile = await requireProfile(input.ownerId);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await prisma.room.create({
        data: {
          code: generateRoomCode(),
          ownerId: input.ownerId,
          name: input.name,
          maxParticipants: input.maxParticipants,
          selectionsPerUser: input.selectionsPerUser,
          requireParticipantCoverage: input.requireParticipantCoverage,
          finalistOrdering: input.finalistOrdering,
          joinDeadline: input.joinDeadline,
          selectionDeadline: input.selectionDeadline,
          votingDeadline: input.votingDeadline,
          participants: {
            create: {
              userId: input.ownerId,
              letterboxdUsernameSnapshot: profile.letterboxdUsername,
            },
          },
        },
        select: { id: true, code: true },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
    }
  }

  throw new DomainError("Could not allocate a room code. Please try again.");
}

export async function joinRoom(input: { userId: string; code: string }) {
  const profile = await requireProfile(input.userId);

  return runSerializableRoomTransaction(async (tx) => {
    const room = await tx.room.findUnique({
      where: { code: input.code },
      select: {
        id: true,
        code: true,
        maxParticipants: true,
        rosterLockedAt: true,
        joinDeadline: true,
        participants: {
          select: { id: true, userId: true },
        },
      },
    });

    if (!room) {
      throw new DomainError("That room does not exist.");
    }

    const existing = room.participants.find(
      (participant) => participant.userId === input.userId,
    );

    if (existing) {
      return { roomId: room.id, code: room.code, participantId: existing.id };
    }

    if (room.rosterLockedAt) {
      throw new DomainError("This room's roster is locked.");
    }

    if (room.joinDeadline && room.joinDeadline <= new Date()) {
      throw new DomainError("The deadline to join this room has passed.");
    }

    if (room.participants.length >= room.maxParticipants) {
      throw new DomainError("This room is already full.");
    }

    const participant = await tx.roomParticipant.create({
      data: {
        roomId: room.id,
        userId: input.userId,
        letterboxdUsernameSnapshot: profile.letterboxdUsername,
      },
      select: { id: true },
    });

    return { roomId: room.id, code: room.code, participantId: participant.id };
  });
}

export async function lockRoster(input: {
  userId: string;
  code: string;
}) {
  return runSerializableRoomTransaction(async (tx) => {
    const room = await tx.room.findUnique({
      where: { code: input.code },
      select: {
        id: true,
        code: true,
        ownerId: true,
        phase: true,
        rosterLockedAt: true,
        participants: {
          select: {
            id: true,
            userId: true,
            selectionSubmittedAt: true,
          },
        },
      },
    });

    if (!room) {
      throw new DomainError("That room does not exist.");
    }

    if (room.ownerId !== input.userId) {
      throw new AuthorizationError("Only the room host can lock the roster.");
    }

    if (
      !room.participants.some(
        (participant) => participant.userId === input.userId,
      )
    ) {
      throw new AuthorizationError("You are not a member of this room.");
    }

    if (room.rosterLockedAt) {
      return {
        roomId: room.id,
        code: room.code,
        rosterLockedAt: room.rosterLockedAt,
        phase: room.phase,
        alreadyLocked: true,
        phaseTransitioned: false,
      };
    }

    assertRoomPhase(room.phase, RoomPhase.SELECTION);

    const rosterLockedAt = new Date();
    await tx.room.update({
      where: {
        id: room.id,
        phase: RoomPhase.SELECTION,
        rosterLockedAt: null,
      },
      data: { rosterLockedAt },
    });

    const allParticipantsSubmittedSelections = room.participants.every(
      (participant) => participant.selectionSubmittedAt !== null &&
        participant.selectionSubmittedAt !== undefined,
    );
    const transition = allParticipantsSubmittedSelections
      ? await transitionRoomPhaseInTransaction(tx, {
          roomId: room.id,
          targetPhase: RoomPhase.VOTING,
        })
      : null;

    return {
      roomId: room.id,
      code: room.code,
      rosterLockedAt,
      phase: transition?.phase ?? RoomPhase.SELECTION,
      alreadyLocked: false,
      phaseTransitioned: transition?.transitioned ?? false,
    };
  });
}

export async function updateFinalistOrdering(input: {
  userId: string;
  code: string;
  ordering: FinalistOrdering;
}) {
  return runSerializableRoomTransaction(async (tx) => {
    const room = await tx.room.findUnique({
      where: { code: input.code },
      select: {
        id: true,
        code: true,
        ownerId: true,
        phase: true,
        finalistOrdering: true,
        participants: {
          select: { userId: true },
        },
      },
    });

    if (!room) {
      throw new DomainError("That room does not exist.");
    }

    if (room.ownerId !== input.userId) {
      throw new AuthorizationError("Only the room host can change the reveal order.");
    }

    if (!room.participants.some((participant) => participant.userId === input.userId)) {
      throw new AuthorizationError("You are not a member of this room.");
    }

    if (
      room.phase === RoomPhase.REVEAL
      || room.phase === RoomPhase.COMPLETE
    ) {
      throw new DomainError("Reveal order is locked after finalization.");
    }

    const resultCount = await tx.roomMovieResult.count({
      where: { roomId: room.id },
    });
    if (resultCount > 0) {
      throw new DomainError("Reveal order is locked after finalization.");
    }

    if (room.finalistOrdering === input.ordering) {
      return {
        roomId: room.id,
        code: room.code,
        finalistOrdering: room.finalistOrdering,
        unchanged: true,
      };
    }

    const updated = await tx.room.update({
      where: { id: room.id },
      data: { finalistOrdering: input.ordering },
      select: { finalistOrdering: true },
    });

    return {
      roomId: room.id,
      code: room.code,
      finalistOrdering: updated.finalistOrdering,
      unchanged: false,
    };
  });
}
