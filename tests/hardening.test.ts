import assert from "node:assert/strict";
import test from "node:test";
import { FinalistOrdering, RoomPhase } from "../app/generated/prisma/enums";
import {
  assembleRoomResults,
} from "../lib/domain/finalization";
import {
  validateBallotRanks,
  BallotValidationError,
  assertParticipantCoverage,
  requiredRankingCount,
  isParticipantCoverageSatisfied,
} from "../lib/domain/voting";
import {
  buildSpoilerSafeRevealView,
  scheduledRevealAtForFinalist,
  REVEAL_COOLDOWN_MS,
  assertRevealAllowed,
  RevealError,
} from "../lib/domain/reveal";
import {
  validateNominationSelections,
  SelectionValidationError,
} from "../lib/domain/nominations";
import {
  canTransitionRoomPhase,
  assertRoomPhaseTransition,
} from "../lib/domain/room-lifecycle";
import { DomainError } from "../lib/auth/errors";

function movie(
  roomMovieId: string,
  nominators: readonly string[],
  letterboxdRating: number | null = null,
) {
  return { roomMovieId, nominatorParticipantIds: nominators, letterboxdRating };
}

// ============================================================
// Algorithm — shared/duplicate nominations in aggregation
// ============================================================

test("shared nomination scores correctly and a single finalist covers both nominators", () => {
  const results = assembleRoomResults({
    movies: [
      movie("shared", ["alice", "bob"], null),
      movie("bob-only", ["bob"], null),
      movie("carol-only", ["carol"], null),
    ],
    ballots: [
      {
        participantId: "alice",
        ranks: [
          { roomMovieId: "shared", rank: 1 },
          { roomMovieId: "carol-only", rank: 2 },
          { roomMovieId: "bob-only", rank: 3 },
        ],
      },
      {
        participantId: "bob",
        ranks: [
          { roomMovieId: "shared", rank: 1 },
          { roomMovieId: "bob-only", rank: 2 },
        ],
      },
      {
        participantId: "carol",
        ranks: [
          { roomMovieId: "carol-only", rank: 1 },
          { roomMovieId: "shared", rank: 2 },
        ],
      },
    ],
    participantIds: ["alice", "bob", "carol"],
    ordering: FinalistOrdering.RANKED_CHOICE,
    createTieBreakRandom: () => 0.5,
  });

  const byId = Object.fromEntries(
    results.map((r) => [r.roomMovieId, r]),
  );

  // M=3. shared: 3+3+2=8, carol-only: 2+0+3=5, bob-only: 1+2+0=3
  assert.equal(byId["shared"]?.aggregateScore, 8);
  assert.equal(byId["carol-only"]?.aggregateScore, 5);
  assert.equal(byId["bob-only"]?.aggregateScore, 3);

  // shared covers alice+bob, carol-only covers carol → 2 finalists
  assert.equal(byId["shared"]?.isFinalist, true);
  assert.equal(byId["carol-only"]?.isFinalist, true);
  assert.equal(byId["bob-only"]?.isFinalist, false);
});

// ============================================================
// Algorithm — incomplete/partial rankings
// ============================================================

test("voters ranking different counts still aggregate correctly", () => {
  const results = assembleRoomResults({
    movies: [
      movie("m1", ["alice"]),
      movie("m2", ["alice"]),
      movie("m3", ["bob"]),
      movie("m4", ["bob"]),
    ],
    ballots: [
      {
        participantId: "alice",
        ranks: [{ roomMovieId: "m1", rank: 1 }],
      },
      {
        participantId: "bob",
        ranks: [
          { roomMovieId: "m3", rank: 1 },
          { roomMovieId: "m4", rank: 2 },
          { roomMovieId: "m1", rank: 3 },
        ],
      },
    ],
    participantIds: ["alice", "bob"],
    ordering: FinalistOrdering.RANKED_CHOICE,
    createTieBreakRandom: () => 0.5,
  });

  const byId = Object.fromEntries(
    results.map((r) => [r.roomMovieId, r]),
  );

  // M=4. m1: alice:4 + bob:2 = 6, m2: 0, m3: bob:4 = 4, m4: bob:3 = 3
  assert.equal(byId["m1"]?.aggregateScore, 6);
  assert.equal(byId["m2"]?.aggregateScore, 0);
  assert.equal(byId["m3"]?.aggregateScore, 4);
  assert.equal(byId["m4"]?.aggregateScore, 3);
  assert.equal(byId["m1"]?.aggregateRank, 1);
  assert.equal(byId["m3"]?.aggregateRank, 2);
  assert.equal(byId["m4"]?.aggregateRank, 3);
  assert.equal(byId["m2"]?.aggregateRank, 4);
});

