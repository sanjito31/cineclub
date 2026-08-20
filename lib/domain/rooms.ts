import "server-only";

import { randomInt } from "node:crypto";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/auth/errors";
import { requireProfile } from "@/lib/data/profiles";

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

  return prisma.$transaction(
    async (tx) => {
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
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
