import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import test from "node:test";
import { RoomPhase } from "../app/generated/prisma/enums";
import { AuthorizationError, DomainError } from "../lib/auth/errors";
import {
  BallotSubmissionError,
  BallotValidationError,
} from "../lib/domain/voting";

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
  "./fixtures/ballot-service-fixture.ts",
  import.meta.url,
).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === "@/lib/prisma"
      || specifier === "server-only"
      || specifier === "@/lib/tmdb/client"
    ) {
      return { url: fixtureModuleUrl, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
});

const modules = Promise.all([
  import("./fixtures/ballot-service-fixture"),
  import("../lib/data/ballots"),
  import("../lib/domain/voting"),
]);

function ranks(
  entries: Array<{ roomMovieId: string; rank: number }>,
) {
  return entries;
}

function defaultTwoMovieRanks() {
  return ranks([
    { roomMovieId: "movie-1", rank: 1 },
    { roomMovieId: "movie-2", rank: 2 },
  ]);
}

async function expectValidation(
  operation: () => Promise<unknown>,
  code: string,
  message: RegExp,
) {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof BallotValidationError);
    assert.equal(error.code, code);
    assert.match(error.message, message);
    return true;
  });
}

async function expectSubmission(
  operation: () => Promise<unknown>,
  code: string,
  message: RegExp,
) {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof BallotSubmissionError);
    assert.equal(error.code, code);
    assert.match(error.message, message);
    return true;
  });
}

test.beforeEach(async () => {
  const [fixture] = await modules;
  fixture.resetBallotServiceFixture();
});

test("requiredRankingCount is min(P, M) and zero when either count is empty", async () => {
  const [, , domain] = await modules;

  assert.equal(domain.requiredRankingCount(4, 6), 4);
  assert.equal(domain.requiredRankingCount(5, 3), 3);
  assert.equal(domain.requiredRankingCount(0, 4), 0);
  assert.equal(domain.requiredRankingCount(3, 0), 0);
});

test("coverage helpers count shared nominators and require every participant", async () => {
  const [, , domain] = await modules;
  const movies = [
    {
      roomMovieId: "movie-1",
      nominatorParticipantIds: ["alice", "bob"],
    },
    {
      roomMovieId: "movie-2",
      nominatorParticipantIds: ["carol"],
    },
  ];

  assert.deepEqual(
    domain.participantIdsCoveredByMovies(["movie-1"], movies),
    ["alice", "bob"],
  );
  assert.equal(
    domain.isParticipantCoverageSatisfied(
      ["movie-1"],
      movies,
      ["alice", "bob", "carol"],
    ),
    false,
  );
  assert.equal(
    domain.isParticipantCoverageSatisfied(
      ["movie-1", "movie-2"],
      movies,
      ["alice", "bob", "carol"],
    ),
    true,
  );
});

test("ballot validation rejects invalid, duplicate, noncontiguous, short, and unknown ranks", async () => {
  const [fixture, service] = await modules;
  fixture.seedBallotRoom({
    movies: [
      { id: "movie-1", nominatorUserIds: ["host"] },
      { id: "movie-2", nominatorUserIds: ["member"] },
      { id: "movie-3", nominatorUserIds: ["host"] },
    ],
  });

  await expectValidation(
    () =>
      service.submitBallot({
        userId: "host",
        code: "ABC234",
        ranks: { roomMovieId: "movie-1", rank: 1 },
      }),
    "INVALID_RANKS",
    /as a list/i,
  );
  await expectValidation(
    () =>
      service.submitBallot({
        userId: "host",
        code: "ABC234",
        ranks: [{ roomMovieId: "movie-1", rank: 0 }],
      }),
    "INVALID_RANK",
    /positive integer/i,
  );
  await expectValidation(
    () =>
      service.submitBallot({
        userId: "host",
        code: "ABC234",
        ranks: [
          { roomMovieId: "movie-1", rank: 1 },
          { roomMovieId: "movie-2", rank: 1 },
        ],
      }),
    "DUPLICATE_RANK",
    /rank may only be used once/i,
  );
  await expectValidation(
    () =>
      service.submitBallot({
        userId: "host",
        code: "ABC234",
        ranks: [
          { roomMovieId: "movie-1", rank: 1 },
          { roomMovieId: "movie-1", rank: 2 },
        ],
      }),
    "DUPLICATE_MOVIE",
    /movie may only be ranked once/i,
  );
  await expectValidation(
    () =>
      service.submitBallot({
        userId: "host",
        code: "ABC234",
        ranks: [
          { roomMovieId: "movie-1", rank: 1 },
          { roomMovieId: "movie-2", rank: 3 },
        ],
      }),
    "NONCONTIGUOUS_RANKS",
    /contiguous from 1 to 2/i,
  );
  await expectValidation(
    () =>
      service.submitBallot({
        userId: "host",
        code: "ABC234",
        ranks: [{ roomMovieId: "movie-1", rank: 1 }],
      }),
    "INSUFFICIENT_RANKS",
    /at least 2 movies/i,
  );
  await expectValidation(
    () =>
      service.submitBallot({
        userId: "host",
        code: "ABC234",
        ranks: [
          { roomMovieId: "movie-1", rank: 1 },
          { roomMovieId: "missing", rank: 2 },
        ],
      }),
    "UNKNOWN_MOVIE",
    /belong to this room/i,
  );

  assert.equal(fixture.ballotRows().length, 0);
  assert.equal(fixture.ballotRankRows().length, 0);
  assert.equal(fixture.participantVotingSubmission("host"), null);
});