// ============================================================
// Algorithm — three-way tie with all ratings missing
// ============================================================

test("three-way score tie with all ratings null uses random tiebreak", () => {
  let callIndex = 0;
  const randoms = [0.3, 0.9, 0.1];
  const results = assembleRoomResults({
    movies: [
      movie("m1", ["alice"], null),
      movie("m2", ["bob"], null),
      movie("m3", ["carol"], null),
    ],
    ballots: [
      { participantId: "alice", ranks: [{ roomMovieId: "m1", rank: 1 }] },
      { participantId: "bob", ranks: [{ roomMovieId: "m2", rank: 1 }] },
      { participantId: "carol", ranks: [{ roomMovieId: "m3", rank: 1 }] },
    ],
    participantIds: ["alice", "bob", "carol"],
    ordering: FinalistOrdering.RANKED_CHOICE,
    createTieBreakRandom: () => randoms[callIndex++]!,
  });

  // All score 3 (M=3, rank 1 → 3 pts each from one ballot)
  // All ratings null → all fallback to -Infinity
  // Random tiebreak: m2=0.9 > m1=0.3 > m3=0.1 (descending)
  assert.equal(results[0]?.roomMovieId, "m2");
  assert.equal(results[1]?.roomMovieId, "m1");
  assert.equal(results[2]?.roomMovieId, "m3");
  assert.equal(results[0]?.aggregateRank, 1);
  assert.equal(results[2]?.aggregateRank, 3);
});

test("score + rating tie uses random tiebreak", () => {
  const results = assembleRoomResults({
    movies: [
      movie("m1", ["alice"], 4.2),
      movie("m2", ["bob"], 4.2),
    ],
    ballots: [
      { participantId: "alice", ranks: [{ roomMovieId: "m1", rank: 1 }] },
      { participantId: "bob", ranks: [{ roomMovieId: "m2", rank: 1 }] },
    ],
    participantIds: ["alice", "bob"],
    ordering: FinalistOrdering.RANKED_CHOICE,
    tieBreakRandoms: { m1: 0.2, m2: 0.7 },
  });

  // Same score (2 each), same rating (4.2), m2 has higher random
  assert.equal(results[0]?.roomMovieId, "m2");
  assert.equal(results[1]?.roomMovieId, "m1");
});

// ============================================================
// Algorithm — fewer unique movies than participants
// ============================================================

test("fewer unique movies than participants still selects finalists covering everyone", () => {
  // 4 participants, 2 unique movies (shared nominations reduce pool)
  const results = assembleRoomResults({
    movies: [
      movie("shared-ab", ["alice", "bob"]),
      movie("shared-cd", ["carol", "dave"]),
    ],
    ballots: [
      { participantId: "alice", ranks: [{ roomMovieId: "shared-ab", rank: 1 }, { roomMovieId: "shared-cd", rank: 2 }] },
      { participantId: "bob", ranks: [{ roomMovieId: "shared-ab", rank: 1 }, { roomMovieId: "shared-cd", rank: 2 }] },
      { participantId: "carol", ranks: [{ roomMovieId: "shared-cd", rank: 1 }, { roomMovieId: "shared-ab", rank: 2 }] },
      { participantId: "dave", ranks: [{ roomMovieId: "shared-cd", rank: 1 }, { roomMovieId: "shared-ab", rank: 2 }] },
    ],
    participantIds: ["alice", "bob", "carol", "dave"],
    ordering: FinalistOrdering.RANKED_CHOICE,
    createTieBreakRandom: () => 0.5,
  });

  // Both movies should be finalists since each covers different participants
  assert.equal(results.every((r) => r.isFinalist), true);
  assert.equal(results.length, 2);
});

