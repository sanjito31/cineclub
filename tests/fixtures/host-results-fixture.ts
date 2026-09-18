import { FinalistOrdering, RoomPhase } from "../../app/generated/prisma/enums";

export const room = {
  id: "room-1",
  code: "ABC234",
  ownerId: "host",
  phase: RoomPhase.REVEAL as RoomPhase,
  finalistOrdering: FinalistOrdering.RANKED_CHOICE as FinalistOrdering,
};

export const rows = [
  { roomId: "room-1", roomMovieId: "a", title: "Heat", aggregateRank: 1, aggregateScore: 12, finalOrder: 3, tieBreakRandom: 0.5, isFinalist: true, votes: 2 },
  { roomId: "room-1", roomMovieId: "excluded", title: "Non-finalist", aggregateRank: 2, aggregateScore: 11, finalOrder: null, tieBreakRandom: 0.1, isFinalist: false, votes: 3 },
  { roomId: "room-1", roomMovieId: "b", title: "Drive", aggregateRank: 3, aggregateScore: 10, finalOrder: 2, tieBreakRandom: 0.9, isFinalist: true, votes: 3 },
  { roomId: "room-1", roomMovieId: "c", title: "Unrevealed finalist", aggregateRank: 4, aggregateScore: 0, finalOrder: 1, tieBreakRandom: 0.2, isFinalist: true, votes: 0 },
  { roomId: "room-2", roomMovieId: "other", title: "Other room", aggregateRank: 1, aggregateScore: 50, finalOrder: 1, tieBreakRandom: 0.3, isFinalist: true, votes: 10 },
];

export let resultReads = 0;

export function resetHostResultsFixture() {
  room.phase = RoomPhase.REVEAL;
  room.finalistOrdering = FinalistOrdering.RANKED_CHOICE;
  resultReads = 0;
}

export const prisma = {
  room: {
    findUnique: async ({ where }: { where: { code: string } }) =>
      where.code === room.code ? { ...room } : null,
  },
  roomMovieResult: {
    findMany: async ({ where, orderBy }: {
      where: { roomId: string; isFinalist?: boolean };
      orderBy: { aggregateRank: "asc" | "desc" };
    }) => {
      resultReads += 1;
      return rows
        .filter((row) => row.roomId === where.roomId
          && (where.isFinalist === undefined || row.isFinalist === where.isFinalist))
        .sort((a, b) => orderBy.aggregateRank === "asc"
          ? a.aggregateRank - b.aggregateRank : b.aggregateRank - a.aggregateRank)
        .map((row) => ({
          ...row,
          revealedAt: null,
          roomMovie: {
            title: row.title,
            releaseYear: null,
            _count: { ballotRanks: row.votes },
          },
        }));
    },
  },
};