test("a movie nominated by two people covers both participants", async () => {
  const [fixture, service] = await modules;
  fixture.seedBallotRoom({
    movies: [
      { id: "shared", nominatorUserIds: ["host", "member"] },
      { id: "solo", nominatorUserIds: ["host"] },
    ],
  });

  const result = await service.submitBallot({
    userId: "host",
    code: "ABC234",
    ranks: [
      { roomMovieId: "shared", rank: 1 },
      { roomMovieId: "solo", rank: 2 },
    ],
  });

  assert.equal(result.rankedCount, 2);
  assert.equal(fixture.ballotRows().length, 1);
});

test("coverage is required when the room flag is on and skipped when it is off", async () => {
  const [fixture, service] = await modules;
  fixture.seedBallotRoom({
    movies: [
      { id: "host-movie", nominatorUserIds: ["host"] },
      { id: "extra-host", nominatorUserIds: ["host"] },
    ],
  });

  await expectValidation(
    () =>
      service.submitBallot({
        userId: "host",
        code: "ABC234",
        ranks: [
          { roomMovieId: "host-movie", rank: 1 },
          { roomMovieId: "extra-host", rank: 2 },
        ],
      }),
    "COVERAGE_INCOMPLETE",
    /every participant/i,
  );
  assert.equal(fixture.ballotRows().length, 0);

  fixture.resetBallotServiceFixture();
  fixture.seedBallotRoom({
    requireParticipantCoverage: false,
    movies: [
      { id: "host-movie", nominatorUserIds: ["host"] },
      { id: "extra-host", nominatorUserIds: ["host"] },
    ],
  });

  const result = await service.submitBallot({
    userId: "host",
    code: "ABC234",
    ranks: [
      { roomMovieId: "host-movie", rank: 1 },
      { roomMovieId: "extra-host", rank: 2 },
    ],
  });
  assert.equal(result.rankedCount, 2);
  assert.equal(fixture.ballotRows().length, 1);
});

test("fewer unique movies than participants can satisfy coverage by ranking every movie", async () => {
  const [fixture, service, domain] = await modules;
  fixture.seedBallotRoom({
    participantUserIds: ["host", "member", "guest"],
    movies: [
      { id: "shared", nominatorUserIds: ["host", "member"] },
      { id: "guest-movie", nominatorUserIds: ["guest"] },
    ],
  });

  assert.equal(domain.requiredRankingCount(3, 2), 2);

  const result = await service.submitBallot({
    userId: "host",
    code: "ABC234",
    ranks: [
      { roomMovieId: "shared", rank: 1 },
      { roomMovieId: "guest-movie", rank: 2 },
    ],
  });

  assert.equal(result.rankedCount, 2);
  assert.equal(result.phase, RoomPhase.VOTING);
  assert.equal(result.phaseTransitioned, false);
});

test("submission requires membership, voting phase, and a locked roster", async () => {
  const [fixture, service] = await modules;
  fixture.seedBallotRoom();

  await expectSubmission(
    () =>
      service.submitBallot({
        userId: "outsider",
        code: "ABC234",
        ranks: defaultTwoMovieRanks(),
      }),
    "NOT_PARTICIPANT",
    /not a member/i,
  );

  fixture.resetBallotServiceFixture();
  fixture.seedBallotRoom({ phase: RoomPhase.SELECTION });
  await expectSubmission(
    () =>
      service.submitBallot({
        userId: "host",
        code: "ABC234",
        ranks: defaultTwoMovieRanks(),
      }),
    "WRONG_PHASE",
    /must be in voting/i,
  );

  fixture.resetBallotServiceFixture();
  fixture.seedBallotRoom({ rosterLocked: false });
  await expectSubmission(
    () =>
      service.submitBallot({
        userId: "host",
        code: "ABC234",
        ranks: defaultTwoMovieRanks(),
      }),
    "ROSTER_UNLOCKED",
    /roster is locked/i,
  );

  await assert.rejects(
    () =>
      service.submitBallot({
        userId: "host",
        code: "MISSING",
        ranks: defaultTwoMovieRanks(),
      }),
    (error: unknown) => {
      assert.ok(error instanceof BallotSubmissionError);
      assert.equal(error.code, "ROOM_NOT_FOUND");
      return true;
    },
  );

  assert.equal(fixture.ballotRows().length, 0);
});

