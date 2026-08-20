import "server-only";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { AuthorizationError } from "@/lib/auth/errors";
import { requireProfile } from "@/lib/data/profiles";

export async function requireAuthenticatedProfile() {
  const user = await requireUser();
  const profile = await requireProfile(user.id);
  return { user, profile };
}

export async function requireRoomMember(roomId: string) {
  const { user, profile } = await requireAuthenticatedProfile();
  const participant = await prisma.roomParticipant.findUnique({
    where: {
      roomId_userId: { roomId, userId: user.id },
    },
    select: { id: true, roomId: true, userId: true },
  });

  if (!participant) {
    throw new AuthorizationError("You are not a member of this room.");
  }

  return { user, profile, participant };
}

export async function requireRoomOwner(roomId: string) {
  const context = await requireRoomMember(roomId);
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { ownerId: true },
  });

  if (!room || room.ownerId !== context.user.id) {
    throw new AuthorizationError("Only the room host can do that.");
  }

  return { ...context, room };
}
