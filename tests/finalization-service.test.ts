import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import test from "node:test";
import { FinalistOrdering, RoomPhase } from "../app/generated/prisma/enums";
import { AuthorizationError } from "../lib/auth/errors";
import { FinalizationError } from "../lib/domain/finalization";

type ResolveContext = {
  parentURL?: string;
  conditions: string[];
  importAttributes: Record<string, string>;
};

type ResolveResult = {
  url: string;
  format?: string;
  shortCircuit?: boolean;
};

type ResolveHook = (
  specifier: string,
  context: ResolveContext,
  nextResolve: (specifier: string, context: ResolveContext) => ResolveResult,
) => ResolveResult;

const registerHooks = (
  nodeModule as unknown as {
    registerHooks(hooks: { resolve: ResolveHook }): unknown;
  }
).registerHooks;

const fixtureModuleUrl = new URL(
  "./fixtures/finalization-service-fixture.ts",
  import.meta.url,
).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === "@/lib/prisma"
      || specifier === "server-only"
      || specifier === "@/lib/data/watchboxd-room"
    ) {
      return { url: fixtureModuleUrl, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
});

const modules = Promise.all([
  import("./fixtures/finalization-service-fixture"),
  import("../lib/data/finalization"),
]);

test.beforeEach(async () => {
  const [fixture] = await modules;
  fixture.resetFinalizationFixture();
});

test("finalization waits when Letterboxd ratings are still pending", async () => {
  const [fixture, service] = await modules;
  fixture.seedFinalizationRoom({
    movies: [
      {
        id: "movie-1",
        tmdbId: 101,
        nominatorUserIds: ["host"],
      },
      {
        id: "movie-2",
        tmdbId: 102,
        nominatorUserIds: ["member"],
        letterboxdRating: 3.8,
      },
    ],
  });
  fixture.seedWatchboxdLookup({
    tmdbId: 101,
    letterboxdRating: null,
    letterboxdRatingJobId: "job-101",
    letterboxdSlug: null,
  });

  const result = await service.finalizeRoom({
    userId: "host",
    code: "ABC234",
  });

  assert.equal(result.status, "pending");
  if (result.status === "pending") {
    assert.equal(result.pendingRatingCount, 1);
    assert.equal(result.phase, RoomPhase.FINALIZING);
  }
  assert.equal(fixture.roomPhase(), RoomPhase.FINALIZING);
  assert.equal(fixture.resultRows().length, 0);
  assert.equal(
    fixture.movieRows().find((movie) => movie.id === "movie-1")?.letterboxdJobId,
    "job-101",
  );
});

test("finalization persists immutable ranked results and advances to reveal", async () => {
  const [fixture, service] = await modules;
  fixture.seedFinalizationRoom({
    ordering: FinalistOrdering.RANKED_CHOICE,
    movies: [
      {
        id: "movie-1",
        tmdbId: 101,
        nominatorUserIds: ["host"],
        letterboxdRating: 4.6,
        ratingFetchedAt: new Date("2026-08-21T12:00:00.000Z"),
      },
      {
        id: "movie-2",
        tmdbId: 102,
        nominatorUserIds: ["member"],
        letterboxdRating: 3.1,
        ratingFetchedAt: new Date("2026-08-21T12:00:00.000Z"),
      },
    ],
    ballots: [
      {
        userId: "host",
        ranks: [
          { roomMovieId: "movie-1", rank: 1 },
          { roomMovieId: "movie-2", rank: 2 },
        ],
      },
      {
        userId: "member",
        ranks: [
          { roomMovieId: "movie-1", rank: 1 },
          { roomMovieId: "movie-2", rank: 2 },
        ],
      },
    ],
  });

  const first = await service.finalizeRoom({
    userId: "member",
    code: "ABC234",
  });
  const second = await service.finalizeRoom({
    userId: "host",
    code: "ABC234",
  });

  assert.equal(first.status, "ready");
  assert.equal(first.phase, RoomPhase.REVEAL);
  assert.equal(first.alreadyFinalized, false);
  assert.equal(first.resultCount, 2);
  assert.equal(first.finalistCount, 2);
  assert.equal(second.status, "ready");
  assert.equal(second.alreadyFinalized, true);
  assert.equal(fixture.roomPhase(), RoomPhase.REVEAL);
  assert.ok(fixture.roomFinalizedAt());

  const rows = fixture.resultRows();
  assert.equal(rows[0]?.roomMovieId, "movie-1");
  assert.equal(rows[0]?.aggregateScore, 4);
  assert.equal(rows[0]?.aggregateRank, 1);
  assert.equal(rows[0]?.isFinalist, true);
  assert.equal(rows[0]?.finalOrder, 2);
  assert.equal(rows[1]?.roomMovieId, "movie-2");
  assert.equal(rows[1]?.finalOrder, 1);
  assert.ok(rows[1]?.scheduledRevealAt);
  assert.ok(rows[0]?.scheduledRevealAt);
  assert.equal(
    (rows[0]?.scheduledRevealAt?.getTime() ?? 0)
      - (rows[1]?.scheduledRevealAt?.getTime() ?? 0),
    24 * 60 * 60 * 1000,
  );
  assert.equal(rows[0]?.revealedAt ?? null, null);
  assert.deepEqual(rows, fixture.resultRows());
});

test("finalization rejects outsiders and rooms that are not finalizing", async () => {
  const [fixture, service] = await modules;
  fixture.seedFinalizationRoom({
    phase: RoomPhase.VOTING,
  });

  await assert.rejects(
    service.finalizeRoom({ userId: "outsider", code: "ABC234" }),
    (error: unknown) => {
      assert.ok(error instanceof AuthorizationError);
      return true;
    },
  );

  await assert.rejects(
    service.finalizeRoom({ userId: "host", code: "ABC234" }),
    (error: unknown) => {
      assert.ok(error instanceof FinalizationError);
      assert.equal(error.code, "WRONG_PHASE");
      return true;
    },
  );
});