test("a successful ballot is immutable", async () => {
  const [fixture, service] = await modules;
  fixture.seedBallotRoom();

  const first = await service.submitBallot({
    userId: "host",
    code: "ABC234",
    ranks: defaultTwoMovieRanks(),
  });
  await expectSubmission(
    () =>
      service.submitBallot({
        userId: "host",
        code: "ABC234",
        ranks: [
          { roomMovieId: "movie-2", rank: 1 },
          { roomMovieId: "movie-1", rank: 2 },
        ],
      }),
    "ALREADY_SUBMITTED",
    /already been submitted/i,
  );

  assert.equal(first.rankedCount, 2);
  assert.equal(fixture.ballotRows().length, 1);
  assert.deepEqual(
    fixture.ballotRankRows().map(({ roomMovieId, rank }) => ({
      roomMovieId,
      rank,
    })),
    defaultTwoMovieRanks(),
  );
});

test("a failed ballot write rolls back ranks and votingSubmittedAt", async () => {
  const [fixture, service] = await modules;
  fixture.seedBallotRoom();
  fixture.injectBallotCreateFailure(0);

  await assert.rejects(
    service.submitBallot({
      userId: "host",
      code: "ABC234",
      ranks: defaultTwoMovieRanks(),
    }),
    /injected ballot write failure/i,
  );

  assert.equal(fixture.ballotRows().length, 0);
  assert.equal(fixture.ballotRankRows().length, 0);
  assert.equal(fixture.participantVotingSubmission("host"), null);
  assert.equal(fixture.roomPhase(), RoomPhase.VOTING);
});

test("optional extra rankings are allowed above the minimum", async () => {
  const [fixture, service] = await modules;
  fixture.seedBallotRoom({
    movies: [
      { id: "movie-1", nominatorUserIds: ["host"] },
      { id: "movie-2", nominatorUserIds: ["member"] },
      { id: "movie-3", nominatorUserIds: ["host"] },
    ],
  });

  const result = await service.submitBallot({
    userId: "host",
    code: "ABC234",
    ranks: [
      { roomMovieId: "movie-1", rank: 1 },
      { roomMovieId: "movie-2", rank: 2 },
      { roomMovieId: "movie-3", rank: 3 },
    ],
  });

  assert.equal(result.rankedCount, 3);
  assert.equal(fixture.ballotRankRows().length, 3);
});

test("a successful submission writes the ballot, ranks, and voting timestamp", async () => {
  const [fixture, service] = await modules;
  fixture.seedBallotRoom();

  const result = await service.submitBallot({
    userId: "host",
    code: "ABC234",
    ranks: [
      { roomMovieId: "movie-2", rank: 2 },
      { roomMovieId: "movie-1", rank: 1 },
    ],
  });

  assert.equal(result.roomId, "room-1");
  assert.equal(result.code, "ABC234");
  assert.equal(result.participantId, "participant-1");
  assert.equal(result.rankedCount, 2);
  assert.equal(result.phase, RoomPhase.VOTING);
  assert.equal(result.phaseTransitioned, false);
  assert.equal(fixture.ballotRows().length, 1);
  assert.deepEqual(
    fixture.ballotRankRows().map(({ roomMovieId, rank }) => ({
      roomMovieId,
      rank,
    })),
    [
      { roomMovieId: "movie-1", rank: 1 },
      { roomMovieId: "movie-2", rank: 2 },
    ],
  );
  assert.ok(fixture.participantVotingSubmission("host"));
  assert.equal(fixture.participantVotingSubmission("member"), null);
});

test("the last submitter advances the room to finalizing", async () => {
  const [fixture, service] = await modules;
  fixture.seedBallotRoom();

  const first = await service.submitBallot({
    userId: "host",
    code: "ABC234",
    ranks: defaultTwoMovieRanks(),
  });
  const last = await service.submitBallot({
    userId: "member",
    code: "ABC234",
    ranks: [
      { roomMovieId: "movie-2", rank: 1 },
      { roomMovieId: "movie-1", rank: 2 },
    ],
  });

  assert.equal(first.phase, RoomPhase.VOTING);
  assert.equal(first.phaseTransitioned, false);
  assert.equal(last.phase, RoomPhase.FINALIZING);
  assert.equal(last.phaseTransitioned, true);
  assert.equal(fixture.roomPhase(), RoomPhase.FINALIZING);
  assert.deepEqual(
    fixture
      .recordedBallotTransactionOptions()
      .map(({ isolationLevel }) => isolationLevel),
    ["Serializable", "Serializable"],
  );
});

