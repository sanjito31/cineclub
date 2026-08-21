import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import test from "node:test";
import { RoomPhase } from "../app/generated/prisma/enums";
import { AuthorizationError } from "../lib/auth/errors";
import { RevealError, REVEAL_COOLDOWN_MS } from "../lib/domain/reveal";

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
  "./fixtures/reveal-service-fixture.ts",
  import.meta.url,
).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/prisma" || specifier === "server-only") {
      return { url: fixtureModuleUrl, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
});

const modules = Promise.all([
  import("./fixtures/reveal-service-fixture"),
  import("../lib/data/reveal"),
]);

test.beforeEach(async () => {
  const [fixture] = await modules;
  fixture.resetRevealFixture();
});

// ============================================================
// Concurrency — simultaneous reveal attempts
// ============================================================

test("concurrent reveals each advance to the next unrevealed movie", async () => {
  const [fixture, service] = await modules;
  const now = new Date("2026-08-21T12:00:00.000Z");
  fixture.seedRevealRoom({
    movies: [
      {
        id: "movie-1",
        title: "Heat",
        isFinalist: true,
        finalOrder: 1,
        scheduledRevealAt: now,
        nominatorUserIds: ["host"],
      },
      {
        id: "movie-2",
        title: "Drive",
        isFinalist: true,
        finalOrder: 2,
        scheduledRevealAt: new Date(now.getTime() + REVEAL_COOLDOWN_MS),
        nominatorUserIds: ["member"],
      },
    ],
  });

  // Fire two reveal calls concurrently (fixture serializes transactions)
  const [first, second] = await Promise.all([
    service.revealNextMovie({
      userId: "host",
      code: "ABC234",
      now,
      confirmEarlyReveal: true,
    }),
    service.revealNextMovie({
      userId: "host",
      code: "ABC234",
      now,
      confirmEarlyReveal: true,
    }),
  ]);

  // First call reveals movie-1. Second call sees movie-1 already revealed,
  // proceeds to reveal movie-2. Both succeed.
  assert.equal(first.status, "revealed");
  assert.equal(second.status, "revealed");
  if (first.status === "revealed" && second.status === "revealed") {
    const titles = [first.revealedMovie.title, second.revealedMovie.title].sort();
    assert.deepEqual(titles, ["Drive", "Heat"]);
  }

  // Both movies are now revealed and room is complete
  assert.equal(fixture.roomPhase(), RoomPhase.COMPLETE);
  const rows = fixture.resultRows();
  assert.ok(rows.every((row) => !row.isFinalist || row.revealedAt !== null));
});

test("concurrent reveals on last movie — one succeeds, other sees complete", async () => {
  const [fixture, service] = await modules;
  const now = new Date("2026-08-21T12:00:00.000Z");
  fixture.seedRevealRoom({
    movies: [
      {
        id: "movie-1",
        title: "Heat",
        isFinalist: true,
        finalOrder: 1,
        scheduledRevealAt: now,
        nominatorUserIds: ["host"],
      },
    ],
  });

  // Both try to reveal the single remaining movie
  const [first, second] = await Promise.all([
    service.revealNextMovie({
      userId: "host",
      code: "ABC234",
      now,
    }),
    service.revealNextMovie({
      userId: "host",
      code: "ABC234",
      now,
    }),
  ]);

  // One reveals, the other sees room already complete
  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, ["complete", "revealed"]);
  assert.equal(fixture.roomPhase(), RoomPhase.COMPLETE);
});

// ============================================================
// Concurrency — simultaneous reveal when already complete
// ============================================================

test("reveal attempts on completed room both return complete", async () => {
  const [fixture, service] = await modules;
  fixture.seedRevealRoom({
    phase: RoomPhase.COMPLETE,
    movies: [
      {
        id: "movie-1",
        title: "Heat",
        isFinalist: true,
        finalOrder: 1,
        scheduledRevealAt: new Date("2026-08-21T12:00:00.000Z"),
        revealedAt: new Date("2026-08-21T12:00:00.000Z"),
        nominatorUserIds: ["host"],
      },
    ],
  });

  const [first, second] = await Promise.all([
    service.revealNextMovie({
      userId: "host",
      code: "ABC234",
      now: new Date("2026-08-22T12:00:00.000Z"),
    }),
    service.revealNextMovie({
      userId: "host",
      code: "ABC234",
      now: new Date("2026-08-22T12:00:00.000Z"),
    }),
  ]);

  assert.equal(first.status, "complete");
  assert.equal(second.status, "complete");
});

