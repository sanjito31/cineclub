import assert from "node:assert/strict";
import { FinalistOrdering, RoomPhase } from "../../app/generated/prisma/enums";

type Participant = {
  id: string;
  roomId: string;
  userId: string;
  letterboxdUsernameSnapshot: string | null;
  selectionSubmittedAt: Date | null;
  votingSubmittedAt: Date | null;
};

type Room = {
  id: string;
  code: string;
  ownerId: string;
  phase: RoomPhase;
  maxParticipants: number;
  rosterLockedAt: Date | null;
  joinDeadline: Date | null;
  finalizedAt: Date | null;
  finalistOrdering: FinalistOrdering;
  participants: Participant[];
};

type Profile = {
  id: string;
  letterboxdUsername: string | null;
};

type TransactionOptions = {
  isolationLevel?: string;
};

const rooms = new Map<string, Room>();
const profiles = new Map<string, Profile>();
const resultCounts = new Map<string, number>();
const transactionOptions: TransactionOptions[] = [];

let nextParticipantId = 1;
let transactionTail = Promise.resolve();

function selectedRoom(code: string) {
  const room = rooms.get(code);

  if (!room) {
    return null;
  }

  return {
    id: room.id,
    code: room.code,
    ownerId: room.ownerId,
    phase: room.phase,
    maxParticipants: room.maxParticipants,
    rosterLockedAt: room.rosterLockedAt,
    joinDeadline: room.joinDeadline,
    finalizedAt: room.finalizedAt,
    finalistOrdering: room.finalistOrdering,
    participants: room.participants.map(
      ({ id, userId, selectionSubmittedAt, votingSubmittedAt }) => ({
        id,
        userId,
        selectionSubmittedAt,
        votingSubmittedAt,
      }),
    ),
  };
}

const transactionClient = {
  room: {
    findUnique: async (query: { where: { code?: string; id?: string } }) => {
      if (query.where.code) {
        return selectedRoom(query.where.code);
      }

      const room = [...rooms.values()].find(({ id }) => id === query.where.id);
      return room ? selectedRoom(room.code) : null;
    },
    update: async (query: {
      where: {
        code?: string;
        id?: string;
        phase?: RoomPhase;
        rosterLockedAt?: Date | null;
      };
      data: {
        rosterLockedAt?: Date;
        phase?: RoomPhase;
        finalizedAt?: Date;
        finalistOrdering?: FinalistOrdering;
      };
    }) => {
      const room = query.where.code
        ? rooms.get(query.where.code)
        : [...rooms.values()].find(({ id }) => id === query.where.id);

      assert.ok(room, "The room update must target an existing fixture room.");
      if (query.where.phase !== undefined) {
        assert.equal(room.phase, query.where.phase);
      }
      if (query.where.rosterLockedAt !== undefined) {
        assert.equal(room.rosterLockedAt, query.where.rosterLockedAt);
      }

      if (query.data.rosterLockedAt) {
        room.rosterLockedAt = query.data.rosterLockedAt;
      }
      if (query.data.phase) {
        room.phase = query.data.phase;
      }
      if (query.data.finalizedAt) {
        room.finalizedAt = query.data.finalizedAt;
      }
      if (query.data.finalistOrdering) {
        room.finalistOrdering = query.data.finalistOrdering;
      }

      return selectedRoom(room.code);
    },
  },
  roomParticipant: {
    create: async (query: {
      data: {
        roomId: string;
        userId: string;
        letterboxdUsernameSnapshot: string | null;
      };
    }) => {
      const room = [...rooms.values()].find(({ id }) => id === query.data.roomId);
      assert.ok(room, "The participant must reference an existing fixture room.");

      const duplicate = room.participants.find(
        ({ userId }) => userId === query.data.userId,
      );
      assert.equal(duplicate, undefined, "The database uniqueness constraint rejected a duplicate.");

      const participant = {
        id: `participant-${nextParticipantId++}`,
        ...query.data,
        selectionSubmittedAt: null,
        votingSubmittedAt: null,
      };
      room.participants.push(participant);
      return { id: participant.id };
    },
    count: async (query: {
      where: {
        roomId: string;
        selectionSubmittedAt?: null;
        votingSubmittedAt?: null;
      };
    }) => {
      const room = [...rooms.values()].find(({ id }) => id === query.where.roomId);
      if (!room) return 0;

      return room.participants.filter((participant) => {
        if (
          query.where.selectionSubmittedAt === null &&
          participant.selectionSubmittedAt !== null
        ) {
          return false;
        }
        if (
          query.where.votingSubmittedAt === null &&
          participant.votingSubmittedAt !== null
        ) {
          return false;
        }
        return true;
      }).length;
    },
    findUnique: async (query: {
      where: { roomId_userId: { roomId: string; userId: string } };
    }) => {
      const room = [...rooms.values()].find(
        ({ id }) => id === query.where.roomId_userId.roomId,
      );
      const participant = room?.participants.find(
        ({ userId }) => userId === query.where.roomId_userId.userId,
      );
      return participant ? { id: participant.id } : null;
    },
  },
  roomMovie: {
    count: async () => 0,
  },
  roomMovieResult: {
    count: async (query: { where: { roomId: string } }) =>
      resultCounts.get(query.where.roomId) ?? 0,
  },
};

