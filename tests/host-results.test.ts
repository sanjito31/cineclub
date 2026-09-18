import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import test from "node:test";
import { FinalistOrdering, RoomPhase } from "../app/generated/prisma/enums";
import { AuthorizationError, DomainError } from "../lib/auth/errors";

const fixtureModuleUrl = new URL("./fixtures/host-results-fixture.ts", import.meta.url).href;
type ResolveContext = {
  parentURL?: string;
  conditions: string[];
  importAttributes: Record<string, string>;
};
type ResolveResult = { url: string; format?: string; shortCircuit?: boolean };
type ResolveHook = (
  specifier: string,
  context: ResolveContext,
  nextResolve: (specifier: string, context: ResolveContext) => ResolveResult,
) => ResolveResult;
const registerHooks = (nodeModule as unknown as {
  registerHooks(hooks: { resolve: ResolveHook }): unknown;
}).registerHooks;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/prisma" || specifier === "server-only") {
      return { url: fixtureModuleUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const modules = Promise.all([
  import("./fixtures/host-results-fixture"),
  import("../lib/data/host-results"),
]);

test.beforeEach(async () => {
  const [fixture] = await modules;
  fixture.resetHostResultsFixture();
});

test("members and outsiders cannot load unrevealed host results", async () => {
  const [fixture, service] = await modules;
  for (const userId of ["member", "outsider"]) {
    await assert.rejects(service.getHostResults("ABC234", userId), AuthorizationError);
  }
  assert.equal(fixture.resultReads, 0);
  await assert.rejects(service.getHostResults("MISSING", "host"), DomainError);
});

test("host sees only this room's finalists before any reveal, with scores and zero-inclusive vote counts", async () => {
  const [, service] = await modules;
  const result = await service.getHostResults("ABC234", "host");
  assert.ok(result);
  assert.deepEqual(result.finalists.map((movie) => ({
    title: movie.title, rank: movie.finalistRank, overall: movie.aggregateRank,
    score: movie.score, votes: movie.voteCount, revealed: movie.revealed,
  })), [
    { title: "Heat", rank: 1, overall: 1, score: 12, votes: 2, revealed: false },
    { title: "Drive", rank: 2, overall: 3, score: 10, votes: 3, revealed: false },
    { title: "Unrevealed finalist", rank: 3, overall: 4, score: 0, votes: 0, revealed: false },
  ]);
});

test("all comparison orders use saved ranks and randomness without changing the official order", async () => {
  const [fixture, service] = await modules;
  const before = structuredClone(fixture.rows);
  const result = await service.getHostResults("ABC234", "host");
  assert.ok(result);
  assert.deepEqual(Object.fromEntries(result.orders.map((order) => [order.id, order.movieIds])), {
    OFFICIAL: ["c", "b", "a"],
    RANKED_CHOICE_FORWARD: ["a", "b", "c"],
    RANKED_CHOICE: ["c", "b", "a"],
    RANDOM: ["c", "a", "b"],
  });
  assert.deepEqual(await service.getHostResults("ABC234", "host"), result);
  assert.deepEqual(fixture.rows, before);
  assert.equal(fixture.room.finalistOrdering, FinalistOrdering.RANKED_CHOICE);
});

test("results are available after completion but not while ballots or finalization are pending", async () => {
  const [fixture, service] = await modules;
  for (const phase of [RoomPhase.SELECTION, RoomPhase.VOTING, RoomPhase.FINALIZING]) {
    fixture.room.phase = phase;
    assert.equal(await service.getHostResults("ABC234", "host"), null);
  }
  assert.equal(fixture.resultReads, 0);
  fixture.room.phase = RoomPhase.COMPLETE;
  assert.ok(await service.getHostResults("ABC234", "host"));
});
