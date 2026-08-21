import assert from "node:assert/strict";
import { Prisma } from "../../app/generated/prisma/client";
import { RoomPhase } from "../../app/generated/prisma/enums";

type Room = {
  id: string;
  code: string;
  name: string;
  phase: RoomPhase;
  ownerId: string;
  requireParticipantCoverage: boolean;
  rosterLockedAt: Date | null;
  finalizedAt: Date | null;
};

type Participant = {
  id: string;
  roomId: string;
  userId: string;
  displayName: string;
  joinedAt: Date;
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
  letterboxdSlug: string | null;
  letterboxdRating: number | null;
};

type Nomination = {
  id: string;
  roomId: string;
  participantId: string;
  roomMovieId: string;
};

type Ballot = {
  id: string;
  roomId: string;
  participantId: string;
  submittedAt: Date;
};

type BallotRank = {
  roomId: string;
  ballotId: string;
  roomMovieId: string;
  rank: number;
};

type FixtureSnapshot = {
  rooms: Room[];
  participants: Participant[];
  roomMovies: RoomMovie[];
  nominations: Nomination[];
  ballots: Ballot[];
  ballotRanks: BallotRank[];
  nextBallotId: number;
  nextNominationId: number;
};

const rooms = new Map<string, Room>();
const participants = new Map<string, Participant>();
const roomMovies = new Map<string, RoomMovie>();
const nominations = new Map<string, Nomination>();
const ballots = new Map<string, Ballot>();
const ballotRanks = new Map<string, BallotRank>();
const transactionOptions: { isolationLevel?: string }[] = [];

let nextBallotId = 1;
let nextNominationId = 1;
let transactionTail = Promise.resolve();
let failOnBallotCreate: number | null = null;
const tmdbOverviewsById = new Map<number, string | null>();
let tmdbOverviewsShouldThrow = false;

function cloneDate(value: Date | null) {
  return value ? new Date(value) : null;
}

function rankKey(ballotId: string, roomMovieId: string) {
  return `${ballotId}:${roomMovieId}`;
}

function uniqueConstraintError(message: string) {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code: "P2002",
    clientVersion: "test",
  });
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
      joinedAt: new Date(participant.joinedAt),
      votingSubmittedAt: cloneDate(participant.votingSubmittedAt),
    })),
    roomMovies: [...roomMovies.values()].map((movie) => ({ ...movie })),
    nominations: [...nominations.values()].map((nomination) => ({
      ...nomination,
    })),
    ballots: [...ballots.values()].map((ballot) => ({
      ...ballot,
      submittedAt: new Date(ballot.submittedAt),
    })),
    ballotRanks: [...ballotRanks.values()].map((rank) => ({ ...rank })),
    nextBallotId,
    nextNominationId,
  };
}

function restoreSnapshot(snapshot: FixtureSnapshot) {
  rooms.clear();
  participants.clear();
  roomMovies.clear();
  nominations.clear();
  ballots.clear();
  ballotRanks.clear();

  for (const room of snapshot.rooms) rooms.set(room.code, room);
  for (const participant of snapshot.participants) {
    participants.set(participant.id, participant);
  }
  for (const movie of snapshot.roomMovies) roomMovies.set(movie.id, movie);
  for (const nomination of snapshot.nominations) {
    nominations.set(nomination.id, nomination);
  }
  for (const ballot of snapshot.ballots) ballots.set(ballot.id, ballot);
  for (const rank of snapshot.ballotRanks) {
    ballotRanks.set(rankKey(rank.ballotId, rank.roomMovieId), rank);
  }

  nextBallotId = snapshot.nextBallotId;
  nextNominationId = snapshot.nextNominationId;
}

function getRoomById(roomId: string) {
  return [...rooms.values()].find(({ id }) => id === roomId) ?? null;
}

function participantDisplay(participant: Participant) {
  return {
    id: participant.id,
    userId: participant.userId,
    votingSubmittedAt: participant.votingSubmittedAt,
    user: { displayName: participant.displayName },
  };
}

function movieWithNominations(movie: RoomMovie) {
  return {
    id: movie.id,
    tmdbId: movie.tmdbId,
    title: movie.title,
    releaseYear: movie.releaseYear,
    posterPath: movie.posterPath,
    letterboxdSlug: movie.letterboxdSlug,
    letterboxdRating: movie.letterboxdRating,
    nominations: [...nominations.values()]
      .filter((nomination) => nomination.roomMovieId === movie.id)
      .map((nomination) => {
        const participant = participants.get(nomination.participantId);
        assert.ok(participant, "Nomination must reference a participant.");
        return {
          participantId: nomination.participantId,
          participant: {
            userId: participant.userId,
            user: { displayName: participant.displayName },
          },
        };
      }),
  };
}

