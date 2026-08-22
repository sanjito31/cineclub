import assert from "node:assert/strict";
import test from "node:test";
import { FinalistOrdering } from "../app/generated/prisma/enums";
import {
  assembleRoomResults,
  bordaPoints,
  generateTieBreakRandom,
  movieNeedsLetterboxdRatingLookup,
  selectFinalistMovieIds,
} from "../lib/domain/finalization";
import {
  listFinalistOrderingStrategies,
  orderFinalists,
  parseFinalistOrdering,
} from "../lib/domain/finalist-ordering";

const alice = "alice";
const bob = "bob";
const carol = "carol";

function movie(
  roomMovieId: string,
  nominators: readonly string[],
  letterboxdRating: number | null = null,
) {
  return {
    roomMovieId,
    nominatorParticipantIds: nominators,
    letterboxdRating,
  };
}

test("Borda points are M - rank + 1 and unranked movies score 0", () => {
  assert.equal(bordaPoints(1, 5), 5);
  assert.equal(bordaPoints(5, 5), 1);
  assert.equal(bordaPoints(0, 5), 0);
  assert.equal(bordaPoints(6, 5), 0);
});

test("assembleRoomResults sums partial ballots and ranks every movie", () => {
  const results = assembleRoomResults({
    movies: [
      movie("alpha", [alice], 4.2),
      movie("bravo", [bob], 3.1),
      movie("charlie", [carol], 2.8),
    ],
    ballots: [
      {
        participantId: alice,
        ranks: [
          { roomMovieId: "alpha", rank: 1 },
          { roomMovieId: "bravo", rank: 2 },
        ],
      },
      {
        participantId: bob,
        ranks: [{ roomMovieId: "bravo", rank: 1 }],
      },
    ],
    participantIds: [alice, bob, carol],
    ordering: FinalistOrdering.RANKED_CHOICE,
    tieBreakRandoms: { alpha: 0.1, bravo: 0.2, charlie: 0.3 },
  });

  const byId = Object.fromEntries(
    results.map((result) => [result.roomMovieId, result]),
  );

  assert.equal(byId.alpha?.aggregateScore, 3);
  assert.equal(byId.bravo?.aggregateScore, 5);
  assert.equal(byId.charlie?.aggregateScore, 0);
  assert.equal(byId.bravo?.aggregateRank, 1);
  assert.equal(byId.alpha?.aggregateRank, 2);
  assert.equal(byId.charlie?.aggregateRank, 3);
});

test("equal Borda scores break ties by Letterboxd rating then persisted random", () => {
  const ratingWins = assembleRoomResults({
    movies: [movie("alpha", [alice], 4.8), movie("bravo", [bob], 3.1)],
    ballots: [
      {
        participantId: alice,
        ranks: [{ roomMovieId: "alpha", rank: 1 }],
      },
      {
        participantId: bob,
        ranks: [{ roomMovieId: "bravo", rank: 1 }],
      },
    ],
    participantIds: [alice, bob],
    ordering: FinalistOrdering.RANKED_CHOICE,
    tieBreakRandoms: { alpha: 0.1, bravo: 0.9 },
  });

  assert.deepEqual(
    ratingWins.map((result) => result.roomMovieId),
    ["alpha", "bravo"],
  );

  const randomWins = assembleRoomResults({
    movies: [movie("alpha", [alice], null), movie("bravo", [bob], null)],
    ballots: [
      {
        participantId: alice,
        ranks: [{ roomMovieId: "alpha", rank: 1 }],
      },
      {
        participantId: bob,
        ranks: [{ roomMovieId: "bravo", rank: 1 }],
      },
    ],
    participantIds: [alice, bob],
    ordering: FinalistOrdering.RANKED_CHOICE,
    tieBreakRandoms: { alpha: 0.2, bravo: 0.8 },
  });

  assert.deepEqual(
    randomWins.map((result) => result.roomMovieId),
    ["bravo", "alpha"],
  );
  assert.equal(randomWins[0]?.tieBreakRating, null);
});

test("finalist selection walks the ranking and covers shared nominators once", () => {
  assert.deepEqual(
    selectFinalistMovieIds(
      ["shared", "alice-film", "bob-film"],
      [
        movie("shared", [alice, bob]),
        movie("alice-film", [alice]),
        movie("bob-film", [bob]),
      ],
      [alice, bob],
    ),
    ["shared"],
  );
});

