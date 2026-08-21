import assert from "node:assert/strict";
import { RoomPhase } from "../../app/generated/prisma/enums";

type Room = {
  id: string;
  code: string;
  name: string;
  ownerId: string;
  phase: RoomPhase;
  rosterLockedAt: Date | null;
  finalizedAt: Date | null;
};

type Participant = {
  id: string;
  roomId: string;
  userId: string;
  displayName: string;
};

type RoomMovie = {
  id: string;
  roomId: string;
  title: string;
  releaseYear: number | null;
  posterPath: string | null;
  letterboxdRating: number | null;
  letterboxdSlug: string | null;
};

type Nomination = {
  participantId: string;
  roomMovieId: string;
};

type Result = {
  roomId: string;
  roomMovieId: string;
  isFinalist: boolean;
  finalOrder: number | null;
  scheduledRevealAt: Date | null;
  revealedAt: Date | null;
};

const rooms = new Map<string, Room>();
const participants = new Map<string, Participant>();
const roomMovies = new Map<string, RoomMovie>();
const nominations: Nomination[] = [];
const results = new Map<string, Result>();
const transactionOptions: { isolationLevel?: string }[] = [];

let transactionTail = Promise.resolve();

function cloneDate(value: Date | null) {
  return value ? new Date(value) : null;
}

function getRoomById(roomId: string) {
  return [...rooms.values()].find(({ id }) => id === roomId) ?? null;
}

function selectedRoom(room: Room) {
  return {
    id: room.id,
    code: room.code,
    name: room.name,
    ownerId: room.ownerId,
    phase: room.phase,
    rosterLockedAt: cloneDate(room.rosterLockedAt),
    finalizedAt: cloneDate(room.finalizedAt),
    participants: [...participants.values()]
      .filter((participant) => participant.roomId === room.id)
      .map((participant) => ({
        id: participant.id,
        userId: participant.userId,
      })),
  };
}

function includedResult(result: Result) {
  const movie = roomMovies.get(result.roomMovieId);
  assert.ok(movie, "Result rows must reference a movie.");
  return {
    ...result,
    scheduledRevealAt: cloneDate(result.scheduledRevealAt),
    revealedAt: cloneDate(result.revealedAt),
    roomMovie: {
      id: movie.id,
      title: movie.title,
      releaseYear: movie.releaseYear,
      posterPath: movie.posterPath,
      letterboxdRating: movie.letterboxdRating,
      letterboxdSlug: movie.letterboxdSlug,
      nominations: nominations
        .filter((nomination) => nomination.roomMovieId === movie.id)
        .map((nomination) => {
          const participant = participants.get(nomination.participantId);
          assert.ok(participant, "Nomination must reference a participant.");
          return {
            participantId: participant.id,
            participant: {
              user: { displayName: participant.displayName },
            },
          };
        }),
    },
  };
}

const transactionClient = {
  room: {
    findUnique: async (query: { where: { code?: string; id?: string } }) => {
      const room = query.where.code
        ? rooms.get(query.where.code)
        : getRoomById(query.where.id ?? "");
      return room ? selectedRoom(room) : null;
    },
    update: async (query: {
      where: { id: string; phase?: RoomPhase };
      data: { phase?: RoomPhase; finalizedAt?: Date };
    }) => {
      const room = getRoomById(query.where.id);
      assert.ok(room, "Room update must reference an existing room.");
      if (query.where.phase) assert.equal(room.phase, query.where.phase);
      if (query.data.phase) room.phase = query.data.phase;
      if (query.data.finalizedAt) room.finalizedAt = query.data.finalizedAt;
      return { phase: room.phase };
    },
  },
  roomParticipant: {
    count: async (query: { where: { roomId: string } }) =>
      [...participants.values()].filter(
        (participant) => participant.roomId === query.where.roomId,
      ).length,
    findUnique: async (query: {
      where: { roomId_userId: { roomId: string; userId: string } };
    }) => {
      const participant = [...participants.values()].find(
        (entry) =>
          entry.roomId === query.where.roomId_userId.roomId
          && entry.userId === query.where.roomId_userId.userId,
      );
      return participant ? { id: participant.id } : null;
    },
  },
  roomMovie: {
    count: async (query: { where: { roomId: string } }) =>
      [...roomMovies.values()].filter((movie) => movie.roomId === query.where.roomId)
        .length,
  },
  roomMovieResult: {
    count: async (query: {
      where: { roomId: string; isFinalist?: boolean; revealedAt?: null };
    }) =>
      [...results.values()].filter((result) => {
        if (result.roomId !== query.where.roomId) return false;
        if (query.where.isFinalist === true && !result.isFinalist) return false;
        if (query.where.revealedAt === null && result.revealedAt !== null) {
          return false;
        }
        return true;
      }).length,
    findMany: async (query: { where: { roomId: string } }) =>
      [...results.values()]
        .filter((result) => result.roomId === query.where.roomId)
        .map(includedResult),
    findUnique: async (query: {
      where: { roomId_roomMovieId: { roomId: string; roomMovieId: string } };
    }) => {
      const result = results.get(
        `${query.where.roomId_roomMovieId.roomId}:${query.where.roomId_roomMovieId.roomMovieId}`,
      );
      return result ? includedResult(result) : null;
    },
    updateMany: async (query: {
      where: { roomId: string; roomMovieId: string; revealedAt?: null };
      data: { revealedAt?: Date };
    }) => {
      const result = results.get(`${query.where.roomId}:${query.where.roomMovieId}`);
      if (!result) return { count: 0 };
      if (query.where.revealedAt === null && result.revealedAt !== null) {
        return { count: 0 };
      }
      if (query.data.revealedAt) result.revealedAt = query.data.revealedAt;
      return { count: 1 };
    },
  },
};

