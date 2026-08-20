import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import test from "node:test";
import { RoomPhase } from "../app/generated/prisma/enums";

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
  "./fixtures/room-service-fixture.ts",
  import.meta.url,
).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === "@/lib/prisma" ||
      specifier === "@/lib/data/profiles"
    ) {
      return { url: fixtureModuleUrl, shortCircuit: true };
    }

    if (specifier === "server-only") {
      return { url: fixtureModuleUrl, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
});

const modules = Promise.all([
  import("./fixtures/room-service-fixture"),
  import("../lib/domain/rooms"),
  import("../lib/domain/room-transitions"),
]);

type LockRoster = (input: {
  userId: string;
  code: string;
}) => Promise<unknown>;

function requireLockRoster(
  roomService: Awaited<typeof modules>[1],
): LockRoster {
  const candidate = "lockRoster" in roomService
    ? roomService.lockRoster
    : undefined;

  assert.equal(
    typeof candidate,
    "function",
    "Production gap: the room domain does not export a lockRoster service.",
  );
  return candidate as LockRoster;
}

test.beforeEach(async () => {
  const [fixture] = await modules;
  fixture.resetRoomServiceFixture();
});

test("joining the same room twice is idempotent", async () => {
  const [fixture, roomService] = await modules;
  fixture.seedRoom({
    ownerId: "host",
    maxParticipants: 4,
  });
  fixture.seedProfile("returning-member", "movie-fan");

  const firstJoin = await roomService.joinRoom({
    userId: "returning-member",
    code: "ABC234",
  });
  const duplicateJoin = await roomService.joinRoom({
    userId: "returning-member",
    code: "ABC234",
  });

  assert.deepEqual(duplicateJoin, firstJoin);
  assert.deepEqual(fixture.roomParticipantUserIds(), [
    "host",
    "returning-member",
  ]);
});

test("simultaneous joins cannot exceed room capacity", async () => {
  const [fixture, roomService] = await modules;
  fixture.seedRoom({
    ownerId: "host",
    maxParticipants: 2,
  });
  fixture.seedProfile("racer-one");
  fixture.seedProfile("racer-two");

  const outcomes = await Promise.allSettled([
    roomService.joinRoom({ userId: "racer-one", code: "ABC234" }),
    roomService.joinRoom({ userId: "racer-two", code: "ABC234" }),
  ]);

  assert.equal(
    outcomes.filter(({ status }) => status === "fulfilled").length,
    1,
  );
  const rejection = outcomes.find(({ status }) => status === "rejected");
  assert.ok(rejection && rejection.status === "rejected");
  assert.match(String(rejection.reason), /already full/i);
  assert.equal(fixture.roomParticipantUserIds().length, 2);
  assert.deepEqual(
    fixture
      .recordedTransactionOptions()
      .map(({ isolationLevel }) => isolationLevel),
    ["Serializable", "Serializable"],
  );
});

test("a non-owner cannot lock the roster", async () => {
  const [fixture, roomService] = await modules;
  fixture.seedRoom({
    ownerId: "host",
    maxParticipants: 4,
    participantUserIds: ["host", "member"],
  });
  const lockRoster = requireLockRoster(roomService);

  await assert.rejects(
    lockRoster({ userId: "member", code: "ABC234" }),
    /only the room host/i,
  );
  assert.equal(fixture.roomRosterLockedAt(), null);
});

test("locking the roster prevents subsequent joins", async () => {
  const [fixture, roomService] = await modules;
  fixture.seedRoom({
    ownerId: "host",
    maxParticipants: 4,
  });
  fixture.seedProfile("late-member");
  const lockRoster = requireLockRoster(roomService);

  await lockRoster({ userId: "host", code: "ABC234" });
  assert.ok(fixture.roomRosterLockedAt());

  await assert.rejects(
    roomService.joinRoom({ userId: "late-member", code: "ABC234" }),
    /roster is locked/i,
  );
  assert.deepEqual(fixture.roomParticipantUserIds(), ["host"]);
});

test("locking is idempotent and advances a completed selection phase", async () => {
  const [fixture, roomService] = await modules;
  fixture.seedRoom({
    ownerId: "host",
    maxParticipants: 4,
    participantUserIds: ["host", "member"],
    selectionSubmittedUserIds: ["host", "member"],
  });
  const lockRoster = requireLockRoster(roomService);

  const firstLock = await lockRoster({
    userId: "host",
    code: "ABC234",
  }) as {
    rosterLockedAt: Date;
    phase: RoomPhase;
    alreadyLocked: boolean;
    phaseTransitioned: boolean;
  };
  const duplicateLock = await lockRoster({
    userId: "host",
    code: "ABC234",
  }) as typeof firstLock;

  assert.equal(firstLock.alreadyLocked, false);
  assert.equal(firstLock.phaseTransitioned, true);
  assert.equal(firstLock.phase, RoomPhase.VOTING);
  assert.equal(duplicateLock.alreadyLocked, true);
  assert.equal(duplicateLock.phaseTransitioned, false);
  assert.equal(duplicateLock.phase, RoomPhase.VOTING);
  assert.deepEqual(duplicateLock.rosterLockedAt, firstLock.rosterLockedAt);
  assert.equal(fixture.roomPhase(), RoomPhase.VOTING);
});

test("phase transitions require membership and are idempotent", async () => {
  const [fixture, , transitions] = await modules;
  fixture.seedRoom({
    ownerId: "host",
    maxParticipants: 4,
    participantUserIds: ["host", "member"],
    selectionSubmittedUserIds: ["host", "member"],
    rosterLockedAt: new Date("2026-08-20T18:00:00.000Z"),
  });

  await assert.rejects(
    transitions.transitionRoomPhase({
      roomId: "room-1",
      userId: "outsider",
      targetPhase: RoomPhase.VOTING,
    }),
    /not a member/i,
  );

  const firstTransition = await transitions.transitionRoomPhase({
    roomId: "room-1",
    userId: "member",
    targetPhase: RoomPhase.VOTING,
  });
  const duplicateTransition = await transitions.transitionRoomPhase({
    roomId: "room-1",
    userId: "member",
    targetPhase: RoomPhase.VOTING,
  });

  assert.equal(firstTransition.transitioned, true);
  assert.equal(firstTransition.phase, RoomPhase.VOTING);
  assert.equal(duplicateTransition.transitioned, false);
  assert.equal(duplicateTransition.alreadyReached, true);
  assert.equal(duplicateTransition.phase, RoomPhase.VOTING);
  assert.deepEqual(
    fixture.recordedTransactionOptions().map(({ isolationLevel }) => isolationLevel),
    ["Serializable", "Serializable", "Serializable"],
  );
});