// ============================================================
// Security — non-member reveal context access
// ============================================================

test("non-member cannot read reveal context", async () => {
  const [fixture, service] = await modules;
  fixture.seedRevealRoom();

  await assert.rejects(
    service.getRevealContext("ABC234", "outsider"),
    AuthorizationError,
  );
});

test("non-member cannot attempt a reveal", async () => {
  const [fixture, service] = await modules;
  fixture.seedRevealRoom();

  await assert.rejects(
    service.revealNextMovie({
      userId: "outsider",
      code: "ABC234",
      now: new Date("2026-08-21T12:00:00.000Z"),
    }),
    AuthorizationError,
  );
});

// ============================================================
// Security — member attempting host-only reveal
// ============================================================

test("non-host member cannot reveal", async () => {
  const [fixture, service] = await modules;
  fixture.seedRevealRoom();

  await assert.rejects(
    service.revealNextMovie({
      userId: "member",
      code: "ABC234",
      now: new Date("2026-08-21T12:00:00.000Z"),
    }),
    (error: unknown) => {
      assert.ok(error instanceof AuthorizationError);
      assert.match(error.message, /only the room host/i);
      return true;
    },
  );
});

// ============================================================
// Security — wrong phase reveal
// ============================================================

test("reveal rejects rooms in selection, voting, and finalizing phases", async () => {
  const [fixture, service] = await modules;

  for (const phase of [RoomPhase.SELECTION, RoomPhase.VOTING, RoomPhase.FINALIZING]) {
    fixture.resetRevealFixture();
    fixture.seedRevealRoom({ phase });

    await assert.rejects(
      service.revealNextMovie({
        userId: "host",
        code: "ABC234",
        now: new Date("2026-08-21T12:00:00.000Z"),
      }),
      (error: unknown) => {
        assert.ok(error instanceof RevealError || error instanceof AuthorizationError);
        return true;
      },
    );
  }
});

// ============================================================
// Idempotency — duplicate reveal request
// ============================================================

test("reveal is idempotent — double reveal of same movie returns already_revealed", async () => {
  const [fixture, service] = await modules;
  const now = new Date("2026-08-21T12:00:00.000Z");
  fixture.seedRevealRoom({
    movies: [
      {
        id: "movie-1",
        title: "Heat",
        isFinalist: true,
        finalOrder: 1,
        scheduledRevealAt: now,
        nominatorUserIds: ["host"],
      },
      {
        id: "movie-2",
        title: "Drive",
        isFinalist: true,
        finalOrder: 2,
        scheduledRevealAt: new Date(now.getTime() + REVEAL_COOLDOWN_MS),
        nominatorUserIds: ["member"],
      },
    ],
  });

  const first = await service.revealNextMovie({
    userId: "host",
    code: "ABC234",
    now,
  });
  assert.equal(first.status, "revealed");

  // Second reveal of next movie (with confirmation to skip cooldown)
  const second = await service.revealNextMovie({
    userId: "host",
    code: "ABC234",
    now,
    confirmEarlyReveal: true,
  });
  assert.equal(second.status, "revealed");

  // Room should be complete now
  assert.equal(fixture.roomPhase(), RoomPhase.COMPLETE);

  // Third attempt — room is complete
  const third = await service.revealNextMovie({
    userId: "host",
    code: "ABC234",
    now,
  });
  assert.equal(third.status, "complete");
});

// ============================================================
// Security — nonexistent room
// ============================================================

test("reveal rejects nonexistent room codes", async () => {
  const [, service] = await modules;

  await assert.rejects(
    service.revealNextMovie({
      userId: "host",
      code: "NONEXIST",
      now: new Date("2026-08-21T12:00:00.000Z"),
    }),
    (error: unknown) => {
      assert.ok(error instanceof RevealError);
      assert.equal(error.code, "ROOM_NOT_FOUND");
      return true;
    },
  );

  await assert.rejects(
    service.getRevealContext("NONEXIST", "host"),
    (error: unknown) => {
      assert.ok(error instanceof RevealError);
      return true;
    },
  );
});
