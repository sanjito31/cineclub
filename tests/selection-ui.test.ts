import assert from "node:assert/strict";
import test from "node:test";
import {
  applyRatingLookupToMovie,
  applyWatchedIndexToMovie,
  createSelectionSlots,
  duplicateSelectionIds,
  overlapToSelectionMovie,
  parseMovieSearchResponse,
  serializeSelectionSubmission,
  tmdbMovieUrl,
  toSelectionMovie,
  type SelectionMovie,
} from "../app/rooms/[code]/selection-contracts";
import {
  addWatchedPageToIndex,
  applyLetterboxdMovieLookupToSuggestion,
  applyTmdbDetailsToOverlapSuggestion,
  emptyWatchedIndex,
  limitOverlapSuggestions,
  mergeOverlapSuggestion,
  watchboxdMovieNeedsResolution,
  watchedMembersForMovie,
  watchedWarningCopy,
} from "../lib/domain/watchboxd-selection";

function movie(tmdbId: number, title: string): SelectionMovie {
  return {
    tmdbId,
    title,
    releaseYear: 2026,
    overview: null,
    posterPath: null,
    posterUrl: null,
    tmdbRating: null,
    letterboxdRating: null,
    letterboxdRatingJobId: null,
    letterboxdUrl: null,
    letterboxdSlug: null,
    watchedByCurrentUser: false,
    watchedByMembers: [],
    overlappingParticipants: [],
    alreadyNominatedBy: [],
    suggestionReason: null,
  };
}

test("search results point at the matching TMDB movie page", () => {
  assert.equal(tmdbMovieUrl(550), "https://www.themoviedb.org/movie/550");
});

test("selection slots match the room requirement exactly", () => {
  assert.deepEqual(createSelectionSlots(3), [
    { slotIndex: 1, movie: null },
    { slotIndex: 2, movie: null },
    { slotIndex: 3, movie: null },
  ]);
});

test("same-user duplicate selections are identified for submission feedback", () => {
  const first = movie(101, "First");
  const duplicateIds = duplicateSelectionIds([
    { slotIndex: 1, movie: first },
    { slotIndex: 2, movie: movie(202, "Second") },
    { slotIndex: 3, movie: first },
  ]);

  assert.deepEqual([...duplicateIds], [101]);
});

test("atomic submission payload contains the backend movie snapshots", () => {
  assert.equal(
    serializeSelectionSubmission([
      { slotIndex: 1, movie: movie(101, "First") },
      { slotIndex: 2, movie: movie(202, "Second") },
    ]),
    JSON.stringify([
      {
        slotIndex: 1,
        tmdbId: 101,
        title: "First",
        releaseYear: 2026,
        overview: null,
        posterPath: null,
      },
      {
        slotIndex: 2,
        tmdbId: 202,
        title: "Second",
        releaseYear: 2026,
        overview: null,
        posterPath: null,
      },
    ]),
  );
});

test("TMDB search snapshots map onto the selection movie contract", () => {
  assert.deepEqual(
    toSelectionMovie({
      tmdbId: 550,
      title: "Fight Club",
      releaseYear: 1999,
      overview: "An insomniac meets a soap maker.",
      posterPath: "/poster.jpg",
      tmdbRating: 8.4,
      letterboxdRating: 4.2,
      alreadyNominatedBy: ["Sam"],
    }),
    {
      tmdbId: 550,
      title: "Fight Club",
      releaseYear: 1999,
      overview: "An insomniac meets a soap maker.",
      posterPath: "/poster.jpg",
      posterUrl: null,
      tmdbRating: 8.4,
      letterboxdRating: 4.2,
      letterboxdRatingJobId: null,
      letterboxdUrl: null,
      letterboxdSlug: null,
      watchedByCurrentUser: false,
      watchedByMembers: [],
      overlappingParticipants: [],
      alreadyNominatedBy: ["Sam"],
      suggestionReason: null,
    },
  );
});

test("search responses keep server-safe warning and rating metadata", () => {
  const response = parseMovieSearchResponse({
    results: [{
      tmdbId: 101,
      title: " First ",
      releaseYear: 2026,
      overview: "A movie.",
      posterPath: "/poster.jpg",
      tmdbRating: 8.4,
      letterboxdRating: 4.2,
      watchedByCurrentUser: true,
      overlappingParticipants: ["Jo"],
      alreadyNominatedBy: ["Sam"],
      suggestionReason: "Shared by two watchlists",
    }],
  });

  assert.deepEqual(response, {
    results: [{
      tmdbId: 101,
      title: "First",
      releaseYear: 2026,
      overview: "A movie.",
      posterPath: "/poster.jpg",
      posterUrl: null,
      tmdbRating: 8.4,
      letterboxdRating: 4.2,
      letterboxdRatingJobId: null,
      letterboxdUrl: null,
      letterboxdSlug: null,
      watchedByCurrentUser: true,
      watchedByMembers: [],
      overlappingParticipants: ["Jo"],
      alreadyNominatedBy: ["Sam"],
      suggestionReason: "Shared by two watchlists",
    }],
    suggestions: [],
    page: 1,
    totalPages: 1,
    totalResults: 1,
  });
});

