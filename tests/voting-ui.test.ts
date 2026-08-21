import assert from "node:assert/strict";
import test from "node:test";
import {
  appendRankedMovie,
  formatNominatorList,
  isParticipantCoverageSatisfied,
  letterboxdFilmUrl,
  minimumRankingCopy,
  moveRankedMovie,
  moveRankedMovieToIndex,
  nominationGroupsForParticipants,
  participantCoverageFromRankedIds,
  participantIdsCoveredByMovies,
  removeRankedMovie,
  requiredRankingCount,
  serializeBallotSubmission,
  toBallotMovieCoverage,
  toVotingClientContext,
  uniqueVotingMovies,
  type VotingMovie,
} from "../app/rooms/[code]/voting-contracts";

function movie(
  roomMovieId: string,
  title: string,
  nominators: VotingMovie["nominators"],
  tmdbId = Number(roomMovieId.replace(/\D/g, "") || 1),
  extras: Partial<Pick<VotingMovie, "letterboxdRating" | "letterboxdSlug" | "letterboxdUrl" | "overview">> = {},
): VotingMovie {
  const letterboxdSlug = extras.letterboxdSlug ?? null;
  return {
    roomMovieId,
    tmdbId,
    title,
    releaseYear: 2026,
    overview: extras.overview ?? null,
    posterPath: null,
    letterboxdRating: extras.letterboxdRating ?? null,
    letterboxdSlug,
    letterboxdUrl: extras.letterboxdUrl ?? letterboxdFilmUrl(letterboxdSlug),
    nominators,
  };
}

const alice = { participantId: "p-alice", displayName: "Alice", isCurrentUser: false };
const bob = { participantId: "p-bob", displayName: "Bob", isCurrentUser: true };
const cara = { participantId: "p-cara", displayName: "Cara", isCurrentUser: false };

test("required ranking count is the smaller of participant count and unique movies", () => {
  assert.equal(requiredRankingCount(4, 8), 4);
  assert.equal(requiredRankingCount(5, 3), 3);
  assert.equal(requiredRankingCount(2, 2), 2);
});

test("grouped voting movies keep one card per unique room movie and merge nominators", () => {
  const grouped = uniqueVotingMovies([
    movie("rm-1", "Heat", [alice], 101, {
      letterboxdSlug: "heat",
      letterboxdRating: 4.1,
      overview: "A crew of thieves hits the banks of L.A.",
    }),
    movie("rm-2", "Drive", [cara], 202),
    movie("rm-1", "Heat", [bob], 101),
  ]);

  assert.equal(grouped.length, 2);
  assert.deepEqual(
    grouped.map((entry) => entry.roomMovieId),
    ["rm-1", "rm-2"],
  );
  assert.deepEqual(
    grouped[0]?.nominators.map((nominator) => nominator.participantId),
    ["p-alice", "p-bob"],
  );
  assert.equal(grouped[0]?.letterboxdSlug, "heat");
  assert.equal(grouped[0]?.letterboxdUrl, "https://letterboxd.com/film/heat/");
  assert.equal(grouped[0]?.letterboxdRating, 4.1);
  assert.equal(grouped[0]?.overview, "A crew of thieves hits the banks of L.A.");
});

test("nomination groups stack each participant and repeat shared movies", () => {
  const movies = [
    movie("rm-shared", "Heat", [alice, bob]),
    movie("rm-cara", "Drive", [cara]),
    movie("rm-alice", "Zodiac", [alice]),
  ];
  const dana = { participantId: "p-dana", displayName: "Dana", isCurrentUser: false };
  const groups = nominationGroupsForParticipants(
    movies,
    [alice, bob, cara, dana],
    [],
  );

  assert.deepEqual(
    groups.map((group) => group.participantId),
    ["p-bob", "p-alice", "p-cara", "p-dana"],
  );
  assert.deepEqual(
    groups.find((group) => group.participantId === "p-alice")?.movies.map((entry) => entry.roomMovieId),
    ["rm-shared", "rm-alice"],
  );
  assert.deepEqual(
    groups.find((group) => group.participantId === "p-bob")?.movies.map((entry) => entry.roomMovieId),
    ["rm-shared"],
  );
  assert.deepEqual(
    groups.find((group) => group.participantId === "p-dana")?.movies.map((entry) => entry.roomMovieId),
    [],
  );
  assert.equal(groups.every((group) => !group.covered), true);
});

