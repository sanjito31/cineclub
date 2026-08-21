import assert from "node:assert/strict";
import { Prisma } from "../../app/generated/prisma/client";
import { FinalistOrdering, RoomPhase } from "../../app/generated/prisma/enums";

type Room = {
  id: string;
  code: string;
  ownerId: string;
  phase: RoomPhase;
  rosterLockedAt: Date | null;
  finalistOrdering: FinalistOrdering;
  finalizedAt: Date | null;
};

type Participant = {
  id: string;
  roomId: string;
  userId: string;
};

type RoomMovie = {
  id: string;
  roomId: string;
  tmdbId: number;
  letterboxdRating: number | null;
  letterboxdSlug: string | null;
  ratingFetchedAt: Date | null;
  letterboxdJobId: string | null;
};

type Nomination = {
  participantId: string;
  roomMovieId: string;
};

type Ballot = {
  participantId: string;
  ranks: Array<{ roomMovieId: string; rank: number }>;
};

type Result = {
  roomId: string;
  roomMovieId: string;
  aggregateScore: number;
  aggregateRank: number;
  tieBreakRating: number | null;
  tieBreakRandom: number;
  isFinalist: boolean;
  finalOrder: number | null;
};

type MovieRatingLookup = {
  tmdbId: number;
  letterboxdRating: number | null;
  letterboxdRatingJobId: string | null;
  letterboxdSlug: string | null;
};

const rooms = new Map<string, Room>();
const participants = new Map<string, Participant>();
const roomMovies = new Map<string, RoomMovie>();
const nominations: Nomination[] = [];
const ballots: Ballot[] = [];
const results = new Map<string, Result>();
const transactionOptions: { isolationLevel?: string }[] = [];
const watchboxdLookups = new Map<number, MovieRatingLookup>();

let transactionTail = Promise.resolve();

function cloneDate(value: Date | null) {
  return value ? new Date(value) : null;
}

function uniqueConstraintError(message: string) {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code: "P2002",
    clientVersion: "test",
  });
}

function getRoomById(roomId: string) {
  return [...rooms.values()].find(({ id }) => id === roomId) ?? null;
}

