import assert from "node:assert/strict";
import test from "node:test";
import { FinalistOrdering, RoomPhase } from "../app/generated/prisma/enums";
import {
  assembleRoomResults,
  selectFinalistMovieIds,
} from "../lib/domain/finalization";
import {
  validateBallotRanks,
  assertParticipantCoverage,
  requiredRankingCount,
} from "../lib/domain/voting";
import {
  buildSpoilerSafeRevealView,
  scheduledRevealAtForFinalist,
  REVEAL_COOLDOWN_MS,
} from "../lib/domain/reveal";
import {
  validateNominationSelections,
} from "../lib/domain/nominations";
import { canTransitionRoomPhase } from "../lib/domain/room-lifecycle";

// ============================================================
// E2E — full 4-participant room lifecycle through domain logic
//
// Exercises the complete chain:
//   create → join → lock roster → select → vote → finalize
//   → schedule reveals → reveal → complete
//
// This tests the domain pipeline end-to-end without a database,
// verifying that each step's output feeds correctly into the next.
// ============================================================

test("4-participant room: create → select → vote → finalize → reveal → complete", () => {
  // --- Room setup ---
  const host = "host";
  const memberA = "member-a";
  const memberB = "member-b";
  const memberC = "member-c";
  const participants = [host, memberA, memberB, memberC];
  const selectionsPerUser = 2;

  // --- Phase transitions: SELECTION is the starting phase ---
  assert.equal(canTransitionRoomPhase(RoomPhase.SELECTION, RoomPhase.VOTING), true);
  assert.equal(canTransitionRoomPhase(RoomPhase.VOTING, RoomPhase.FINALIZING), true);
  assert.equal(canTransitionRoomPhase(RoomPhase.FINALIZING, RoomPhase.REVEAL), true);
  assert.equal(canTransitionRoomPhase(RoomPhase.REVEAL, RoomPhase.COMPLETE), true);

  // --- SELECTION: each participant submits 2 movies ---
  const hostSelections = validateNominationSelections(
    [
      { slotIndex: 1, tmdbId: 100, title: "Parasite", releaseYear: 2019, overview: null, posterPath: "/parasite.jpg" },
      { slotIndex: 2, tmdbId: 101, title: "Oldboy", releaseYear: 2003, overview: null, posterPath: "/oldboy.jpg" },
    ],
    selectionsPerUser,
  );

  const memberASelections = validateNominationSelections(
    [
      { slotIndex: 1, tmdbId: 102, title: "Moonlight", releaseYear: 2016, overview: null, posterPath: "/moonlight.jpg" },
      { slotIndex: 2, tmdbId: 100, title: "Parasite", releaseYear: 2019, overview: null, posterPath: "/parasite.jpg" },
    ],
    selectionsPerUser,
  );

  const memberBSelections = validateNominationSelections(
    [
      { slotIndex: 1, tmdbId: 103, title: "Roma", releaseYear: 2018, overview: null, posterPath: "/roma.jpg" },
      { slotIndex: 2, tmdbId: 101, title: "Oldboy", releaseYear: 2003, overview: null, posterPath: "/oldboy.jpg" },
    ],
    selectionsPerUser,
  );

  const memberCSelections = validateNominationSelections(
    [
      { slotIndex: 1, tmdbId: 104, title: "Shoplifters", releaseYear: 2018, overview: null, posterPath: "/shoplifters.jpg" },
      { slotIndex: 2, tmdbId: 102, title: "Moonlight", releaseYear: 2016, overview: null, posterPath: "/moonlight.jpg" },
    ],
    selectionsPerUser,
  );

  assert.equal(hostSelections.length, 2);
  assert.equal(memberASelections.length, 2);
  assert.equal(memberBSelections.length, 2);
  assert.equal(memberCSelections.length, 2);

  // --- Build room state from selections ---
  // Unique movies:
  //   Parasite (host, memberA) — shared
  //   Oldboy (host, memberB) — shared
  //   Moonlight (memberA, memberC) — shared
  //   Roma (memberB)
  //   Shoplifters (memberC)
  const movies = [
    { roomMovieId: "rm-parasite", nominatorParticipantIds: [host, memberA], letterboxdRating: 4.6 as number | null },
    { roomMovieId: "rm-oldboy", nominatorParticipantIds: [host, memberB], letterboxdRating: 4.2 as number | null },
    { roomMovieId: "rm-moonlight", nominatorParticipantIds: [memberA, memberC], letterboxdRating: 4.3 as number | null },
    { roomMovieId: "rm-roma", nominatorParticipantIds: [memberB], letterboxdRating: 4.1 as number | null },
    { roomMovieId: "rm-shoplifters", nominatorParticipantIds: [memberC], letterboxdRating: 4.0 as number | null },
  ];

  // --- VOTING: min(4 participants, 5 movies) = 4 required ranks ---
  const required = requiredRankingCount(participants.length, movies.length);
  assert.equal(required, 4);

  const movieIds = movies.map((m) => m.roomMovieId);

  // Each participant submits a valid ballot
  const hostBallot = validateBallotRanks(
    [
      { roomMovieId: "rm-parasite", rank: 1 },
      { roomMovieId: "rm-oldboy", rank: 2 },
      { roomMovieId: "rm-moonlight", rank: 3 },
      { roomMovieId: "rm-roma", rank: 4 },
    ],
    { requiredCount: required, allowedMovieIds: movieIds, movieCount: movies.length },
  );

  const memberABallot = validateBallotRanks(
    [
      { roomMovieId: "rm-moonlight", rank: 1 },
      { roomMovieId: "rm-parasite", rank: 2 },
      { roomMovieId: "rm-shoplifters", rank: 3 },
      { roomMovieId: "rm-oldboy", rank: 4 },
    ],
    { requiredCount: required, allowedMovieIds: movieIds, movieCount: movies.length },
  );

  const memberBBallot = validateBallotRanks(
    [
      { roomMovieId: "rm-roma", rank: 1 },
      { roomMovieId: "rm-oldboy", rank: 2 },
      { roomMovieId: "rm-parasite", rank: 3 },
      { roomMovieId: "rm-moonlight", rank: 4 },
      { roomMovieId: "rm-shoplifters", rank: 5 },
    ],
    { requiredCount: required, allowedMovieIds: movieIds, movieCount: movies.length },
  );

  const memberCBallot = validateBallotRanks(
    [
      { roomMovieId: "rm-shoplifters", rank: 1 },
      { roomMovieId: "rm-moonlight", rank: 2 },
      { roomMovieId: "rm-parasite", rank: 3 },
      { roomMovieId: "rm-roma", rank: 4 },
    ],
    { requiredCount: required, allowedMovieIds: movieIds, movieCount: movies.length },
  );

  // Verify coverage on all ballots (with requireParticipantCoverage)
  const coverageMovies = movies.map((m) => ({
    roomMovieId: m.roomMovieId,
    nominatorParticipantIds: [...m.nominatorParticipantIds],
  }));

  for (const ballot of [hostBallot, memberABallot, memberBBallot, memberCBallot]) {
    assertParticipantCoverage(
      ballot.map((r) => r.roomMovieId),
      coverageMovies,
      participants,
    );
  }

  // --- FINALIZING: aggregate and produce results ---
  const ballots = [
    { participantId: host, ranks: hostBallot },
    { participantId: memberA, ranks: memberABallot },
    { participantId: memberB, ranks: memberBBallot },
    { participantId: memberC, ranks: memberCBallot },
  ];

  const drafts = assembleRoomResults({
    movies,
    ballots,
    participantIds: participants,
    ordering: FinalistOrdering.RANKED_CHOICE,
    createTieBreakRandom: () => 0.5,
  });

  assert.equal(drafts.length, 5);

  // Verify scoring: M=5
  // Parasite: host:5 + memberA:4 + memberB:3 + memberC:3 = 15
  // Oldboy: host:4 + memberA:2 + memberB:4 = 10
  // Moonlight: host:3 + memberA:5 + memberB:2 + memberC:4 = 14
  // Roma: host:2 + memberB:5 + memberC:2 = 9
  // Shoplifters: memberA:3 + memberB:1 + memberC:5 = 9
  const byId = Object.fromEntries(drafts.map((d) => [d.roomMovieId, d]));

  assert.equal(byId["rm-parasite"]?.aggregateScore, 15);
  assert.equal(byId["rm-moonlight"]?.aggregateScore, 14);
  assert.equal(byId["rm-oldboy"]?.aggregateScore, 10);
  // Roma and Shoplifters both score 9 — tied, broken by Letterboxd rating
  assert.equal(byId["rm-roma"]?.aggregateScore, 9);
  assert.equal(byId["rm-shoplifters"]?.aggregateScore, 9);
  // Roma has rating 4.1, Shoplifters has 4.0 → Roma ranks higher
  assert.ok(
    (byId["rm-roma"]?.aggregateRank ?? 0) < (byId["rm-shoplifters"]?.aggregateRank ?? 0),
    "Roma should rank above Shoplifters when their ratings break the tie",
  );

  // Verify finalist selection
  // Walk rankings: Parasite (covers host, memberA), Moonlight (covers memberA, memberC)
  // → host ✓, memberA ✓, memberC ✓ — still need memberB
  // Next: Oldboy (covers host, memberB) → memberB ✓ — all covered
  // Finalists: Parasite, Moonlight, Oldboy
  assert.equal(byId["rm-parasite"]?.isFinalist, true);
  assert.equal(byId["rm-moonlight"]?.isFinalist, true);
  assert.equal(byId["rm-oldboy"]?.isFinalist, true);
  assert.equal(byId["rm-roma"]?.isFinalist, false);
  assert.equal(byId["rm-shoplifters"]?.isFinalist, false);

  // RANKED_CHOICE ordering: worst-to-best
  // Oldboy (rank 3) → first reveal, Moonlight (rank 2) → second, Parasite (rank 1) → last
  const finalists = drafts
    .filter((d) => d.isFinalist)
    .sort((a, b) => (a.finalOrder ?? 0) - (b.finalOrder ?? 0));
  assert.equal(finalists[0]?.roomMovieId, "rm-oldboy");
  assert.equal(finalists[1]?.roomMovieId, "rm-moonlight");
  assert.equal(finalists[2]?.roomMovieId, "rm-parasite");

  // --- REVEAL: schedule and verify spoiler-safe views ---
  const finalizedAt = new Date("2026-08-21T18:00:00.000Z");

  // Schedule reveals 24 hours apart
  const schedules = finalists.map((f) => ({
    roomMovieId: f.roomMovieId,
    scheduledRevealAt: scheduledRevealAtForFinalist(finalizedAt, f.finalOrder!),
  }));
  assert.equal(schedules[0]?.scheduledRevealAt.getTime(), finalizedAt.getTime());
  assert.equal(
    schedules[1]?.scheduledRevealAt.getTime(),
    finalizedAt.getTime() + REVEAL_COOLDOWN_MS,
  );
  assert.equal(
    schedules[2]?.scheduledRevealAt.getTime(),
    finalizedAt.getTime() + 2 * REVEAL_COOLDOWN_MS,
  );

  // Before any reveal: spoiler-safe view hides all titles
  const preRevealView = buildSpoilerSafeRevealView({
    phase: RoomPhase.REVEAL,
    now: finalizedAt,
    results: finalists.map((f) => ({
      roomMovieId: f.roomMovieId,
      isFinalist: true,
      finalOrder: f.finalOrder,
      scheduledRevealAt: scheduledRevealAtForFinalist(finalizedAt, f.finalOrder!),
      revealedAt: null,
      movie: null,
    })),
  });

  assert.equal(preRevealView.totalFinalists, 3);
  assert.equal(preRevealView.revealedCount, 0);
  assert.equal(preRevealView.remainingCount, 3);
  const preRevealJson = JSON.stringify(preRevealView);
  assert.equal(preRevealJson.includes("Oldboy"), false);
  assert.equal(preRevealJson.includes("Moonlight"), false);
  assert.equal(preRevealJson.includes("Parasite"), false);

  // After all reveals: complete view shows everything
  const completeView = buildSpoilerSafeRevealView({
    phase: RoomPhase.COMPLETE,
    now: new Date(finalizedAt.getTime() + 3 * REVEAL_COOLDOWN_MS),
    results: finalists.map((f, i) => ({
      roomMovieId: f.roomMovieId,
      isFinalist: true,
      finalOrder: f.finalOrder,
      scheduledRevealAt: scheduledRevealAtForFinalist(finalizedAt, f.finalOrder!),
      revealedAt: new Date(finalizedAt.getTime() + i * REVEAL_COOLDOWN_MS),
      movie: {
        title: f.roomMovieId.replace("rm-", ""),
        releaseYear: 2020,
        posterPath: `/${f.roomMovieId}.jpg`,
        letterboxdRating: null,
        letterboxdSlug: null,
        nominators: [],
      },
    })),
  });

  assert.equal(completeView.phase, RoomPhase.COMPLETE);
  assert.equal(completeView.revealedCount, 3);
  assert.equal(completeView.remainingCount, 0);
  assert.equal(completeView.nextReveal, null);

  // Verify forward-only lifecycle: COMPLETE → nothing
  assert.equal(canTransitionRoomPhase(RoomPhase.COMPLETE, RoomPhase.SELECTION), false);
  assert.equal(canTransitionRoomPhase(RoomPhase.COMPLETE, RoomPhase.REVEAL), false);
});