test("ranked choice orders finalists worst-to-best so the winner is revealed last", () => {
  const results = assembleRoomResults({
    movies: [
      movie("winner", [alice], 4.9),
      movie("middle", [bob], 3.2),
      movie("last", [carol], 2.1),
    ],
    ballots: [
      {
        participantId: alice,
        ranks: [
          { roomMovieId: "winner", rank: 1 },
          { roomMovieId: "middle", rank: 2 },
          { roomMovieId: "last", rank: 3 },
        ],
      },
      {
        participantId: bob,
        ranks: [
          { roomMovieId: "winner", rank: 1 },
          { roomMovieId: "middle", rank: 2 },
        ],
      },
      {
        participantId: carol,
        ranks: [{ roomMovieId: "last", rank: 1 }],
      },
    ],
    participantIds: [alice, bob, carol],
    ordering: FinalistOrdering.RANKED_CHOICE,
    tieBreakRandoms: { winner: 0.1, middle: 0.2, last: 0.3 },
  });

  const finalists = results
    .filter((result) => result.isFinalist)
    .sort((left, right) => (left.finalOrder ?? 0) - (right.finalOrder ?? 0));

  assert.deepEqual(
    finalists.map((result) => result.roomMovieId),
    ["last", "middle", "winner"],
  );
  assert.equal(results.find((result) => result.roomMovieId === "winner")?.finalOrder, 3);
});

test("random ordering uses persisted tie-break values and stays stable", () => {
  const first = orderFinalists(FinalistOrdering.RANDOM, [
    { roomMovieId: "alpha", aggregateRank: 1, tieBreakRandom: 0.8 },
    { roomMovieId: "bravo", aggregateRank: 2, tieBreakRandom: 0.1 },
    { roomMovieId: "charlie", aggregateRank: 3, tieBreakRandom: 0.4 },
  ]);
  const second = orderFinalists(FinalistOrdering.RANDOM, [
    { roomMovieId: "charlie", aggregateRank: 3, tieBreakRandom: 0.4 },
    { roomMovieId: "alpha", aggregateRank: 1, tieBreakRandom: 0.8 },
    { roomMovieId: "bravo", aggregateRank: 2, tieBreakRandom: 0.1 },
  ]);

  assert.deepEqual(first, ["bravo", "charlie", "alpha"]);
  assert.deepEqual(second, first);
});

test("ordering strategies are listed so later options can be registered", () => {
  const ids = listFinalistOrderingStrategies().map((strategy) => strategy.id);
  assert.deepEqual(ids, [
    FinalistOrdering.RANKED_CHOICE_FORWARD,
    FinalistOrdering.RANKED_CHOICE,
    FinalistOrdering.RANDOM,
  ]);
  assert.equal(parseFinalistOrdering("nope"), FinalistOrdering.RANKED_CHOICE_FORWARD);
});

test("the same ballots and randoms always produce the same persisted draft", () => {
  const input = {
    movies: [movie("alpha", [alice], 4), movie("bravo", [bob], 4)],
    ballots: [
      {
        participantId: alice,
        ranks: [
          { roomMovieId: "alpha", rank: 1 },
          { roomMovieId: "bravo", rank: 2 },
        ],
      },
    ],
    participantIds: [alice, bob],
    ordering: FinalistOrdering.RANDOM,
    tieBreakRandoms: { alpha: 0.42, bravo: 0.24 },
  } as const;

  assert.deepEqual(assembleRoomResults(input), assembleRoomResults(input));
});

test("generated tie-break values stay in the persisted [0, 1) range", () => {
  for (let index = 0; index < 8; index += 1) {
    const value = generateTieBreakRandom();
    assert.ok(value >= 0);
    assert.ok(value < 1);
  }
});

test("rating lookups are skipped once a rating or completed fetch exists", () => {
  assert.equal(
    movieNeedsLetterboxdRatingLookup({
      letterboxdRating: null,
      ratingFetchedAt: null,
    }),
    true,
  );
  assert.equal(
    movieNeedsLetterboxdRatingLookup({
      letterboxdRating: 4.1,
      ratingFetchedAt: null,
    }),
    false,
  );
  assert.equal(
    movieNeedsLetterboxdRatingLookup({
      letterboxdRating: null,
      ratingFetchedAt: new Date("2026-08-21T12:00:00.000Z"),
    }),
    false,
  );
});