export const prisma = {
  ...transactionClient,
  $transaction: async <ResultValue>(
    operation: (tx: typeof transactionClient) => Promise<ResultValue>,
    options: { isolationLevel?: string } = {},
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

export function resetRevealFixture() {
  rooms.clear();
  participants.clear();
  roomMovies.clear();
  nominations.length = 0;
  results.clear();
  transactionOptions.length = 0;
  transactionTail = Promise.resolve();
}

export function seedRevealRoom(input: {
  phase?: RoomPhase;
  ownerId?: string;
  participantUserIds?: string[];
  finalizedAt?: Date;
  movies?: Array<{
    id: string;
    title: string;
    isFinalist?: boolean;
    finalOrder?: number | null;
    scheduledRevealAt?: Date | null;
    revealedAt?: Date | null;
    nominatorUserIds?: string[];
  }>;
} = {}) {
  const ownerId = input.ownerId ?? "host";
  const participantUserIds = input.participantUserIds ?? ["host", "member"];
  const finalizedAt = input.finalizedAt ?? new Date("2026-08-21T12:00:00.000Z");
  const room: Room = {
    id: "room-1",
    code: "ABC234",
    name: "Friday night",
    ownerId,
    phase: input.phase ?? RoomPhase.REVEAL,
    rosterLockedAt: new Date("2026-08-20T18:00:00.000Z"),
    finalizedAt,
  };
  rooms.set(room.code, room);

  participantUserIds.forEach((userId, index) => {
    const participant: Participant = {
      id: `participant-${index + 1}`,
      roomId: room.id,
      userId,
      displayName: userId === ownerId ? "Ada" : "Gus",
    };
    participants.set(participant.id, participant);
  });

  const movies = input.movies ?? [
    {
      id: "movie-1",
      title: "Heat",
      isFinalist: true,
      finalOrder: 1,
      scheduledRevealAt: finalizedAt,
      revealedAt: null,
      nominatorUserIds: [ownerId],
    },
    {
      id: "movie-2",
      title: "Drive",
      isFinalist: true,
      finalOrder: 2,
      scheduledRevealAt: new Date(finalizedAt.getTime() + 24 * 60 * 60 * 1000),
      revealedAt: null,
      nominatorUserIds: [participantUserIds[1] ?? ownerId],
    },
    {
      id: "movie-3",
      title: "SECRET TITLE",
      isFinalist: false,
      finalOrder: null,
      scheduledRevealAt: null,
      revealedAt: null,
      nominatorUserIds: [ownerId],
    },
  ];

  movies.forEach((movieInput) => {
    const movie: RoomMovie = {
      id: movieInput.id,
      roomId: room.id,
      title: movieInput.title,
      releaseYear: 1995,
      posterPath: `/${movieInput.id}.jpg`,
      letterboxdRating: 4.1,
      letterboxdSlug: movieInput.id,
    };
    roomMovies.set(movie.id, movie);

    for (const userId of movieInput.nominatorUserIds ?? [ownerId]) {
      const participant = [...participants.values()].find(
        (entry) => entry.userId === userId,
      );
      assert.ok(participant, `Unknown nominator ${userId}.`);
      nominations.push({
        participantId: participant.id,
        roomMovieId: movie.id,
      });
    }

    results.set(`${room.id}:${movie.id}`, {
      roomId: room.id,
      roomMovieId: movie.id,
      isFinalist: movieInput.isFinalist ?? false,
      finalOrder: movieInput.finalOrder ?? null,
      scheduledRevealAt: movieInput.scheduledRevealAt ?? null,
      revealedAt: movieInput.revealedAt ?? null,
    });
  });
}

export function resultRows() {
  return [...results.values()].map((row) => ({
    ...row,
    scheduledRevealAt: cloneDate(row.scheduledRevealAt),
    revealedAt: cloneDate(row.revealedAt),
  }));
}

export function roomPhase() {
  return rooms.get("ABC234")?.phase;
}

export function recordedTransactionOptions() {
  return [...transactionOptions];
}
