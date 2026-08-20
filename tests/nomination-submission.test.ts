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
  "./fixtures/nomination-service-fixture.ts",
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
  import("./fixtures/nomination-service-fixture"),
  import("../lib/data/nominations"),
  import("../lib/domain/nominations"),
]);

function movie(
  slotIndex: number,
  tmdbId = 100 + slotIndex,
  overrides: Record<string, unknown> = {},
) {
  return {
    slotIndex,
    tmdbId,
    title: `Movie ${tmdbId}`,
    releaseYear: 2020 + slotIndex,
    posterPath: `/movie-${tmdbId}.jpg`,
    ...overrides,
  };
}

test.beforeEach(async () => {
  const [fixture] = await modules;
  fixture.resetNominationServiceFixture();
});

test("selection validation rejects invalid counts and slot indexes", async () => {
  const [fixture, service] = await modules;
  fixture.seedNominationRoom({ selectionsPerUser: 2 });

  await assert.rejects(
    service.submitNominations({
      userId: "host",
      code: "ABC234",
      selections: [movie(1)],
    }),
    /exactly 2/i,
  );
  await assert.rejects(
    service.submitNominations({
      userId: "host",
      code: "ABC234",
      selections: [movie(0), movie(1)],
    }),
    /positive integers starting at 1/i,
  );
  await assert.rejects(
    service.submitNominations({
      userId: "host",
      code: "ABC234",
      selections: [movie(1), movie(3)],
    }),
    /contiguous/i,
  );
  await assert.rejects(
    service.submitNominations({
      userId: "host",
      code: "ABC234",
      selections: [movie(1), movie(1, 102)],
    }),
    /slot may only be submitted once/i,
  );

  assert.equal(fixture.roomMovieRows().length, 0);
  assert.equal(fixture.nominationRows().length, 0);
  assert.equal(fixture.participantSubmission("host"), null);
});

test("selection validation normalizes snapshots and rejects malformed metadata", async () => {
  const [fixture, service, domain] = await modules;
  fixture.seedNominationRoom({
    selectionsPerUser: 1,
    participantUserIds: ["host", "member"],
  });

  const validated = domain.validateNominationSelections(
    [
      movie(1, 101, {
        title: "  A   Movie  ",
        posterPath: " /poster.jpg ",
      }),
    ],
    1,
  );
  assert.equal(validated[0]?.title, "A Movie");
  assert.equal(validated[0]?.posterPath, "/poster.jpg");

  await assert.rejects(
    service.submitNominations({
      userId: "host",
      code: "ABC234",
      selections: [movie(1, 101, { posterPath: "https://example.com/x.jpg" })],
    }),
    /TMDB image paths/i,
  );
  assert.equal(fixture.roomMovieRows().length, 0);
});

test("the same participant cannot nominate one movie twice", async () => {
  const [fixture, service] = await modules;
  fixture.seedNominationRoom({ selectionsPerUser: 2 });

  await assert.rejects(
    service.submitNominations({
      userId: "host",
      code: "ABC234",
      selections: [movie(1, 777), movie(2, 777)],
    }),
    /different movie/i,
  );

  assert.equal(fixture.roomMovieRows().length, 0);
  assert.equal(fixture.nominationRows().length, 0);
});

test("cross-participant duplicates share a room movie and remain warnings", async () => {
  const [fixture, service] = await modules;
  fixture.seedNominationRoom({ selectionsPerUser: 2 });

  await service.submitNominations({
    userId: "host",
    code: "ABC234",
    selections: [movie(1, 501), movie(2, 502)],
  });
  const memberResult = await service.submitNominations({
    userId: "member",
    code: "ABC234",
    selections: [movie(1, 501), movie(2, 503)],
  });

  assert.equal(fixture.roomMovieRows().length, 3);
  assert.equal(fixture.nominationRows().length, 4);
  assert.deepEqual(memberResult.duplicates.existingByOtherParticipants, [
    { tmdbId: 501, participantIds: ["participant-1"] },
  ]);
  const sharedMovie = fixture.roomMovieRows().find(({ tmdbId }) => tmdbId === 501);
  assert.ok(sharedMovie);
  assert.equal(
    fixture
      .nominationRows()
      .filter(({ roomMovieId }) => roomMovieId === sharedMovie.id).length,
    2,
  );
});

