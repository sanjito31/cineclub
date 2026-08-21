import assert from "node:assert/strict";
import { RoomPhase } from "../../app/generated/prisma/enums";

type Room = {
  id: string;
  code: string;
  phase: RoomPhase;
  rosterLockedAt: Date | null;
  selectionsPerUser: number;
  finalizedAt: Date | null;
};

type Participant = {
  id: string;
  roomId: string;
  userId: string;
  selectionSubmittedAt: Date | null;
  votingSubmittedAt: Date | null;
};

type RoomMovie = {
  id: string;
  roomId: string;
  tmdbId: number;
  title: string;
  releaseYear: number | null;
  overview: string | null;
  posterPath: string | null;
};

type Nomination = {
  id: string;
  roomId: string;
  participantId: string;
  roomMovieId: string;
  slotIndex: number;
};

type FixtureSnapshot = {
  rooms: Room[];
  participants: Participant[];
  roomMovies: RoomMovie[];
  nominations: Nomination[];
  nextRoomMovieId: number;
  nextNominationId: number;
};

const rooms = new Map<string, Room>();
const participants = new Map<string, Participant>();
const roomMovies = new Map<string, RoomMovie>();
const nominations = new Map<string, Nomination>();
const transactionOptions: { isolationLevel?: string }[] = [];

let nextRoomMovieId = 1;
let nextNominationId = 1;
let transactionTail = Promise.resolve();
let failOnNominationCreate: number | null = null;

function cloneDate(value: Date | null) {
  return value ? new Date(value) : null;
}

function takeSnapshot(): FixtureSnapshot {
  return {
    rooms: [...rooms.values()].map((room) => ({
      ...room,
      rosterLockedAt: cloneDate(room.rosterLockedAt),
      finalizedAt: cloneDate(room.finalizedAt),
    })),
    participants: [...participants.values()].map((participant) => ({
      ...participant,
      selectionSubmittedAt: cloneDate(participant.selectionSubmittedAt),
      votingSubmittedAt: cloneDate(participant.votingSubmittedAt),
    })),
    roomMovies: [...roomMovies.values()].map((movie) => ({ ...movie })),
    nominations: [...nominations.values()].map((nomination) => ({
      ...nomination,
    })),
    nextRoomMovieId,
    nextNominationId,
  };
}

function restoreSnapshot(snapshot: FixtureSnapshot) {
  rooms.clear();
  participants.clear();
  roomMovies.clear();
  nominations.clear();

  for (const room of snapshot.rooms) rooms.set(room.code, room);
  for (const participant of snapshot.participants) {
    participants.set(participant.id, participant);
  }
  for (const movie of snapshot.roomMovies) roomMovies.set(movie.id, movie);
  for (const nomination of snapshot.nominations) {
    nominations.set(nomination.id, nomination);
  }

  nextRoomMovieId = snapshot.nextRoomMovieId;
  nextNominationId = snapshot.nextNominationId;
}

function getRoomById(roomId: string) {
  return [...rooms.values()].find(({ id }) => id === roomId) ?? null;
}

