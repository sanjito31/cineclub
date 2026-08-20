import assert from "node:assert/strict";
import test from "node:test";
import {
  parseAsyncResourceResponse,
  pollAsyncResource,
} from "../lib/integrations/async-resource";
import {
  createTmdbClient,
  paginateTmdbSearchPage,
  tmdbPageForSearchPage,
  TmdbServiceError,
} from "../lib/tmdb/core";
import {
  WatchboxdClient,
  WatchboxdInputError,
} from "../lib/watchboxd/core";
import {
  decodeWatchboxdJob,
  decodeWatchboxdMovie,
  decodeWatchboxdOverlapPage,
  decodeWatchboxdWatchedPage,
} from "../lib/watchboxd/decode";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
}

test("TMDB search validates and normalizes selection-safe movie results", async () => {
  let requestedUrl: URL | null = null;
  let requestedAuthorization: string | null = null;
  const fetchImpl: typeof fetch = async (input, init) => {
    requestedUrl = new URL(String(input));
    requestedAuthorization = new Headers(init?.headers).get("authorization");
    return jsonResponse({
      page: 1,
      total_pages: 3,
      total_results: 42,
      results: [
        {
          id: 550,
          title: " Fight Club ",
          original_title: "Fight Club",
          overview: "An insomniac meets a soap maker.",
          release_date: "1999-10-15",
          poster_path: "/poster.jpg",
          backdrop_path: "not-a-path",
          vote_average: 8.4,
        },
        { id: "bad", title: "Malformed" },
      ],
    });
  };

  const result = await createTmdbClient({
    fetchImpl,
    readAccessToken: "server-secret",
  }).searchMovies("  fight   club  ");

  const searchUrl = requestedUrl as URL | null;
  assert.ok(searchUrl);
  assert.equal(searchUrl.pathname, "/3/search/movie");
  assert.equal(searchUrl.searchParams.get("query"), "fight club");
  assert.equal(searchUrl.searchParams.has("api_key"), false);
  assert.equal(requestedAuthorization, "Bearer server-secret");
  assert.deepEqual(result.results, [
    {
      tmdbId: 550,
      title: "Fight Club",
      originalTitle: "Fight Club",
      overview: "An insomniac meets a soap maker.",
      releaseDate: "1999-10-15",
      releaseYear: 1999,
      posterPath: "/poster.jpg",
      backdropPath: null,
      voteAverage: 8.4,
    },
  ]);
});

test("TMDB search pages are sliced into five-result Cineclub pages", () => {
  const results = Array.from({ length: 20 }, (_, index) => ({
    tmdbId: index + 1,
    title: `Movie ${index + 1}`,
    originalTitle: null,
    overview: null,
    releaseDate: null,
    releaseYear: null,
    posterPath: null,
    backdropPath: null,
    voteAverage: null,
  }));

  assert.equal(tmdbPageForSearchPage(1), 1);
  assert.equal(tmdbPageForSearchPage(4), 1);
  assert.equal(tmdbPageForSearchPage(5), 2);

  const firstPage = paginateTmdbSearchPage(
    { page: 1, totalPages: 3, totalResults: 42, results },
    2,
  );
  assert.deepEqual(
    firstPage.results.map((movie) => movie.tmdbId),
    [6, 7, 8, 9, 10],
  );
  assert.equal(firstPage.page, 2);
  assert.equal(firstPage.totalPages, 9);
  assert.equal(firstPage.totalResults, 42);
});

test("TMDB search rejects invalid input before contacting the API", async () => {
  let contacted = false;
  const client = createTmdbClient({
    apiKey: "server-secret",
    fetchImpl: async () => {
      contacted = true;
      return jsonResponse({});
    },
  });

  await assert.rejects(
    () => client.searchMovies(" "),
    (error: unknown) =>
      error instanceof TmdbServiceError && error.code === "invalid_query",
  );
  assert.equal(contacted, false);
});

test("TMDB search maps timeouts and malformed envelopes", async (t) => {
  await t.test("timeout", async () => {
    const fetchImpl: typeof fetch = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    const client = createTmdbClient({
      fetchImpl,
      readAccessToken: "server-secret",
      timeoutMs: 5,
    });

    await assert.rejects(
      () => client.searchMovies("Alien"),
      (error: unknown) =>
        error instanceof TmdbServiceError && error.code === "timeout",
    );
  });

  await t.test("malformed response", async () => {
    const client = createTmdbClient({
      fetchImpl: async () => jsonResponse({ data: [] }),
      readAccessToken: "server-secret",
    });

    await assert.rejects(
      () => client.searchMovies("Alien"),
      (error: unknown) =>
        error instanceof TmdbServiceError && error.code === "malformed_response",
    );
  });
});

