import "server-only";

import { prisma } from "@/lib/prisma";
import { AuthorizationError, DomainError } from "@/lib/auth/errors";
import { categorizeDashboardRooms } from "@/lib/domain/dashboard";

export async function getRoomPreview(code: string, userId?: string) {
  const room = await prisma.room.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      name: true,
      maxParticipants: true,
      rosterLockedAt: true,
      joinDeadline: true,
      owner: { select: { displayName: true } },
      participants: userId
        ? { where: { userId }, select: { id: true } }
        : { take: 0, select: { id: true } },
      _count: { select: { participants: true } },
    },
  });

  if (!room) {
    throw new DomainError("That room does not exist.");
  }

  return {
    id: room.id,
    code: room.code,
    name: room.name,
    ownerName: room.owner.displayName,
    maxParticipants: room.maxParticipants,
    participantCount: room._count.participants,
    rosterLocked: Boolean(room.rosterLockedAt),
    joinDeadline: room.joinDeadline,
    isMember: room.participants.length > 0,
  };
}

export async function getRoomForMember(code: string, userId: string) {
  const room = await prisma.room.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      name: true,
      phase: true,
      ownerId: true,
      maxParticipants: true,
      selectionsPerUser: true,
      requireParticipantCoverage: true,
      rosterLockedAt: true,
      participants: {
        orderBy: { joinedAt: "asc" },
        select: {
          id: true,
          userId: true,
          joinedAt: true,
          user: { select: { displayName: true } },
        },
      },
    },
  });

  if (!room) {
    throw new DomainError("That room does not exist.");
  }

  if (!room.participants.some((participant) => participant.userId === userId)) {
    throw new AuthorizationError("Join this room before opening its lobby.");
  }

  return room;
}

export async function getDashboardRooms(userId: string) {
  const rooms = await prisma.room.findMany({
    where: {
      OR: [
        { ownerId: userId },
        { participants: { some: { userId } } },
      ],
    },
    orderBy: [
      { updatedAt: "desc" },
      { createdAt: "desc" },
    ],
    select: {
      id: true,
      code: true,
      name: true,
      phase: true,
      ownerId: true,
      maxParticipants: true,
      updatedAt: true,
      owner: { select: { displayName: true } },
      _count: { select: { participants: true } },
    },
  });

  return categorizeDashboardRooms(rooms, userId);
}