test("selecting a shared movie once covers every nominator and does not duplicate ranks", () => {
  const movies = [
    movie("rm-shared", "Heat", [alice, bob]),
    movie("rm-cara", "Drive", [cara]),
  ];
  const participants = [alice, bob, cara];
  const coverageMovies = toBallotMovieCoverage(movies);
  const participantIds = participants.map((participant) => participant.participantId);

  let ranked = appendRankedMovie([], "rm-shared");
  ranked = appendRankedMovie(ranked, "rm-shared");
  assert.deepEqual(ranked, ["rm-shared"]);
  assert.deepEqual(
    participantIdsCoveredByMovies(ranked, coverageMovies),
    ["p-alice", "p-bob"],
  );
  assert.equal(
    isParticipantCoverageSatisfied(ranked, coverageMovies, participantIds),
    false,
  );

  const groups = nominationGroupsForParticipants(movies, participants, ranked);
  assert.equal(groups.find((group) => group.participantId === "p-alice")?.covered, true);
  assert.equal(groups.find((group) => group.participantId === "p-bob")?.covered, true);
  assert.equal(groups.find((group) => group.participantId === "p-cara")?.covered, false);

  ranked = appendRankedMovie(ranked, "rm-cara");
  assert.equal(
    isParticipantCoverageSatisfied(ranked, coverageMovies, participantIds),
    true,
  );
  assert.equal(
    serializeBallotSubmission(ranked),
    JSON.stringify([
      { roomMovieId: "rm-shared", rank: 1 },
      { roomMovieId: "rm-cara", rank: 2 },
    ]),
  );
});

test("removing the last covering movie unsatisfies those nominators", () => {
  const movies = [
    movie("rm-shared", "Heat", [alice, bob]),
    movie("rm-cara", "Drive", [cara]),
  ];
  const participants = [alice, bob, cara];
  let ranked = ["rm-shared", "rm-cara"];
  assert.equal(
    nominationGroupsForParticipants(movies, participants, ranked)
      .every((group) => group.covered),
    true,
  );

  ranked = removeRankedMovie(ranked, "rm-shared");
  const groups = nominationGroupsForParticipants(movies, participants, ranked);
  assert.deepEqual(
    Object.fromEntries(groups.map((group) => [group.participantId, group.covered])),
    {
      "p-bob": false,
      "p-alice": false,
      "p-cara": true,
    },
  );
  assert.equal(
    isParticipantCoverageSatisfied(
      ranked,
      toBallotMovieCoverage(movies),
      participants.map((participant) => participant.participantId),
    ),
    false,
  );
});

test("a ranked movie nominated by two people covers both participants", () => {
  const movies = [
    movie("rm-shared", "Heat", [alice, bob]),
    movie("rm-cara", "Drive", [cara]),
  ];
  const coverageMovies = toBallotMovieCoverage(movies);
  const participantIds = ["p-alice", "p-bob", "p-cara"];

  assert.deepEqual(
    participantIdsCoveredByMovies(["rm-shared"], coverageMovies),
    ["p-alice", "p-bob"],
  );
  assert.equal(
    isParticipantCoverageSatisfied(["rm-shared"], coverageMovies, participantIds),
    false,
  );
  assert.equal(
    isParticipantCoverageSatisfied(
      ["rm-shared", "rm-cara"],
      coverageMovies,
      participantIds,
    ),
    true,
  );

  const coverage = participantCoverageFromRankedIds(movies, ["rm-shared"]);
  assert.deepEqual(
    Object.fromEntries(coverage.map((participant) => [participant.participantId, participant.covered])),
    {
      "p-alice": true,
      "p-bob": true,
      "p-cara": false,
    },
  );
});

test("ballot submission payload ranks unique movies contiguously from 1", () => {
  assert.equal(
    serializeBallotSubmission(["rm-1", "rm-2", "rm-3"]),
    JSON.stringify([
      { roomMovieId: "rm-1", rank: 1 },
      { roomMovieId: "rm-2", rank: 2 },
      { roomMovieId: "rm-3", rank: 3 },
    ]),
  );
});

test("ranking helpers append, drag-reorder, and return movies to the pool", () => {
  const ranked = appendRankedMovie(["rm-1"], "rm-2");
  assert.deepEqual(ranked, ["rm-1", "rm-2"]);
  assert.deepEqual(appendRankedMovie(ranked, "rm-1"), ["rm-1", "rm-2"]);
  assert.deepEqual(moveRankedMovie(ranked, "rm-2", -1), ["rm-2", "rm-1"]);
  assert.deepEqual(moveRankedMovieToIndex(["rm-1", "rm-2", "rm-3"], "rm-3", 0), [
    "rm-3",
    "rm-1",
    "rm-2",
  ]);
  assert.deepEqual(moveRankedMovieToIndex(["rm-1", "rm-2", "rm-3"], "rm-1", 2), [
    "rm-2",
    "rm-3",
    "rm-1",
  ]);
  const afterRemove = removeRankedMovie(["rm-3", "rm-1", "rm-2"], "rm-1");
  assert.deepEqual(afterRemove, ["rm-3", "rm-2"]);
  assert.equal(
    serializeBallotSubmission(afterRemove),
    JSON.stringify([
      { roomMovieId: "rm-3", rank: 1 },
      { roomMovieId: "rm-2", rank: 2 },
    ]),
  );
});