test("concurrent double-submit keeps one ballot and rejects the other", async () => {
  const [fixture, service] = await modules;
  fixture.seedBallotRoom();

  const [first, second] = await Promise.allSettled([
    service.submitBallot({
      userId: "host",
      code: "ABC234",
      ranks: defaultTwoMovieRanks(),
    }),
    service.submitBallot({
      userId: "host",
      code: "ABC234",
      ranks: [
        { roomMovieId: "movie-2", rank: 1 },
        { roomMovieId: "movie-1", rank: 2 },
      ],
    }),
  ]);

  const outcomes = [first, second];
  const success = outcomes.find((result) => result.status === "fulfilled");
  const failure = outcomes.find((result) => result.status === "rejected");

  assert.equal(success?.status, "fulfilled");
  assert.equal(failure?.status, "rejected");
  if (failure?.status === "rejected") {
    assert.ok(failure.reason instanceof BallotSubmissionError);
    assert.equal(failure.reason.code, "ALREADY_SUBMITTED");
  }

  assert.equal(fixture.ballotRows().length, 1);
  assert.equal(fixture.ballotRankRows().length, 2);
  assert.ok(fixture.participantVotingSubmission("host"));
  assert.equal(fixture.roomPhase(), RoomPhase.VOTING);
});

test("the vote page loader returns movies without leaking other ballots", async () => {
  const [fixture, service] = await modules;
  fixture.seedBallotRoom({
    movies: [
      {
        id: "host-movie",
        title: "Host Pick",
        tmdbId: 11,
        letterboxdSlug: "host-pick",
        letterboxdRating: 3.8,
        overview: "Stale database overview that voting must not use.",
        nominatorUserIds: ["host"],
      },
      {
        id: "member-movie",
        title: "Member Pick",
        tmdbId: 22,
        nominatorUserIds: ["member"],
      },
    ],
  });

  fixture.seedTmdbOverviews({
    11: "A host favorite about found footage.",
  });

  await service.submitBallot({
    userId: "member",
    code: "ABC234",
    ranks: [
      { roomMovieId: "member-movie", rank: 1 },
      { roomMovieId: "host-movie", rank: 2 },
    ],
  });

  const context = await service.getVotingBallotContext("ABC234", "host");
  assert.equal(context.room.phase, RoomPhase.VOTING);
  assert.equal(context.participantCount, 2);
  assert.equal(context.requiredRankingCount, 2);
  assert.equal(context.alreadySubmitted, false);
  assert.deepEqual(
    context.participants.map((participant) => participant.participantId),
    ["participant-1", "participant-2"],
  );
  assert.deepEqual(
    context.movies.map((movie) => movie.roomMovieId),
    ["host-movie", "member-movie"],
  );
  assert.deepEqual(context.movies[0]?.nominators, [
    {
      participantId: "participant-1",
      displayName: "Host",
      isCurrentUser: true,
    },
  ]);
  assert.equal(context.movies[0]?.letterboxdSlug, "host-pick");
  assert.equal(context.movies[0]?.letterboxdRating, 3.8);
  assert.equal(context.movies[0]?.letterboxdUrl, "https://letterboxd.com/film/host-pick/");
  assert.equal(context.movies[0]?.overview, "A host favorite about found footage.");
  assert.equal(context.movies[1]?.letterboxdSlug, null);
  assert.equal(context.movies[1]?.letterboxdRating, null);
  assert.equal(context.movies[1]?.letterboxdUrl, null);
  assert.equal(context.movies[1]?.overview, null);
  assert.equal(
    "ballots" in context || "ranks" in context || "ballotRanks" in context,
    false,
  );

  await assert.rejects(
    () => service.getVotingBallotContext("ABC234", "outsider"),
    (error: unknown) => {
      assert.ok(error instanceof AuthorizationError);
      return true;
    },
  );
  await assert.rejects(
    () => service.getVotingBallotContext("MISSING", "host"),
    (error: unknown) => {
      assert.ok(error instanceof DomainError);
      return true;
    },
  );
});

test("the vote page loader survives TMDB overview failures", async () => {
  const [fixture, service] = await modules;
  fixture.seedBallotRoom({
    movies: [
      {
        id: "host-movie",
        title: "Host Pick",
        tmdbId: 11,
        overview: "Stale database overview that voting must not use.",
        nominatorUserIds: ["host"],
      },
      {
        id: "member-movie",
        title: "Member Pick",
        tmdbId: 22,
        nominatorUserIds: ["member"],
      },
    ],
  });
  fixture.failTmdbMovieOverviews();

  const context = await service.getVotingBallotContext("ABC234", "host");
  assert.equal(context.movies.length, 2);
  assert.equal(context.movies[0]?.title, "Host Pick");
  assert.equal(context.movies[0]?.overview, null);
  assert.equal(context.movies[1]?.overview, null);
});