const transactionClient = {
  room: {
    findUnique: async (query: { where: { code?: string; id?: string } }) => {
      const room = query.where.code
        ? rooms.get(query.where.code)
        : getRoomById(query.where.id ?? "");
      return room ? { ...room } : null;
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
    findUnique: async (query: {
      where: { roomId_userId: { roomId: string; userId: string } };
    }) => {
      const participant = [...participants.values()].find(
        ({ roomId, userId }) =>
          roomId === query.where.roomId_userId.roomId &&
          userId === query.where.roomId_userId.userId,
      );
      return participant
        ? {
            id: participant.id,
            selectionSubmittedAt: participant.selectionSubmittedAt,
          }
        : null;
    },
    updateMany: async (query: {
      where: {
        id: string;
        roomId: string;
        selectionSubmittedAt: null;
      };
      data: { selectionSubmittedAt: Date };
    }) => {
      const participant = participants.get(query.where.id);
      if (
        !participant ||
        participant.roomId !== query.where.roomId ||
        participant.selectionSubmittedAt !== null
      ) {
        return { count: 0 };
      }

      participant.selectionSubmittedAt = query.data.selectionSubmittedAt;
      return { count: 1 };
    },
    count: async (query: {
      where: {
        roomId: string;
        selectionSubmittedAt?: null;
        votingSubmittedAt?: null;
      };
    }) =>
      [...participants.values()].filter((participant) => {
        if (participant.roomId !== query.where.roomId) return false;
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
      }).length,
  },
  roomMovie: {
    upsert: async (query: {
      where: { roomId_tmdbId: { roomId: string; tmdbId: number } };
      create: Omit<RoomMovie, "id">;
      update?: Partial<Omit<RoomMovie, "id">>;
    }) => {
      const existing = [...roomMovies.values()].find(
        ({ roomId, tmdbId }) =>
          roomId === query.where.roomId_tmdbId.roomId &&
          tmdbId === query.where.roomId_tmdbId.tmdbId,
      );
      if (existing) {
        if (query.update) Object.assign(existing, query.update);
        return { id: existing.id, tmdbId: existing.tmdbId };
      }

      const movie: RoomMovie = {
        id: `room-movie-${nextRoomMovieId++}`,
        ...query.create,
      };
      roomMovies.set(movie.id, movie);
      return { id: movie.id, tmdbId: movie.tmdbId };
    },
    count: async (query: { where: { roomId: string } }) =>
      [...roomMovies.values()].filter(
        ({ roomId }) => roomId === query.where.roomId,
      ).length,
  },
  nomination: {
    findMany: async (query: {
      where: {
        roomId: string;
        participantId: { not: string };
        roomMovie: { tmdbId: { in: number[] } };
      };
    }) =>
      [...nominations.values()]
        .filter((nomination) => {
          const movie = roomMovies.get(nomination.roomMovieId);
          return (
            nomination.roomId === query.where.roomId &&
            nomination.participantId !== query.where.participantId.not &&
            Boolean(
              movie &&
                query.where.roomMovie.tmdbId.in.includes(movie.tmdbId),
            )
          );
        })
        .map((nomination) => ({
          participantId: nomination.participantId,
          roomMovie: {
            tmdbId: roomMovies.get(nomination.roomMovieId)?.tmdbId,
          },
        })),
    create: async (query: { data: Omit<Nomination, "id"> }) => {
      if (failOnNominationCreate === 0) {
        failOnNominationCreate = null;
        throw new Error("Injected nomination write failure.");
      }
      if (failOnNominationCreate !== null) failOnNominationCreate -= 1;

      const duplicateSlot = [...nominations.values()].some(
        ({ participantId, slotIndex }) =>
          participantId === query.data.participantId &&
          slotIndex === query.data.slotIndex,
      );
      const duplicateMovie = [...nominations.values()].some(
        ({ participantId, roomMovieId }) =>
          participantId === query.data.participantId &&
          roomMovieId === query.data.roomMovieId,
      );
      assert.equal(
        duplicateSlot || duplicateMovie,
        false,
        "Nomination uniqueness constraint rejected the write.",
      );

      const nomination = {
        id: `nomination-${nextNominationId++}`,
        ...query.data,
      };
      nominations.set(nomination.id, nomination);
      return { id: nomination.id };
    },
  },
  roomMovieResult: {
    count: async () => 0,
  },
};

export const prisma = {
  $transaction: async <Result>(
    operation: (tx: typeof transactionClient) => Promise<Result>,
    options: { isolationLevel?: string } = {},
  ) => {
    transactionOptions.push(options);

    let releaseTransaction: () => void = () => undefined;
    const previousTransaction = transactionTail;
    transactionTail = new Promise<void>((resolve) => {
      releaseTransaction = resolve;
    });
    await previousTransaction;

    const snapshot = takeSnapshot();
    try {
      return await operation(transactionClient);
    } catch (error) {
      restoreSnapshot(snapshot);
      throw error;
    } finally {
      releaseTransaction();
    }
  },
};

export function resetNominationServiceFixture() {
  rooms.clear();
  participants.clear();
  roomMovies.clear();
  nominations.clear();
  transactionOptions.length = 0;
  nextRoomMovieId = 1;
  nextNominationId = 1;
  transactionTail = Promise.resolve();
  failOnNominationCreate = null;
}

export function seedNominationRoom(input: {
  code?: string;
  phase?: RoomPhase;
  rosterLocked?: boolean;
  selectionsPerUser?: number;
  participantUserIds?: string[];
}) {
  const room: Room = {
    id: "room-1",
    code: input.code ?? "ABC234",
    phase: input.phase ?? RoomPhase.SELECTION,
    rosterLockedAt:
      input.rosterLocked === false
        ? null
        : new Date("2026-08-20T18:00:00.000Z"),
    selectionsPerUser: input.selectionsPerUser ?? 2,
    finalizedAt: null,
  };
  rooms.set(room.code, room);

  (input.participantUserIds ?? ["host", "member"]).forEach((userId, index) => {
    const participant: Participant = {
      id: `participant-${index + 1}`,
      roomId: room.id,
      userId,
      selectionSubmittedAt: null,
      votingSubmittedAt: null,
    };
    participants.set(participant.id, participant);
  });
}

export function injectNominationCreateFailure(afterSuccessfulCreates = 0) {
  failOnNominationCreate = afterSuccessfulCreates;
}

export function roomMovieRows() {
  return [...roomMovies.values()].map((movie) => ({ ...movie }));
}

export function nominationRows() {
  return [...nominations.values()].map((nomination) => ({ ...nomination }));
}

export function participantSubmission(userId: string) {
  return (
    [...participants.values()].find(
      (participant) => participant.userId === userId,
    )?.selectionSubmittedAt ?? null
  );
}

export function roomPhase() {
  return rooms.get("ABC234")?.phase;
}

export function recordedNominationTransactionOptions() {
  return [...transactionOptions];
}