test("Letterboxd URLs come from slug or url and are omitted when both are missing", () => {
  assert.equal(letterboxdFilmUrl("heat"), "https://letterboxd.com/film/heat/");
  assert.equal(
    letterboxdFilmUrl(null, "https://letterboxd.com/film/drive/"),
    "https://letterboxd.com/film/drive/",
  );
  assert.equal(letterboxdFilmUrl(null, "http://letterboxd.com/film/drive/"), null);
  assert.equal(letterboxdFilmUrl(null), null);
  assert.equal(letterboxdFilmUrl("   "), null);
});

test("nominator copy names the current user as You", () => {
  assert.equal(formatNominatorList([alice, bob]), "Alice and You");
  assert.equal(minimumRankingCopy(3, 8), "Rank at least 3 of 8 movies");
});

test("voting context mapper groups movies and fills required ranking count", () => {
  const context = toVotingClientContext({
    id: "room-1",
    code: "ABC234",
    name: "Friday night",
    phase: "VOTING",
    requireParticipantCoverage: true,
    ownerId: "user-alice",
    currentParticipant: { id: "p-bob", votingSubmittedAt: null },
    participantCount: 3,
    movies: [
      movie("rm-1", "Heat", [alice], 101, {
        letterboxdSlug: "heat",
        letterboxdRating: 4.2,
        overview: "A crew of thieves hits the banks of L.A.",
      }),
      movie("rm-1", "Heat", [bob], 101),
      movie("rm-2", "Drive", [cara], 202),
    ],
  });

  assert.equal(context.movies.length, 2);
  assert.equal(context.requiredRankingCount, 2);
  assert.equal(context.alreadySubmitted, false);
  assert.equal(context.requireParticipantCoverage, true);
  assert.equal(context.movies[0]?.nominators.length, 2);
  assert.equal(context.movies[0]?.letterboxdSlug, "heat");
  assert.equal(context.movies[0]?.letterboxdUrl, "https://letterboxd.com/film/heat/");
  assert.equal(context.movies[0]?.letterboxdRating, 4.2);
  assert.equal(context.movies[0]?.overview, "A crew of thieves hits the banks of L.A.");
  assert.equal(context.movies[1]?.letterboxdUrl, null);
  assert.equal(context.movies[1]?.overview, null);
  assert.deepEqual(
    context.participants.map((participant) => participant.participantId),
    ["p-alice", "p-bob", "p-cara"],
  );
});

test("nested room fields and a prior ballot lock the voting form", () => {
  const context = toVotingClientContext({
    room: {
      id: "room-1",
      code: "ABC234",
      name: "Friday night",
      phase: "VOTING",
      requireParticipantCoverage: false,
      ownerId: "user-alice",
    },
    currentParticipant: {
      id: "p-bob",
      votingSubmittedAt: new Date("2026-08-20T18:00:00.000Z"),
    },
    participants: [alice, bob],
    participantCount: 2,
    movies: [movie("rm-1", "Heat", [alice, bob], 101)],
    requiredRankingCount: 1,
    alreadySubmitted: true,
  });

  assert.equal(context.code, "ABC234");
  assert.equal(context.requireParticipantCoverage, false);
  assert.equal(context.alreadySubmitted, true);
  assert.equal(context.requiredRankingCount, 1);
  assert.equal(context.currentParticipant.votingSubmittedAt, "2026-08-20T18:00:00.000Z");
  assert.deepEqual(
    context.participants.map((participant) => participant.participantId),
    ["p-alice", "p-bob"],
  );
});

test("coverage lists every room participant, not only nominators", () => {
  const dana = { participantId: "p-dana", displayName: "Dana", isCurrentUser: false };
  const movies = [movie("rm-shared", "Heat", [alice, bob])];
  const coverage = participantCoverageFromRankedIds(
    movies,
    ["rm-shared"],
    [alice, bob, dana],
  );

  assert.deepEqual(
    Object.fromEntries(coverage.map((participant) => [participant.participantId, participant.covered])),
    {
      "p-alice": true,
      "p-bob": true,
      "p-dana": false,
    },
  );
  assert.equal(
    isParticipantCoverageSatisfied(
      ["rm-shared"],
      toBallotMovieCoverage(movies),
      [alice.participantId, bob.participantId, dana.participantId],
    ),
    false,
  );
});