function selectedRoom(room: Room) {
  const roomParticipants = [...participants.values()]
    .filter((participant) => participant.roomId === room.id)
    .sort((left, right) => left.joinedAt.getTime() - right.joinedAt.getTime());
  const movies = [...roomMovies.values()]
    .filter((movie) => movie.roomId === room.id)
    .sort(
      (left, right) =>
        left.title.localeCompare(right.title) || left.tmdbId - right.tmdbId,
    );

  return {
    ...room,
    participants: roomParticipants.map(participantDisplay),
    movies: movies.map(movieWithNominations),
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
            votingSubmittedAt: participant.votingSubmittedAt,
          }
        : null;
    },
    findMany: async (query: { where: { roomId: string } }) =>
      [...participants.values()]
        .filter((participant) => participant.roomId === query.where.roomId)
        .map((participant) => ({ id: participant.id })),
    updateMany: async (query: {
      where: {
        id: string;
        roomId: string;
        votingSubmittedAt: null;
      };
      data: { votingSubmittedAt: Date };
    }) => {
      const participant = participants.get(query.where.id);
      if (
        !participant ||
        participant.roomId !== query.where.roomId ||
        participant.votingSubmittedAt !== null
      ) {
        return { count: 0 };
      }

      participant.votingSubmittedAt = query.data.votingSubmittedAt;
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
          query.where.votingSubmittedAt === null &&
          participant.votingSubmittedAt !== null
        ) {
          return false;
        }
        return true;
      }).length,
  },
  roomMovie: {
    findMany: async (query: { where: { roomId: string } }) =>
      [...roomMovies.values()]
        .filter((movie) => movie.roomId === query.where.roomId)
        .map(movieWithNominations),
    count: async (query: { where: { roomId: string } }) =>
      [...roomMovies.values()].filter(
        ({ roomId }) => roomId === query.where.roomId,
      ).length,
  },
  ballot: {
    findUnique: async (query: {
      where: {
        roomId_participantId: { roomId: string; participantId: string };
      };
    }) => {
      const ballot = [...ballots.values()].find(
        ({ roomId, participantId }) =>
          roomId === query.where.roomId_participantId.roomId &&
          participantId === query.where.roomId_participantId.participantId,
      );
      return ballot ? { id: ballot.id } : null;
    },
    create: async (query: {
      data: {
        roomId: string;
        participantId: string;
        submittedAt?: Date;
        ranks?: {
          create: Array<{
            roomId: string;
            roomMovieId: string;
            rank: number;
          }>;
        };
      };
    }) => {
      if (failOnBallotCreate === 0) {
        failOnBallotCreate = null;
        throw new Error("Injected ballot write failure.");
      }
      if (failOnBallotCreate !== null) failOnBallotCreate -= 1;

      const duplicate = [...ballots.values()].some(
        ({ roomId, participantId }) =>
          roomId === query.data.roomId &&
          participantId === query.data.participantId,
      );
      if (duplicate) {
        throw uniqueConstraintError(
          "Unique constraint failed on the fields: (`room_id`,`participant_id`)",
        );
      }

      const ballot: Ballot = {
        id: `ballot-${nextBallotId++}`,
        roomId: query.data.roomId,
        participantId: query.data.participantId,
        submittedAt: query.data.submittedAt ?? new Date(),
      };
      ballots.set(ballot.id, ballot);

      for (const rank of query.data.ranks?.create ?? []) {
        const duplicateRank = [...ballotRanks.values()].some(
          (existing) =>
            existing.ballotId === ballot.id &&
            (existing.rank === rank.rank ||
              existing.roomMovieId === rank.roomMovieId),
        );
        assert.equal(
          duplicateRank,
          false,
          "Ballot rank uniqueness constraint rejected the write.",
        );

        ballotRanks.set(rankKey(ballot.id, rank.roomMovieId), {
          roomId: rank.roomId,
          ballotId: ballot.id,
          roomMovieId: rank.roomMovieId,
          rank: rank.rank,
        });
      }

      return { id: ballot.id };
    },
  },
  roomMovieResult: {
    count: async () => 0,
  },
};