test("watched members are matched by TMDB id including the current user", () => {
  const index = emptyWatchedIndex();
  addWatchedPageToIndex(
    index,
    {
      user: { username: "alice", displayName: "Alice", avatarUrl: "https://a.ltrbxd.com/avatar.jpg" },
      items: [
        { tmdbId: 550, letterboxdSlug: "fight-club", title: "Fight Club", year: 1999 },
        { tmdbId: null, letterboxdSlug: "unresolved", title: "Unresolved", year: 2026 },
      ],
      pagination: { page: 1, pageSize: 50, total: 2, totalPages: 1 },
    },
    {
      userId: "user-1",
      displayName: "Alice",
      avatarUrl: "https://a.ltrbxd.com/avatar.jpg",
      isCurrentUser: true,
    },
  );
  addWatchedPageToIndex(
    index,
    {
      user: { username: "bob", displayName: "Bob", avatarUrl: null },
      items: [{ tmdbId: 550, letterboxdSlug: "fight-club", title: "Fight Club", year: 1999 }],
      pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
    },
    {
      userId: "user-2",
      displayName: "Bob",
      avatarUrl: null,
      isCurrentUser: false,
    },
  );

  const members = watchedMembersForMovie(index, { tmdbId: 550, letterboxdSlug: "fight-club" });
  assert.equal(members.length, 2);
  assert.equal(members[0]?.isCurrentUser, true);
  assert.equal(members[1]?.displayName, "Bob");
  assert.equal(watchedWarningCopy(members), "1 other has seen this already…");
  assert.equal(
    watchedWarningCopy(members.filter((member) => member.isCurrentUser)),
    "You’ve already watched this.",
  );
  assert.equal(
    watchedWarningCopy([
      { userId: "user-2", displayName: "Bob", avatarUrl: null, isCurrentUser: false },
      { userId: "user-3", displayName: "Cara", avatarUrl: null, isCurrentUser: false },
    ]),
    "2 others have seen this already…",
  );

  const enriched = applyWatchedIndexToMovie(movie(550, "Fight Club"), index);
  assert.equal(enriched.watchedByCurrentUser, true);
  assert.equal(enriched.watchedByMembers.length, 2);
  assert.equal(watchedMembersForMovie(index, { tmdbId: 101 }).length, 0);
});

test("watched warnings match unresolved Watchboxd titles by title and year", () => {
  const index = emptyWatchedIndex();
  addWatchedPageToIndex(
    index,
    {
      user: { username: "bob", displayName: "Bob", avatarUrl: null },
      items: [{
        tmdbId: null,
        letterboxdSlug: "fight-club",
        title: "Fight Club",
        year: 1999,
      }],
      pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
    },
    {
      userId: "user-2",
      displayName: "Bob",
      avatarUrl: null,
      isCurrentUser: false,
    },
  );

  const selected = applyWatchedIndexToMovie({
    ...movie(550, "Fight Club"),
    releaseYear: 1999,
    letterboxdSlug: null,
  }, index);

  assert.equal(selected.watchedByMembers.length, 1);
  assert.equal(selected.watchedByMembers[0]?.displayName, "Bob");
  assert.equal(selected.watchedByCurrentUser, false);
  assert.equal(watchedWarningCopy(selected.watchedByMembers), "1 other has seen this already…");
  assert.equal(
    watchedMembersForMovie(index, { tmdbId: 550, title: "Fight Club", releaseYear: 2000 }).length,
    0,
  );
});

test("overlap suggestions keep the top 10 Letterboxd-linked films", () => {
  const films = Array.from({ length: 12 }, (_, index) => ({
    tmdbId: index + 1,
    title: `Film ${index + 1}`,
    year: 2000 + index,
    letterboxdRating: 4,
    letterboxdSlug: `film-${index + 1}`,
    letterboxdUrl: index === 1 ? null : `https://letterboxd.com/film/film-${index + 1}/`,
    posterUrl: `https://image.tmdb.org/t/p/w500/${index + 1}.jpg`,
    resolutionStatus: "resolved",
    overlapCount: 2,
  }));

  const suggestions = limitOverlapSuggestions(films);
  assert.equal(suggestions.length, 10);
  assert.deepEqual(
    suggestions.map((film) => film.title),
    ["Film 1", "Film 3", "Film 4", "Film 5", "Film 6", "Film 7", "Film 8", "Film 9", "Film 10", "Film 11"],
  );
  assert.equal(suggestions[0]?.letterboxdUrl, "https://letterboxd.com/film/film-1/");
  assert.equal(suggestions[0]?.overview, null);
  assert.equal(suggestions[0]?.letterboxdMovieJobId, null);
});