test("a failed nomination write rolls back every selection row", async () => {
  const [fixture, service] = await modules;
  fixture.seedNominationRoom({ selectionsPerUser: 2 });
  fixture.injectNominationCreateFailure(1);

  await assert.rejects(
    service.submitNominations({
      userId: "host",
      code: "ABC234",
      selections: [movie(1), movie(2)],
    }),
    /injected nomination write failure/i,
  );

  assert.equal(fixture.roomMovieRows().length, 0);
  assert.equal(fixture.nominationRows().length, 0);
  assert.equal(fixture.participantSubmission("host"), null);
  assert.equal(fixture.roomPhase(), RoomPhase.SELECTION);
});

test("submission requires membership and selection phase", async () => {
  const [fixture, service] = await modules;
  fixture.seedNominationRoom({ selectionsPerUser: 1 });

  await assert.rejects(
    service.submitNominations({
      userId: "outsider",
      code: "ABC234",
      selections: [movie(1)],
    }),
    /not a member/i,
  );

  fixture.resetNominationServiceFixture();
  fixture.seedNominationRoom({
    selectionsPerUser: 1,
    phase: RoomPhase.VOTING,
  });
  await assert.rejects(
    service.submitNominations({
      userId: "host",
      code: "ABC234",
      selections: [movie(1)],
    }),
    /must be in selection/i,
  );

  assert.equal(fixture.roomMovieRows().length, 0);
  assert.equal(fixture.nominationRows().length, 0);
});

test("participants can submit selections before the roster is locked", async () => {
  const [fixture, service] = await modules;
  fixture.seedNominationRoom({
    selectionsPerUser: 1,
    rosterLocked: false,
  });

  const first = await service.submitNominations({
    userId: "host",
    code: "ABC234",
    selections: [movie(1, 101)],
  });
  const last = await service.submitNominations({
    userId: "member",
    code: "ABC234",
    selections: [movie(1, 202)],
  });

  assert.equal(first.phase, RoomPhase.SELECTION);
  assert.equal(first.phaseTransitioned, false);
  assert.equal(last.phase, RoomPhase.SELECTION);
  assert.equal(last.phaseTransitioned, false);
  assert.equal(fixture.nominationRows().length, 2);
  assert.equal(fixture.roomPhase(), RoomPhase.SELECTION);
});

test("a successful submission is immutable", async () => {
  const [fixture, service] = await modules;
  fixture.seedNominationRoom({
    selectionsPerUser: 1,
    participantUserIds: ["host", "member"],
  });

  const first = await service.submitNominations({
    userId: "host",
    code: "ABC234",
    selections: [movie(1, 101)],
  });
  await assert.rejects(
    service.submitNominations({
      userId: "host",
      code: "ABC234",
      selections: [movie(1, 202)],
    }),
    /already been submitted/i,
  );

  assert.equal(first.nominations.length, 1);
  assert.deepEqual(
    fixture.roomMovieRows().map(({ tmdbId }) => tmdbId),
    [101],
  );
  assert.equal(fixture.nominationRows().length, 1);
});

test("concurrent submissions safely upsert a shared TMDB movie", async () => {
  const [fixture, service] = await modules;
  fixture.seedNominationRoom({ selectionsPerUser: 1 });

  const [hostResult, memberResult] = await Promise.all([
    service.submitNominations({
      userId: "host",
      code: "ABC234",
      selections: [movie(1, 999)],
    }),
    service.submitNominations({
      userId: "member",
      code: "ABC234",
      selections: [movie(1, 999)],
    }),
  ]);

  assert.equal(fixture.roomMovieRows().length, 1);
  assert.equal(fixture.nominationRows().length, 2);
  assert.equal(
    hostResult.nominations[0]?.roomMovieId,
    memberResult.nominations[0]?.roomMovieId,
  );
  assert.equal(fixture.roomPhase(), RoomPhase.VOTING);
  assert.deepEqual(
    fixture
      .recordedNominationTransactionOptions()
      .map(({ isolationLevel }) => isolationLevel),
    ["Serializable", "Serializable"],
  );
});

test("the last valid submitter advances the room to voting", async () => {
  const [fixture, service] = await modules;
  fixture.seedNominationRoom({ selectionsPerUser: 1 });

  const first = await service.submitNominations({
    userId: "host",
    code: "ABC234",
    selections: [movie(1, 101)],
  });
  const last = await service.submitNominations({
    userId: "member",
    code: "ABC234",
    selections: [movie(1, 202)],
  });

  assert.equal(first.phase, RoomPhase.SELECTION);
  assert.equal(first.phaseTransitioned, false);
  assert.equal(last.phase, RoomPhase.VOTING);
  assert.equal(last.phaseTransitioned, true);
  assert.equal(fixture.roomPhase(), RoomPhase.VOTING);
});