export const prisma = {
  ...transactionClient,
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

export function resetBallotServiceFixture() {
  rooms.clear();
  participants.clear();
  roomMovies.clear();
  nominations.clear();
  ballots.clear();
  ballotRanks.clear();
  transactionOptions.length = 0;
  nextBallotId = 1;
  nextNominationId = 1;
  transactionTail = Promise.resolve();
  failOnBallotCreate = null;
  tmdbOverviewsById.clear();
  tmdbOverviewsShouldThrow = false;
}

export function seedBallotRoom(input: {
  code?: string;
  name?: string;
  phase?: RoomPhase;
  rosterLocked?: boolean;
  requireParticipantCoverage?: boolean;
  participantUserIds?: string[];
  votingSubmittedUserIds?: string[];
  movies?: Array<{
    id?: string;
    tmdbId?: number;
    title?: string;
    releaseYear?: number | null;
    overview?: string | null;
    posterPath?: string | null;
    letterboxdSlug?: string | null;
    letterboxdRating?: number | null;
    nominatorUserIds: string[];
  }>;
} = {}) {
  const participantUserIds = input.participantUserIds ?? ["host", "member"];
  const room: Room = {
    id: "room-1",
    code: input.code ?? "ABC234",
    name: input.name ?? "Friday Club",
    phase: input.phase ?? RoomPhase.VOTING,
    ownerId: participantUserIds[0] ?? "host",
    requireParticipantCoverage: input.requireParticipantCoverage ?? true,
    rosterLockedAt:
      input.rosterLocked === false
        ? null
        : new Date("2026-08-20T18:00:00.000Z"),
    finalizedAt: null,
  };
  rooms.set(room.code, room);

  const votingSubmittedUserIds = new Set(input.votingSubmittedUserIds);
  participantUserIds.forEach((userId, index) => {
    const participant: Participant = {
      id: `participant-${index + 1}`,
      roomId: room.id,
      userId,
      displayName: userId === "host" ? "Host" : `Member ${index}`,
      joinedAt: new Date(`2026-08-20T17:0${index}:00.000Z`),
      votingSubmittedAt: votingSubmittedUserIds.has(userId)
        ? new Date("2026-08-20T18:30:00.000Z")
        : null,
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
      title: movieInput.title ?? `Movie ${index + 1}`,
      releaseYear: movieInput.releaseYear ?? 2020 + index,
      overview: movieInput.overview ?? null,
      posterPath: movieInput.posterPath ?? `/movie-${index + 1}.jpg`,
      letterboxdSlug: movieInput.letterboxdSlug ?? null,
      letterboxdRating: movieInput.letterboxdRating ?? null,
    };
    roomMovies.set(movie.id, movie);

    for (const userId of movieInput.nominatorUserIds) {
      const participant = [...participants.values()].find(
        (entry) => entry.userId === userId,
      );
      assert.ok(participant, `Unknown nominator ${userId}.`);
      const nomination: Nomination = {
        id: `nomination-${nextNominationId++}`,
        roomId: room.id,
        participantId: participant.id,
        roomMovieId: movie.id,
      };
      nominations.set(nomination.id, nomination);
    }
  });
}

export function seedTmdbOverviews(overviews: Record<number, string | null>) {
  tmdbOverviewsById.clear();
  for (const [tmdbId, overview] of Object.entries(overviews)) {
    tmdbOverviewsById.set(Number(tmdbId), overview);
  }
}

export function failTmdbMovieOverviews() {
  tmdbOverviewsShouldThrow = true;
}

export async function getTmdbMovieOverviews(tmdbIds: readonly number[]) {
  if (tmdbOverviewsShouldThrow) {
    throw new Error("TMDB movie details are unavailable.");
  }

  return new Map(
    [...new Set(tmdbIds)].map((tmdbId) => [
      tmdbId,
      tmdbOverviewsById.get(tmdbId) ?? null,
    ]),
  );
}

export function injectBallotCreateFailure(afterSuccessfulCreates = 0) {
  failOnBallotCreate = afterSuccessfulCreates;
}

export function ballotRows() {
  return [...ballots.values()].map((ballot) => ({ ...ballot }));
}

export function ballotRankRows() {
  return [...ballotRanks.values()]
    .map((rank) => ({ ...rank }))
    .sort((left, right) => left.rank - right.rank);
}

export function participantVotingSubmission(userId: string) {
  return (
    [...participants.values()].find(
      (participant) => participant.userId === userId,
    )?.votingSubmittedAt ?? null
  );
}

export function roomPhase() {
  return rooms.get("ABC234")?.phase;
}

export function recordedBallotTransactionOptions() {
  return [...transactionOptions];
}
