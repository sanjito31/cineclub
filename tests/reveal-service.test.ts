import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import test from "node:test";
import { RoomPhase } from "../app/generated/prisma/enums";
import { AuthorizationError } from "../lib/auth/errors";
import { RevealError } from "../lib/domain/reveal";

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

test("spoiler-safe reads hide unrevealed movies from members", async () => {
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
        revealedAt: now,
        nominatorUserIds: ["host"],
      },
      {
        id: "movie-2",
        title: "SECRET TITLE",
        isFinalist: true,
        finalOrder: 2,
        scheduledRevealAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        nominatorUserIds: ["member"],
      },
    ],
  });

  const context = await service.getRevealContext("ABC234", "member", now);

  assert.equal(context.revealed.length, 1);
  assert.equal(context.revealed[0]?.title, "Heat");
  assert.equal(context.remainingCount, 1);
  assert.equal(context.nextReveal?.isOnCooldown, true);
  assert.equal(JSON.stringify(context).includes("SECRET TITLE"), false);
  assert.equal(context.isOwner, false);
});

test("only the host can reveal, and the first movie is available immediately", async () => {
  const [fixture, service] = await modules;
  const now = new Date("2026-08-21T12:00:00.000Z");
  fixture.seedRevealRoom();

  await assert.rejects(
    service.revealNextMovie({ userId: "member", code: "ABC234", now }),
    (error: unknown) => {
      assert.ok(error instanceof AuthorizationError);
      assert.match(error.message, /only the room host/i);
      return true;
    },
  );

  const first = await service.revealNextMovie({
    userId: "host",
    code: "ABC234",
    now,
  });

  assert.equal(first.status, "revealed");
  if (first.status === "revealed") {
    assert.equal(first.revealedMovie.title, "Heat");
    assert.equal(first.remainingCount, 1);
  }
  assert.equal(fixture.roomPhase(), RoomPhase.REVEAL);
});

test("a 24-hour cooldown warns instead of blocking, then a confirmed reveal continues", async () => {
  const [fixture, service] = await modules;
  const finalizedAt = new Date("2026-08-21T12:00:00.000Z");
  const afterFirst = new Date("2026-08-21T12:05:00.000Z");
  fixture.seedRevealRoom({
    finalizedAt,
    movies: [
      {
        id: "movie-1",
        title: "Heat",
        isFinalist: true,
        finalOrder: 1,
        scheduledRevealAt: finalizedAt,
        revealedAt: finalizedAt,
        nominatorUserIds: ["host"],
      },
      {
        id: "movie-2",
        title: "Drive",
        isFinalist: true,
        finalOrder: 2,
        scheduledRevealAt: new Date(finalizedAt.getTime() + 24 * 60 * 60 * 1000),
        nominatorUserIds: ["member"],
      },
    ],
  });

  const warned = await service.revealNextMovie({
    userId: "host",
    code: "ABC234",
    now: afterFirst,
  });
  assert.equal(warned.status, "needs_confirmation");
  assert.equal(
    fixture.resultRows().find((row) => row.roomMovieId === "movie-2")?.revealedAt,
    null,
  );

  const confirmed = await service.revealNextMovie({
    userId: "host",
    code: "ABC234",
    now: afterFirst,
    confirmEarlyReveal: true,
  });

  assert.equal(confirmed.status, "revealed");
  if (confirmed.status === "revealed") {
    assert.equal(confirmed.revealedMovie.title, "Drive");
    assert.equal(confirmed.remainingCount, 0);
    assert.equal(confirmed.phase, RoomPhase.COMPLETE);
  }
  assert.equal(fixture.roomPhase(), RoomPhase.COMPLETE);
});

test("the last reveal completes the room and outsiders cannot read results", async () => {
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

  await assert.rejects(
    service.getRevealContext("ABC234", "outsider", now),
    AuthorizationError,
  );

  const revealed = await service.revealNextMovie({
    userId: "host",
    code: "ABC234",
    now,
  });
  assert.equal(revealed.status, "revealed");
  if (revealed.status === "revealed") {
    assert.equal(revealed.phase, RoomPhase.COMPLETE);
  }
  assert.equal(fixture.roomPhase(), RoomPhase.COMPLETE);

  const complete = await service.revealNextMovie({
    userId: "host",
    code: "ABC234",
    now,
  });
  assert.equal(complete.status, "complete");
});

test("reveal rejects rooms that are still voting", async () => {
  const [fixture, service] = await modules;
  fixture.seedRevealRoom({ phase: RoomPhase.VOTING });

  await assert.rejects(
    service.revealNextMovie({
      userId: "host",
      code: "ABC234",
      now: new Date("2026-08-21T12:00:00.000Z"),
    }),
    (error: unknown) => {
      assert.ok(error instanceof RevealError);
      assert.equal(error.code, "WRONG_PHASE");
      return true;
    },
  );
});