test("async response handling covers ready, pending, not found, and unavailable", async (t) => {
  const decode = (value: unknown) => {
    if (!value || typeof value !== "object") return null;
    const data = (value as { data?: unknown }).data;
    return typeof data === "string" ? data : null;
  };

  await t.test("ready", async () => {
    assert.deepEqual(
      await parseAsyncResourceResponse(jsonResponse({ data: "ready" }), decode),
      { status: "ready", data: "ready" },
    );
  });

  await t.test("pending with job location", async () => {
    assert.deepEqual(
      await parseAsyncResourceResponse(
        jsonResponse(
          { status: "pending" },
          {
            status: 202,
            headers: {
              Location: "/api/v1/jobs/job-42",
              "Retry-After": "3",
            },
          },
        ),
        decode,
      ),
      { status: "pending", retryAfter: 3, jobId: "job-42" },
    );
  });

  await t.test("not found", async () => {
    assert.deepEqual(
      await parseAsyncResourceResponse(
        jsonResponse({ error: "missing" }, { status: 404 }),
        decode,
      ),
      { status: "not_found" },
    );
  });

  await t.test("unavailable and malformed", async () => {
    assert.deepEqual(
      await parseAsyncResourceResponse(
        jsonResponse({ error: "down" }, { status: 503 }),
        decode,
      ),
      { status: "unavailable", reason: "http_error", statusCode: 503 },
    );
    assert.deepEqual(
      await parseAsyncResourceResponse(jsonResponse({ wrong: true }), decode),
      { status: "unavailable", reason: "malformed_response" },
    );
  });

  await t.test("200 with data null and meta jobs is pending", async () => {
    assert.deepEqual(
      await parseAsyncResourceResponse(
        jsonResponse({
          data: null,
          meta: {
            cache: "miss",
            jobs: [{
              id: "job-550",
              type: "movie",
              resourceKey: "movie:tmdb_550",
              status: "queued",
              attempts: 0,
              statusUrl: "/api/v1/jobs/job-550",
            }],
          },
        }),
        decode,
      ),
      { status: "pending", retryAfter: 2, jobId: "job-550" },
    );
  });

  await t.test("ready user lookup is not treated as pending", async () => {
    const profileDecode = (value: unknown) => {
      if (!value || typeof value !== "object") return null;
      const data = (value as { data?: unknown }).data;
      if (!data || typeof data !== "object") return null;
      const username = (data as { username?: unknown }).username;
      return typeof username === "string" ? { username } : null;
    };

    assert.deepEqual(
      await parseAsyncResourceResponse(
        jsonResponse({
          data: { username: "alice", letterboxdUrl: "https://letterboxd.com/alice/" },
          meta: { cache: "hit" },
        }),
        profileDecode,
      ),
      { status: "ready", data: { username: "alice" } },
    );
  });
});

test("polling handles pending success, failed jobs, bounds, and cancellation", async (t) => {
  const noDelay = async () => {};

  await t.test("pending to success", async () => {
    const result = await pollAsyncResource(
      async ({ attempt }) =>
        attempt === 1
          ? { status: "pending", retryAfter: 1, jobId: "job-1" }
          : { status: "ready", data: "done" },
      { delay: noDelay },
    );
    assert.deepEqual(result, { status: "ready", data: "done" });
  });

  await t.test("failed job", async () => {
    const result = await pollAsyncResource(
      async ({ attempt }) =>
        attempt === 1
          ? { status: "pending", retryAfter: 1, jobId: "job-2" }
          : { status: "unavailable", reason: "http_error", statusCode: 500 },
      { delay: noDelay },
    );
    assert.deepEqual(result, {
      status: "unavailable",
      reason: "http_error",
      statusCode: 500,
    });
  });

  await t.test("bounded attempts preserve pending job ID", async () => {
    const result = await pollAsyncResource(
      async () => ({ status: "pending", retryAfter: 1, jobId: "job-3" }),
      { delay: noDelay, maxAttempts: 2 },
    );
    assert.deepEqual(result, {
      status: "timed_out",
      attempts: 2,
      jobId: "job-3",
    });
  });

  await t.test("cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await pollAsyncResource(
      async () => ({ status: "pending", retryAfter: 1, jobId: "job-4" }),
      { signal: controller.signal },
    );
    assert.deepEqual(result, {
      status: "cancelled",
      attempts: 0,
      jobId: null,
    });
  });
});