export const prisma = {
  $transaction: async <Result>(
    operation: (tx: typeof transactionClient) => Promise<Result>,
    options: TransactionOptions = {},
  ) => {
    transactionOptions.push(options);

    let releaseTransaction: () => void = () => undefined;
    const previousTransaction = transactionTail;
    transactionTail = new Promise<void>((resolve) => {
      releaseTransaction = resolve;
    });

    await previousTransaction;

    try {
      return await operation(transactionClient);
    } finally {
      releaseTransaction();
    }
  },
};

export async function requireProfile(userId: string) {
  const profile = profiles.get(userId);
  assert.ok(profile, `Missing fixture profile for ${userId}.`);
  return profile;
}

export function resetRoomServiceFixture() {
  rooms.clear();
  profiles.clear();
  resultCounts.clear();
  transactionOptions.length = 0;
  nextParticipantId = 1;
  transactionTail = Promise.resolve();
}

export function seedProfile(
  id: string,
  letterboxdUsername: string | null = null,
) {
  profiles.set(id, { id, letterboxdUsername });
}

export function seedRoom(input: {
  id?: string;
  code?: string;
  ownerId: string;
  maxParticipants: number;
  participantUserIds?: string[];
  selectionSubmittedUserIds?: string[];
  votingSubmittedUserIds?: string[];
  phase?: RoomPhase;
  rosterLockedAt?: Date | null;
  joinDeadline?: Date | null;
  finalistOrdering?: FinalistOrdering;
  resultCount?: number;
}) {
  const id = input.id ?? "room-1";
  const code = input.code ?? "ABC234";
  const participantUserIds = input.participantUserIds ?? [input.ownerId];
  const selectionSubmittedUserIds = new Set(input.selectionSubmittedUserIds);
  const votingSubmittedUserIds = new Set(input.votingSubmittedUserIds);

  for (const userId of participantUserIds) {
    if (!profiles.has(userId)) {
      seedProfile(userId);
    }
  }

  rooms.set(code, {
    id,
    code,
    ownerId: input.ownerId,
    phase: input.phase ?? RoomPhase.SELECTION,
    maxParticipants: input.maxParticipants,
    rosterLockedAt: input.rosterLockedAt ?? null,
    joinDeadline: input.joinDeadline ?? null,
    finalizedAt: null,
    finalistOrdering: input.finalistOrdering ?? FinalistOrdering.RANKED_CHOICE,
    participants: participantUserIds.map((userId) => ({
      id: `participant-${nextParticipantId++}`,
      roomId: id,
      userId,
      letterboxdUsernameSnapshot: profiles.get(userId)?.letterboxdUsername ?? null,
      selectionSubmittedAt: selectionSubmittedUserIds.has(userId)
        ? new Date("2026-08-20T18:00:00.000Z")
        : null,
      votingSubmittedAt: votingSubmittedUserIds.has(userId)
        ? new Date("2026-08-20T18:30:00.000Z")
        : null,
    })),
  });

  if (input.resultCount) {
    resultCounts.set(id, input.resultCount);
  }
}

export function roomParticipantUserIds(code = "ABC234") {
  return rooms.get(code)?.participants.map(({ userId }) => userId) ?? [];
}

export function roomRosterLockedAt(code = "ABC234") {
  return rooms.get(code)?.rosterLockedAt ?? null;
}

export function roomPhase(code = "ABC234") {
  return rooms.get(code)?.phase;
}

export function roomFinalistOrdering(code = "ABC234") {
  return rooms.get(code)?.finalistOrdering;
}

export function recordedTransactionOptions() {
  return [...transactionOptions];
}
