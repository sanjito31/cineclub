import "server-only";

import { prisma } from "@/lib/prisma";
import { AuthorizationError } from "@/lib/auth/errors";

const profileSelect = {
  id: true,
  displayName: true,
  letterboxdUsername: true,
} as const;

export async function getProfile(userId: string) {
  return prisma.profile.findUnique({
    where: { id: userId },
    select: profileSelect,
  });
}

export async function requireProfile(userId: string) {
  const profile = await getProfile(userId);

  if (!profile) {
    throw new AuthorizationError("Complete your profile before continuing.");
  }

  return profile;
}

export async function saveProfile(input: {
  userId: string;
  displayName: string;
  letterboxdUsername: string | null;
}) {
  return prisma.profile.upsert({
    where: { id: input.userId },
    create: {
      id: input.userId,
      displayName: input.displayName,
      letterboxdUsername: input.letterboxdUsername,
    },
    update: {
      displayName: input.displayName,
      letterboxdUsername: input.letterboxdUsername,
    },
    select: profileSelect,
  });
}