test("Watchboxd client uses documented collection, overlap, and job routes", async () => {
  const requests: URL[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    requests.push(new URL(String(input)));
    return jsonResponse({ data: { items: ["movie"] } });
  };
  const decodeItems = (value: unknown) => {
    if (!value || typeof value !== "object") return null;
    const data = (value as { data?: unknown }).data;
    if (!data || typeof data !== "object") return null;
    const items = (data as { items?: unknown }).items;
    return Array.isArray(items) && items.every((item) => typeof item === "string")
      ? { items }
      : null;
  };
  const client = new WatchboxdClient({
    baseUrl: "https://watchboxd.example",
    fetchImpl,
  });

  await client.watchlist("alice", decodeItems, { query: { cursor: "next" } });
  await client.watchedHistory("alice", decodeItems);
  await client.overlap(["alice", "bob", "alice"], decodeItems);
  await client.job("job-123", decodeItems);
  await client.movie(550, decodeItems);

  assert.equal(requests[0]?.pathname, "/api/v1/users/alice/watchlist");
  assert.equal(requests[0]?.searchParams.get("cursor"), "next");
  assert.equal(requests[1]?.pathname, "/api/v1/users/alice/watched");
  assert.equal(requests[2]?.pathname, "/api/v1/overlap");
  assert.equal(requests[2]?.searchParams.get("users"), "alice,bob");
  assert.equal(requests[3]?.pathname, "/api/v1/jobs/job-123");
  assert.equal(requests[4]?.pathname, "/api/v1/movies/550");
});

test("Watchboxd overlap validates unique username bounds", () => {
  const client = new WatchboxdClient({
    fetchImpl: async () => jsonResponse({}),
  });

  assert.throws(
    () => client.overlap(["alice", "alice"], () => null),
    WatchboxdInputError,
  );
  assert.throws(
    () => client.movie(0, () => null),
    WatchboxdInputError,
  );
});

test("Watchboxd movie, watched, overlap, and job decoders accept live envelopes", () => {
  assert.deepEqual(
    decodeWatchboxdMovie({
      data: {
        tmdbId: 550,
        title: "Fight Club",
        year: 1999,
        letterboxdRating: 4.27,
        letterboxdSlug: "fight-club",
        letterboxdUrl: "https://letterboxd.com/film/fight-club/",
        posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
        resolutionStatus: "resolved",
      },
    }),
    {
      tmdbId: 550,
      title: "Fight Club",
      year: 1999,
      letterboxdRating: 4.27,
      letterboxdSlug: "fight-club",
      letterboxdUrl: "https://letterboxd.com/film/fight-club/",
      posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
      resolutionStatus: "resolved",
    },
  );

  const watched = decodeWatchboxdWatchedPage({
    data: {
      user: {
        username: "alice",
        displayName: "Alice",
        avatarUrl: "https://a.ltrbxd.com/resized/avatar/alice.jpg",
      },
      items: [
        {
          sourceTitle: "Fight Club",
          sourceSlug: "fight-club",
          sourceYear: 1999,
          movie: {
            tmdbId: 550,
            title: "Fight Club",
            year: 1999,
            letterboxdSlug: "fight-club",
            letterboxdUrl: "https://letterboxd.com/film/fight-club/",
          },
        },
        {
          sourceTitle: "Pending",
          sourceSlug: "pending-film",
          sourceYear: 2026,
          movie: {
            tmdbId: null,
            title: "Pending",
            year: 2026,
            letterboxdSlug: "pending-film",
            letterboxdUrl: "https://letterboxd.com/film/pending-film/",
          },
        },
      ],
      pagination: { page: 1, pageSize: 50, total: 2, totalPages: 1 },
    },
  });
  assert.equal(watched?.items.length, 2);
  assert.equal(watched?.items[0]?.tmdbId, 550);
  assert.equal(watched?.items[0]?.year, 1999);
  assert.equal(watched?.items[1]?.letterboxdSlug, "pending-film");
  assert.equal(watched?.items[1]?.year, 2026);

  const overlap = decodeWatchboxdOverlapPage({
    data: {
      users: [{ username: "alice", displayName: "Alice" }],
      films: [{
        title: "Inception",
        year: 2010,
        tmdbId: 27205,
        letterboxdRating: 4.24,
        letterboxdSlug: "inception",
        letterboxdUrl: "https://letterboxd.com/film/inception/",
        posterUrl: "https://image.tmdb.org/t/p/w500/inception.jpg",
        overlapCount: 2,
      }],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    },
  });
  assert.equal(overlap?.films[0]?.tmdbId, 27205);
  assert.equal(overlap?.films[0]?.letterboxdRating, 4.24);

  assert.deepEqual(
    decodeWatchboxdJob({
      data: {
        id: "job-1",
        type: "movie",
        status: "succeeded",
        error: null,
      },
    }),
    {
      id: "job-1",
      type: "movie",
      status: "succeeded",
      error: null,
    },
  );
});