function selectedRoom(room: Room) {
  return {
    ...room,
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
    findMany: async (query: { where: { roomId: string } }) =>
      [...participants.values()]
        .filter((participant) => participant.roomId === query.where.roomId)
        .map((participant) => ({ id: participant.id })),
    count: async (query: {
      where: { roomId: string; votingSubmittedAt?: null };
    }) =>
      [...participants.values()].filter((participant) => {
        if (participant.roomId !== query.where.roomId) return false;
        return true;
      }).length,
  },
  roomMovie: {
    findMany: async (query: { where: { roomId: string } }) =>
      [...roomMovies.values()]
        .filter((movie) => movie.roomId === query.where.roomId)
        .map((movie) => ({
          id: movie.id,
          tmdbId: movie.tmdbId,
          letterboxdRating: movie.letterboxdRating,
          letterboxdSlug: movie.letterboxdSlug,
          ratingFetchedAt: cloneDate(movie.ratingFetchedAt),
          letterboxdJobId: movie.letterboxdJobId,
          nominations: nominations
            .filter((nomination) => nomination.roomMovieId === movie.id)
            .map((nomination) => ({ participantId: nomination.participantId })),
        })),
    count: async (query: { where: { roomId: string } }) =>
      [...roomMovies.values()].filter((movie) => movie.roomId === query.where.roomId)
        .length,
    update: async (query: {
      where: { id: string };
      data: {
        letterboxdRating?: number | null;
        letterboxdSlug?: string | null;
        letterboxdJobId?: string | null;
        ratingFetchedAt?: Date;
      };
    }) => {
      const movie = roomMovies.get(query.where.id);
      assert.ok(movie, "Movie update must reference an existing movie.");
      if (query.data.letterboxdRating !== undefined) {
        movie.letterboxdRating = query.data.letterboxdRating;
      }
      if (query.data.letterboxdSlug !== undefined) {
        movie.letterboxdSlug = query.data.letterboxdSlug;
      }
      if (query.data.letterboxdJobId !== undefined) {
        movie.letterboxdJobId = query.data.letterboxdJobId;
      }
      if (query.data.ratingFetchedAt !== undefined) {
        movie.ratingFetchedAt = query.data.ratingFetchedAt;
      }
      return movie;
    },
  },
  ballot: {
    findMany: async () =>
      ballots.map((ballot) => ({
        participantId: ballot.participantId,
        ranks: ballot.ranks.map((rank) => ({ ...rank })),
      })),
  },
  roomMovieResult: {
    count: async (query: {
      where: { roomId: string; isFinalist?: boolean };
    }) =>
      [...results.values()].filter((result) => {
        if (result.roomId !== query.where.roomId) return false;
        if (query.where.isFinalist === true && !result.isFinalist) return false;
        return true;
      }).length,
    createMany: async (query: { data: Result[] }) => {
      for (const row of query.data) {
        const key = `${row.roomId}:${row.roomMovieId}`;
        if (results.has(key)) {
          throw uniqueConstraintError(
            "Unique constraint failed on room_movie_results",
          );
        }
        results.set(key, { ...row });
      }
      return { count: query.data.length };
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

export async function lookupWatchboxdMovies(tmdbIds: readonly number[]) {
  return tmdbIds.map((tmdbId) => {
    const lookup = watchboxdLookups.get(tmdbId);
    return (
      lookup ?? {
        tmdbId,
        letterboxdRating: null,
        letterboxdRatingJobId: null,
        letterboxdSlug: null,
      }
    );
  });
}

export function resetFinalizationFixture() {
  rooms.clear();
  participants.clear();
  roomMovies.clear();
  nominations.length = 0;
  ballots.length = 0;
  results.clear();
  transactionOptions.length = 0;
  watchboxdLookups.clear();
  transactionTail = Promise.resolve();
}

export function seedFinalizationRoom(input: {
  phase?: RoomPhase;
  rosterLocked?: boolean;
  ordering?: FinalistOrdering;
  participantUserIds?: string[];
  movies?: Array<{
    id?: string;
    tmdbId?: number;
    nominatorUserIds: string[];
    letterboxdRating?: number | null;
    ratingFetchedAt?: Date | null;
    letterboxdJobId?: string | null;
  }>;
  ballots?: Array<{
    userId: string;
    ranks: Array<{ roomMovieId: string; rank: number }>;
  }>;
} = {}) {
  const participantUserIds = input.participantUserIds ?? ["host", "member"];
  const room: Room = {
    id: "room-1",
    code: "ABC234",
    ownerId: participantUserIds[0] ?? "host",
    phase: input.phase ?? RoomPhase.FINALIZING,
    rosterLockedAt:
      input.rosterLocked === false
        ? null
        : new Date("2026-08-21T12:00:00.000Z"),
    finalistOrdering: input.ordering ?? FinalistOrdering.RANKED_CHOICE,
    finalizedAt: null,
  };
  rooms.set(room.code, room);

  participantUserIds.forEach((userId, index) => {
    const participant: Participant = {
      id: `participant-${index + 1}`,
      roomId: room.id,
      userId,
    };
    participants.set(participant.id, participant);
  });

  const movies = input.movies ?? [
    { nominatorUserIds: [participantUserIds[0] ?? "host"] },
    {
      nominatorUserIds: [
        participantUserIds[1] ?? participantUserIds[0] ?? "member",
      ],
    },
  ];

  movies.forEach((movieInput, index) => {
    const movie: RoomMovie = {
      id: movieInput.id ?? `movie-${index + 1}`,
      roomId: room.id,
      tmdbId: movieInput.tmdbId ?? 100 + index + 1,
      letterboxdRating: movieInput.letterboxdRating ?? null,
      letterboxdSlug: null,
      ratingFetchedAt: movieInput.ratingFetchedAt ?? null,
      letterboxdJobId: movieInput.letterboxdJobId ?? null,
    };
    roomMovies.set(movie.id, movie);

    for (const userId of movieInput.nominatorUserIds) {
      const participant = [...participants.values()].find(
        (entry) => entry.userId === userId,
      );
      assert.ok(participant, `Unknown nominator ${userId}.`);
      nominations.push({
        participantId: participant.id,
        roomMovieId: movie.id,
      });
    }
  });

  for (const ballot of input.ballots ?? []) {
    const participant = [...participants.values()].find(
      (entry) => entry.userId === ballot.userId,
    );
    assert.ok(participant, `Unknown voter ${ballot.userId}.`);
    ballots.push({
      participantId: participant.id,
      ranks: ballot.ranks,
    });
  }
}

export function seedWatchboxdLookup(lookup: MovieRatingLookup) {
  watchboxdLookups.set(lookup.tmdbId, lookup);
}

export function seedExistingResults(rows: Result[]) {
  for (const row of rows) {
    results.set(`${row.roomId}:${row.roomMovieId}`, { ...row });
  }
}

export function resultRows() {
  return [...results.values()]
    .map((row) => ({ ...row }))
    .sort((left, right) => left.aggregateRank - right.aggregateRank);
}

export function movieRows() {
  return [...roomMovies.values()].map((movie) => ({ ...movie }));
}

export function roomPhase() {
  return rooms.get("ABC234")?.phase;
}

export function roomFinalizedAt() {
  return rooms.get("ABC234")?.finalizedAt ?? null;
}