// ============================================================
// Algorithm — single movie nominated by all participants
// ============================================================

test("single movie nominated by all participants produces one finalist covering everyone", () => {
  const results = assembleRoomResults({
    movies: [movie("only", ["alice", "bob", "carol"])],
    ballots: [
      { participantId: "alice", ranks: [{ roomMovieId: "only", rank: 1 }] },
      { participantId: "bob", ranks: [{ roomMovieId: "only", rank: 1 }] },
      { participantId: "carol", ranks: [{ roomMovieId: "only", rank: 1 }] },
    ],
    participantIds: ["alice", "bob", "carol"],
    ordering: FinalistOrdering.RANKED_CHOICE,
    createTieBreakRandom: () => 0.5,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.isFinalist, true);
  assert.equal(results[0]?.finalOrder, 1);
  assert.equal(results[0]?.aggregateScore, 3);
});

// ============================================================
// Algorithm — no ballots
// ============================================================

test("no ballots submitted gives all movies score 0 ordered by tiebreak", () => {
  let callIndex = 0;
  const randoms = [0.2, 0.8];
  const results = assembleRoomResults({
    movies: [movie("m1", ["alice"]), movie("m2", ["bob"])],
    ballots: [],
    participantIds: ["alice", "bob"],
    ordering: FinalistOrdering.RANKED_CHOICE,
    createTieBreakRandom: () => randoms[callIndex++]!,
  });

  assert.equal(results[0]?.aggregateScore, 0);
  assert.equal(results[1]?.aggregateScore, 0);
  // m2 has higher random (0.8 vs 0.2) → ranked first
  assert.equal(results[0]?.roomMovieId, "m2");
  assert.equal(results[1]?.roomMovieId, "m1");
  // Both are finalists (each covers a different participant)
  assert.equal(results[0]?.isFinalist, true);
  assert.equal(results[1]?.isFinalist, true);
});

// ============================================================
// Algorithm — empty movies list
// ============================================================

test("assembleRoomResults with no movies returns empty array", () => {
  const results = assembleRoomResults({
    movies: [],
    ballots: [],
    participantIds: ["alice"],
    ordering: FinalistOrdering.RANKED_CHOICE,
  });

  assert.deepEqual(results, []);
});

// ============================================================
// Security — cross-room movie IDs in ballot validation
// ============================================================

test("ballot validation rejects movie IDs not in the allowed set (cross-room IDs)", () => {
  const allowedMovieIds = ["room-1-movie-a", "room-1-movie-b"];

  assert.throws(
    () =>
      validateBallotRanks(
        [
          { roomMovieId: "room-2-movie-x", rank: 1 },
          { roomMovieId: "room-1-movie-a", rank: 2 },
        ],
        {
          requiredCount: 2,
          allowedMovieIds,
          movieCount: 2,
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof BallotValidationError);
      assert.equal(error.code, "UNKNOWN_MOVIE");
      return true;
    },
  );
});

test("ballot validation rejects ranks exceeding movie count", () => {
  assert.throws(
    () =>
      validateBallotRanks(
        [{ roomMovieId: "m1", rank: 5 }],
        { requiredCount: 1, allowedMovieIds: ["m1", "m2"], movieCount: 2 },
      ),
    (error: unknown) => {
      assert.ok(error instanceof BallotValidationError);
      assert.equal(error.code, "INVALID_RANK");
      return true;
    },
  );
});

// ============================================================
// Security — coverage with only shared nominations
// ============================================================

test("coverage passes when a single shared movie covers all participants", () => {
  const movies = [
    { roomMovieId: "shared", nominatorParticipantIds: ["alice", "bob", "carol"] },
  ];

  assert.equal(
    isParticipantCoverageSatisfied(
      ["shared"],
      movies,
      ["alice", "bob", "carol"],
    ),
    true,
  );

  assert.doesNotThrow(() => {
    assertParticipantCoverage(["shared"], movies, ["alice", "bob", "carol"]);
  });
});

test("coverage fails when ranked movies leave a participant uncovered", () => {
  const movies = [
    { roomMovieId: "m1", nominatorParticipantIds: ["alice"] },
    { roomMovieId: "m2", nominatorParticipantIds: ["bob"] },
  ];

  assert.equal(
    isParticipantCoverageSatisfied(
      ["m1"],
      movies,
      ["alice", "bob", "carol"],
    ),
    false,
  );

  assert.throws(
    () => assertParticipantCoverage(["m1"], movies, ["alice", "bob", "carol"]),
    BallotValidationError,
  );
});

// ============================================================
// Security — spoiler-safe view serialization
// ============================================================

test("spoiler-safe view JSON never contains unrevealed titles or posters", () => {
  const now = new Date("2026-08-21T12:00:00.000Z");
  const view = buildSpoilerSafeRevealView({
    phase: RoomPhase.REVEAL,
    now,
    results: [
      {
        roomMovieId: "revealed-1",
        isFinalist: true,
        finalOrder: 1,
        scheduledRevealAt: now,
        revealedAt: now,
        movie: {
          title: "Safe Title",
          releaseYear: 2020,
          posterPath: "/safe.jpg",
          letterboxdRating: 4.1,
          letterboxdSlug: "safe-title",
          nominators: [{ participantId: "p1", displayName: "Alice" }],
        },
      },
      {
        roomMovieId: "unrevealed-secret",
        isFinalist: true,
        finalOrder: 2,
        scheduledRevealAt: new Date(now.getTime() + REVEAL_COOLDOWN_MS),
        revealedAt: null,
        movie: null,
      },
      {
        roomMovieId: "non-finalist",
        isFinalist: false,
        finalOrder: null,
        scheduledRevealAt: null,
        revealedAt: null,
        movie: null,
      },
    ],
  });

  const serialized = JSON.stringify(view);
  assert.equal(serialized.includes("unrevealed-secret"), false);
  assert.equal(serialized.includes("non-finalist"), false);
  assert.ok(serialized.includes("Safe Title"));
  assert.equal(view.revealed.length, 1);
  assert.equal(view.remainingCount, 1);
  assert.equal(view.totalFinalists, 2);
  assert.ok(view.nextReveal);
  assert.equal(view.nextReveal?.isOnCooldown, true);
});

test("spoiler-safe view with no finalists returns empty state", () => {
  const now = new Date("2026-08-21T12:00:00.000Z");
  const view = buildSpoilerSafeRevealView({
    phase: RoomPhase.REVEAL,
    now,
    results: [
      {
        roomMovieId: "m1",
        isFinalist: false,
        finalOrder: null,
        scheduledRevealAt: null,
        revealedAt: null,
        movie: null,
      },
    ],
  });

  assert.equal(view.totalFinalists, 0);
  assert.equal(view.revealedCount, 0);
  assert.equal(view.remainingCount, 0);
  assert.equal(view.nextReveal, null);
  assert.deepEqual(view.revealed, []);
});

test("spoiler-safe view for completed room shows all revealed finalists", () => {
  const now = new Date("2026-08-22T12:00:00.000Z");
  const revealedAt = new Date("2026-08-21T12:00:00.000Z");
  const view = buildSpoilerSafeRevealView({
    phase: RoomPhase.COMPLETE,
    now,
    results: [
      {
        roomMovieId: "m1",
        isFinalist: true,
        finalOrder: 1,
        scheduledRevealAt: revealedAt,
        revealedAt,
        movie: {
          title: "Winner",
          releaseYear: 2024,
          posterPath: "/winner.jpg",
          letterboxdRating: 4.5,
          letterboxdSlug: "winner",
          nominators: [{ participantId: "p1", displayName: "A" }],
        },
      },
    ],
  });

  assert.equal(view.phase, RoomPhase.COMPLETE);
  assert.equal(view.revealedCount, 1);
  assert.equal(view.remainingCount, 0);
  assert.equal(view.nextReveal, null);
});

// ============================================================
// Security — phase transition enforcement
// ============================================================

test("COMPLETE cannot transition to any phase", () => {
  for (const target of [
    RoomPhase.SELECTION,
    RoomPhase.VOTING,
    RoomPhase.FINALIZING,
    RoomPhase.REVEAL,
    RoomPhase.COMPLETE,
  ]) {
    assert.equal(canTransitionRoomPhase(RoomPhase.COMPLETE, target), false);
  }
});

test("backward transitions are rejected", () => {
  assert.throws(
    () => assertRoomPhaseTransition(RoomPhase.VOTING, RoomPhase.SELECTION),
    DomainError,
  );
  assert.throws(
    () => assertRoomPhaseTransition(RoomPhase.REVEAL, RoomPhase.FINALIZING),
    DomainError,
  );
  assert.throws(
    () => assertRoomPhaseTransition(RoomPhase.FINALIZING, RoomPhase.VOTING),
    DomainError,
  );
});

test("skipping phases is rejected", () => {
  assert.throws(
    () => assertRoomPhaseTransition(RoomPhase.SELECTION, RoomPhase.FINALIZING),
    DomainError,
  );
  assert.throws(
    () => assertRoomPhaseTransition(RoomPhase.VOTING, RoomPhase.REVEAL),
    DomainError,
  );
});

// ============================================================
// Security — reveal cooldown enforcement
// ============================================================

test("reveal allowed when no cooldown exists", () => {
  assert.doesNotThrow(() =>
    assertRevealAllowed({
      cooldownEndsAt: null,
      now: new Date(),
      confirmEarlyReveal: false,
    }),
  );
});

test("reveal on cooldown without confirmation throws COOLDOWN_UNCONFIRMED", () => {
  const now = new Date("2026-08-21T12:00:00.000Z");
  const cooldownEndsAt = new Date("2026-08-22T12:00:00.000Z");

  assert.throws(
    () => assertRevealAllowed({ cooldownEndsAt, now, confirmEarlyReveal: false }),
    (error: unknown) => {
      assert.ok(error instanceof RevealError);
      assert.equal(error.code, "COOLDOWN_UNCONFIRMED");
      return true;
    },
  );
});

test("reveal on cooldown with confirmation proceeds", () => {
  const now = new Date("2026-08-21T12:00:00.000Z");
  const cooldownEndsAt = new Date("2026-08-22T12:00:00.000Z");

  assert.doesNotThrow(() =>
    assertRevealAllowed({ cooldownEndsAt, now, confirmEarlyReveal: true }),
  );
});

// ============================================================
// Nomination validation edge cases
// ============================================================

test("nomination validation rejects same movie in two slots", () => {
  assert.throws(
    () =>
      validateNominationSelections(
        [
          { slotIndex: 1, tmdbId: 100, title: "Movie A", releaseYear: 2020, overview: null, posterPath: null },
          { slotIndex: 2, tmdbId: 100, title: "Movie A", releaseYear: 2020, overview: null, posterPath: null },
        ],
        2,
      ),
    (error: unknown) => {
      assert.ok(error instanceof SelectionValidationError);
      assert.equal(error.code, "DUPLICATE_MOVIE");
      return true;
    },
  );
});

test("nomination validation rejects wrong selection count", () => {
  assert.throws(
    () =>
      validateNominationSelections(
        [{ slotIndex: 1, tmdbId: 100, title: "Movie A", releaseYear: 2020, overview: null, posterPath: null }],
        2,
      ),
    (error: unknown) => {
      assert.ok(error instanceof SelectionValidationError);
      assert.equal(error.code, "INVALID_SELECTION_COUNT");
      return true;
    },
  );
});

// ============================================================
// Required ranking count edge cases
// ============================================================

test("requiredRankingCount is min(participants, movies)", () => {
  assert.equal(requiredRankingCount(3, 5), 3);
  assert.equal(requiredRankingCount(5, 3), 3);
  assert.equal(requiredRankingCount(4, 4), 4);
  assert.equal(requiredRankingCount(0, 5), 0);
  assert.equal(requiredRankingCount(5, 0), 0);
  assert.equal(requiredRankingCount(1, 1), 1);
});

// ============================================================
// E2E — full domain pipeline for 3-participant room
// ============================================================

test("full 3-participant lifecycle through domain functions", () => {
  // === STEP 1: Validate selections for each participant ===
  const aliceSelections = validateNominationSelections(
    [
      { slotIndex: 1, tmdbId: 101, title: "Inception", releaseYear: 2010, overview: "Dreams", posterPath: "/inception.jpg" },
      { slotIndex: 2, tmdbId: 102, title: "The Matrix", releaseYear: 1999, overview: "Simulation", posterPath: "/matrix.jpg" },
    ],
    2,
  );
  assert.equal(aliceSelections.length, 2);

  const bobSelections = validateNominationSelections(
    [
      { slotIndex: 1, tmdbId: 103, title: "Arrival", releaseYear: 2016, overview: "Aliens", posterPath: "/arrival.jpg" },
      { slotIndex: 2, tmdbId: 101, title: "Inception", releaseYear: 2010, overview: "Dreams", posterPath: "/inception.jpg" },
    ],
    2,
  );
  assert.equal(bobSelections.length, 2);

  const carolSelections = validateNominationSelections(
    [
      { slotIndex: 1, tmdbId: 104, title: "Blade Runner", releaseYear: 1982, overview: "Replicants", posterPath: "/blade.jpg" },
      { slotIndex: 2, tmdbId: 103, title: "Arrival", releaseYear: 2016, overview: "Aliens", posterPath: "/arrival.jpg" },
    ],
    2,
  );
  assert.equal(carolSelections.length, 2);

  // === STEP 2: Build room movie + nomination state ===
  // Unique movies: Inception (alice, bob), Matrix (alice), Arrival (bob, carol), Blade Runner (carol)
  const movies = [
    movie("rm-inception", ["alice", "bob"], 4.3),
    movie("rm-matrix", ["alice"], 4.5),
    movie("rm-arrival", ["bob", "carol"], 4.1),
    movie("rm-blade", ["carol"], 4.0),
  ];
  const participantIds = ["alice", "bob", "carol"];

  // === STEP 3: Validate ballots ===
  // min(3 participants, 4 movies) = 3 required ranks
  assert.equal(requiredRankingCount(3, 4), 3);

  const aliceRanks = validateBallotRanks(
    [
      { roomMovieId: "rm-inception", rank: 1 },
      { roomMovieId: "rm-matrix", rank: 2 },
      { roomMovieId: "rm-arrival", rank: 3 },
    ],
    {
      requiredCount: 3,
      allowedMovieIds: ["rm-inception", "rm-matrix", "rm-arrival", "rm-blade"],
      movieCount: 4,
    },
  );
  assert.equal(aliceRanks.length, 3);

  const bobRanks = validateBallotRanks(
    [
      { roomMovieId: "rm-inception", rank: 1 },
      { roomMovieId: "rm-arrival", rank: 2 },
      { roomMovieId: "rm-blade", rank: 3 },
    ],
    {
      requiredCount: 3,
      allowedMovieIds: ["rm-inception", "rm-matrix", "rm-arrival", "rm-blade"],
      movieCount: 4,
    },
  );

  const carolRanks = validateBallotRanks(
    [
      { roomMovieId: "rm-arrival", rank: 1 },
      { roomMovieId: "rm-blade", rank: 2 },
      { roomMovieId: "rm-inception", rank: 3 },
      { roomMovieId: "rm-matrix", rank: 4 },
    ],
    {
      requiredCount: 3,
      allowedMovieIds: ["rm-inception", "rm-matrix", "rm-arrival", "rm-blade"],
      movieCount: 4,
    },
  );
  assert.equal(carolRanks.length, 4);

  // Verify coverage: each ballot's required ranks must cover all participants
  assertParticipantCoverage(
    aliceRanks.map((r) => r.roomMovieId),
    movies.map((m) => ({ roomMovieId: m.roomMovieId, nominatorParticipantIds: [...m.nominatorParticipantIds] })),
    participantIds,
  );

  assertParticipantCoverage(
    bobRanks.map((r) => r.roomMovieId),
    movies.map((m) => ({ roomMovieId: m.roomMovieId, nominatorParticipantIds: [...m.nominatorParticipantIds] })),
    participantIds,
  );

  assertParticipantCoverage(
    carolRanks.map((r) => r.roomMovieId),
    movies.map((m) => ({ roomMovieId: m.roomMovieId, nominatorParticipantIds: [...m.nominatorParticipantIds] })),
    participantIds,
  );

  // === STEP 4: Finalization (aggregation) ===
  const ballots = [
    { participantId: "alice", ranks: aliceRanks },
    { participantId: "bob", ranks: bobRanks },
    { participantId: "carol", ranks: carolRanks },
  ];

  const drafts = assembleRoomResults({
    movies,
    ballots,
    participantIds,
    ordering: FinalistOrdering.RANKED_CHOICE,
    createTieBreakRandom: () => 0.5,
  });

  // M=4
  // Inception: alice:4 + bob:4 + carol:2 = 10
  // Matrix: alice:3 + carol:1 = 4
  // Arrival: alice:2 + bob:3 + carol:4 = 9
  // Blade Runner: bob:2 + carol:3 = 5
  const byId = Object.fromEntries(
    drafts.map((d) => [d.roomMovieId, d]),
  );

  assert.equal(byId["rm-inception"]?.aggregateScore, 10);
  assert.equal(byId["rm-arrival"]?.aggregateScore, 9);
  assert.equal(byId["rm-blade"]?.aggregateScore, 5);
  assert.equal(byId["rm-matrix"]?.aggregateScore, 4);

  // Finalists: Inception covers alice+bob, then need carol → Arrival covers bob+carol
  // So finalists: Inception and Arrival
  assert.equal(byId["rm-inception"]?.isFinalist, true);
  assert.equal(byId["rm-arrival"]?.isFinalist, true);
  assert.equal(byId["rm-blade"]?.isFinalist, false);
  assert.equal(byId["rm-matrix"]?.isFinalist, false);

  // RANKED_CHOICE: worst-to-best → Arrival (rank 2) revealed first, Inception (rank 1) last
  assert.equal(byId["rm-arrival"]?.finalOrder, 1);
  assert.equal(byId["rm-inception"]?.finalOrder, 2);

  // === STEP 5: Reveal scheduling ===
  const finalizedAt = new Date("2026-08-21T18:00:00.000Z");
  const schedule1 = scheduledRevealAtForFinalist(finalizedAt, 1);
  const schedule2 = scheduledRevealAtForFinalist(finalizedAt, 2);

  assert.equal(schedule1.getTime(), finalizedAt.getTime());
  assert.equal(schedule2.getTime(), finalizedAt.getTime() + REVEAL_COOLDOWN_MS);

  // === STEP 6: Spoiler-safe views at each reveal step ===
  const beforeAnyReveal = buildSpoilerSafeRevealView({
    phase: RoomPhase.REVEAL,
    now: finalizedAt,
    results: drafts
      .filter((d) => d.isFinalist)
      .map((d) => ({
        roomMovieId: d.roomMovieId,
        isFinalist: true,
        finalOrder: d.finalOrder,
        scheduledRevealAt:
          d.finalOrder != null
            ? scheduledRevealAtForFinalist(finalizedAt, d.finalOrder)
            : null,
        revealedAt: null,
        movie: null,
      })),
  });

  assert.equal(beforeAnyReveal.totalFinalists, 2);
  assert.equal(beforeAnyReveal.revealedCount, 0);
  assert.equal(beforeAnyReveal.remainingCount, 2);
  assert.ok(beforeAnyReveal.nextReveal);
  assert.equal(beforeAnyReveal.nextReveal?.revealPosition, 1);
  // First reveal is scheduled at finalizedAt, now=finalizedAt → not on cooldown
  assert.equal(beforeAnyReveal.nextReveal?.isOnCooldown, false);
  assert.equal(JSON.stringify(beforeAnyReveal).includes("Inception"), false);
  assert.equal(JSON.stringify(beforeAnyReveal).includes("Arrival"), false);

  // After first reveal (Arrival, finalOrder=1)
  const afterFirstReveal = buildSpoilerSafeRevealView({
    phase: RoomPhase.REVEAL,
    now: finalizedAt,
    results: [
      {
        roomMovieId: "rm-arrival",
        isFinalist: true,
        finalOrder: 1,
        scheduledRevealAt: schedule1,
        revealedAt: finalizedAt,
        movie: {
          title: "Arrival",
          releaseYear: 2016,
          posterPath: "/arrival.jpg",
          letterboxdRating: 4.1,
          letterboxdSlug: "arrival-2016",
          nominators: [
            { participantId: "bob", displayName: "Bob" },
            { participantId: "carol", displayName: "Carol" },
          ],
        },
      },
      {
        roomMovieId: "rm-inception",
        isFinalist: true,
        finalOrder: 2,
        scheduledRevealAt: schedule2,
        revealedAt: null,
        movie: null,
      },
    ],
  });

  assert.equal(afterFirstReveal.revealedCount, 1);
  assert.equal(afterFirstReveal.remainingCount, 1);
  assert.equal(afterFirstReveal.revealed[0]?.title, "Arrival");
  assert.ok(afterFirstReveal.nextReveal);
  assert.equal(afterFirstReveal.nextReveal?.revealPosition, 2);
  assert.equal(afterFirstReveal.nextReveal?.isOnCooldown, true);
  assert.equal(JSON.stringify(afterFirstReveal).includes("Inception"), false);

  // After all reveals — COMPLETE
  const afterAllReveals = buildSpoilerSafeRevealView({
    phase: RoomPhase.COMPLETE,
    now: new Date(finalizedAt.getTime() + 2 * REVEAL_COOLDOWN_MS),
    results: [
      {
        roomMovieId: "rm-arrival",
        isFinalist: true,
        finalOrder: 1,
        scheduledRevealAt: schedule1,
        revealedAt: finalizedAt,
        movie: {
          title: "Arrival",
          releaseYear: 2016,
          posterPath: "/arrival.jpg",
          letterboxdRating: 4.1,
          letterboxdSlug: "arrival-2016",
          nominators: [
            { participantId: "bob", displayName: "Bob" },
            { participantId: "carol", displayName: "Carol" },
          ],
        },
      },
      {
        roomMovieId: "rm-inception",
        isFinalist: true,
        finalOrder: 2,
        scheduledRevealAt: schedule2,
        revealedAt: new Date(finalizedAt.getTime() + REVEAL_COOLDOWN_MS),
        movie: {
          title: "Inception",
          releaseYear: 2010,
          posterPath: "/inception.jpg",
          letterboxdRating: 4.3,
          letterboxdSlug: "inception",
          nominators: [
            { participantId: "alice", displayName: "Alice" },
            { participantId: "bob", displayName: "Bob" },
          ],
        },
      },
    ],
  });

  assert.equal(afterAllReveals.phase, RoomPhase.COMPLETE);
  assert.equal(afterAllReveals.revealedCount, 2);
  assert.equal(afterAllReveals.remainingCount, 0);
  assert.equal(afterAllReveals.nextReveal, null);
  assert.equal(afterAllReveals.revealed[0]?.title, "Arrival");
  assert.equal(afterAllReveals.revealed[1]?.title, "Inception");
});