// ============================================================
// E2E edge case — room where every participant nominates the
// same two movies
// ============================================================

test("all participants pick the same movies — correct aggregation and minimal finalists", () => {
  const participants = ["alice", "bob", "carol"];

  // All 3 nominate Movie X and Movie Y (heavily shared)
  const movies = [
    { roomMovieId: "x", nominatorParticipantIds: ["alice", "bob", "carol"], letterboxdRating: 4.0 as number | null },
    { roomMovieId: "y", nominatorParticipantIds: ["alice", "bob", "carol"], letterboxdRating: 3.5 as number | null },
  ];

  // Required = min(3, 2) = 2
  assert.equal(requiredRankingCount(3, 2), 2);

  const ballots = [
    { participantId: "alice", ranks: [{ roomMovieId: "x", rank: 1 }, { roomMovieId: "y", rank: 2 }] },
    { participantId: "bob", ranks: [{ roomMovieId: "x", rank: 1 }, { roomMovieId: "y", rank: 2 }] },
    { participantId: "carol", ranks: [{ roomMovieId: "y", rank: 1 }, { roomMovieId: "x", rank: 2 }] },
  ];

  const drafts = assembleRoomResults({
    movies,
    ballots,
    participantIds: participants,
    ordering: FinalistOrdering.RANKED_CHOICE,
    createTieBreakRandom: () => 0.5,
  });

  // X: 2+2+1=5, Y: 1+1+2=4
  assert.equal(drafts.find((d) => d.roomMovieId === "x")?.aggregateScore, 5);
  assert.equal(drafts.find((d) => d.roomMovieId === "y")?.aggregateScore, 4);

  // Only X needs to be a finalist to cover all 3 (all are nominators)
  const finalistIds = selectFinalistMovieIds(
    drafts.map((d) => d.roomMovieId),
    movies,
    participants,
  );
  assert.deepEqual(finalistIds, ["x"]);

  assert.equal(drafts.find((d) => d.roomMovieId === "x")?.isFinalist, true);
  assert.equal(drafts.find((d) => d.roomMovieId === "y")?.isFinalist, false);
});

// ============================================================
// E2E edge case — single participant room
// ============================================================

test("single participant room produces valid results", () => {
  const movies = [
    { roomMovieId: "solo", nominatorParticipantIds: ["lone"], letterboxdRating: null as number | null },
  ];

  assert.equal(requiredRankingCount(1, 1), 1);

  const ranks = validateBallotRanks(
    [{ roomMovieId: "solo", rank: 1 }],
    { requiredCount: 1, allowedMovieIds: ["solo"], movieCount: 1 },
  );
  assert.equal(ranks.length, 1);

  const drafts = assembleRoomResults({
    movies,
    ballots: [{ participantId: "lone", ranks }],
    participantIds: ["lone"],
    ordering: FinalistOrdering.RANKED_CHOICE,
    createTieBreakRandom: () => 0.5,
  });

  assert.equal(drafts.length, 1);
  assert.equal(drafts[0]?.isFinalist, true);
  assert.equal(drafts[0]?.finalOrder, 1);
  assert.equal(drafts[0]?.aggregateScore, 1);
});