test("pending overlap films stay visible and hydrate TMDB metadata after slug lookup", () => {
  const pendingFilm = {
    tmdbId: null,
    title: "Pending",
    year: 2026,
    letterboxdRating: null,
    letterboxdSlug: "pending-film",
    letterboxdUrl: "https://letterboxd.com/film/pending-film/",
    posterUrl: "https://a.ltrbxd.com/poster.jpg",
    resolutionStatus: null,
    overlapCount: 2,
  };
  const failedFilm = {
    ...pendingFilm,
    title: "Failed",
    letterboxdSlug: "failed-film",
    letterboxdUrl: "https://letterboxd.com/film/failed-film/",
    resolutionStatus: "failed",
  };

  const suggestions = limitOverlapSuggestions([failedFilm, pendingFilm]);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0]?.title, "Pending");
  assert.equal(suggestions[0]?.tmdbId, null);
  assert.equal(overlapToSelectionMovie(suggestions[0]!), null);
  assert.equal(watchboxdMovieNeedsResolution(suggestions[0]!), true);

  const pendingLookup = applyLetterboxdMovieLookupToSuggestion(suggestions[0]!, {
    letterboxdSlug: "pending-film",
    tmdbId: null,
    title: null,
    year: null,
    letterboxdRating: null,
    letterboxdUrl: null,
    posterUrl: null,
    letterboxdMovieJobId: "job-pending",
    overview: null,
    tmdbRating: null,
    posterPath: null,
  });
  assert.equal(pendingLookup.letterboxdMovieJobId, "job-pending");
  assert.equal(pendingLookup.tmdbId, null);

  const resolved = applyLetterboxdMovieLookupToSuggestion(pendingLookup, {
    letterboxdSlug: "pending-film",
    tmdbId: 550,
    title: "Pending",
    year: 2026,
    letterboxdRating: 3.8,
    letterboxdUrl: "https://letterboxd.com/film/pending-film/",
    posterUrl: "https://a.ltrbxd.com/poster.jpg",
    letterboxdMovieJobId: null,
    overview: "A TMDB description.",
    tmdbRating: 7.4,
    posterPath: "/poster.jpg",
  });
  assert.equal(resolved.tmdbId, 550);
  assert.equal(resolved.overview, "A TMDB description.");
  assert.equal(resolved.tmdbRating, 7.4);
  assert.equal(resolved.letterboxdMovieJobId, null);

  const selectable = overlapToSelectionMovie(resolved);
  assert.equal(selectable?.tmdbId, 550);
  assert.equal(selectable?.overview, "A TMDB description.");
  assert.equal(selectable?.tmdbRating, 7.4);
  assert.equal(selectable?.posterPath, "/poster.jpg");
  assert.equal(selectable?.posterUrl, "https://a.ltrbxd.com/poster.jpg");

  const merged = mergeOverlapSuggestion(
    suggestions[0]!,
    applyTmdbDetailsToOverlapSuggestion(resolved, {
      overview: "Kept from the earlier hydrate.",
      voteAverage: 8.1,
      posterPath: "/kept.jpg",
    }),
  );
  assert.equal(merged.tmdbId, 550);
  assert.equal(merged.overview, "Kept from the earlier hydrate.");
});

test("pending Letterboxd ratings silently fill once Watchboxd is ready", () => {
  const pending = {
    ...movie(550, "Fight Club"),
    tmdbRating: 8.4,
    letterboxdRatingJobId: "job-550",
  };
  const stillPending = applyRatingLookupToMovie(pending, {
    letterboxdRating: null,
    letterboxdRatingJobId: "job-550",
    letterboxdUrl: null,
    letterboxdSlug: null,
    posterUrl: null,
  });
  assert.equal(stillPending.letterboxdRating, null);
  assert.equal(stillPending.letterboxdRatingJobId, "job-550");
  assert.equal(stillPending.tmdbRating, 8.4);

  const ready = applyRatingLookupToMovie(stillPending, {
    letterboxdRating: 4.27,
    letterboxdRatingJobId: null,
    letterboxdUrl: "https://letterboxd.com/film/fight-club/",
    letterboxdSlug: "fight-club",
    posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
  });
  assert.equal(ready.letterboxdRating, 4.27);
  assert.equal(ready.letterboxdRatingJobId, null);
  assert.equal(ready.letterboxdUrl, "https://letterboxd.com/film/fight-club/");
  assert.equal(ready.tmdbRating, 8.4);
});

