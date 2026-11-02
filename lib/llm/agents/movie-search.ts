import "server-only";

import { ChatAgent, OpenAIProvider, type Tool } from "@/lib/llm";
import { lookupWatchedByUsernames } from "@/lib/data/watchboxd-room";
import {
  discoverTmdbMovies,
  searchTmdbKeywords,
  searchTmdbMovies,
  searchTmdbPeople,
  TMDB_MOVIE_GENRES,
  type TmdbDiscoverSort,
  type TmdbMovieSearchPage,
} from "@/lib/tmdb/client";

const MOVIE_SEARCH_SYSTEM_PROMPT = `You help members of a movie club find films.
Always look movies up with your tools instead of answering from memory.
- Use discover_movies to browse by any combination of genre, era, runtime, language, rating, cast, crew (directors, writers), or keywords (themes like "heist" or "time travel"). E.g. "Wes Anderson films with Bill Murray" or "best 80s horror".
- Use search_movies when the user names or hints at a specific title.
- If discover_movies reports matched people or keywords that look wrong, retry with a more specific name.
- When the user wants movies they (or their group) haven't seen, pass their Letterboxd usernames as excludeWatchedBy. Ask for the usernames if you don't have them. If a filtered page comes back short, fetch the next page.
Reply briefly. For each candidate give the title, release year, and TMDB id.
If nothing matches, say so and ask for more detail.`;

type GenreName = keyof typeof TMDB_MOVIE_GENRES;

const SORT_OPTIONS: Record<string, TmdbDiscoverSort> = {
  popularity: "popularity.desc",
  rating: "vote_average.desc",
  newest: "primary_release_date.desc",
};

// Only what the model needs, to keep tool results small
function summarizeResults(result: TmdbMovieSearchPage) {
  return {
    page: result.page,
    totalPages: result.totalPages,
    results: result.results.map((movie) => ({
      tmdbId: movie.tmdbId,
      title: movie.title,
      releaseYear: movie.releaseYear,
      overview: movie.overview,
      voteAverage: movie.voteAverage,
    })),
  };
}

const EXCLUDE_WATCHED_BY_SCHEMA = {
  type: "array",
  items: { type: "string" },
  maxItems: 10,
  description:
    "Letterboxd usernames (1-10). Drops movies any of them has watched. Filtering happens after TMDB returns the page, so fewer than 20 results may come back.",
};

// Drops movies any of the users has logged on Letterboxd, and reports what was dropped
async function removeWatched(
  summary: ReturnType<typeof summarizeResults>,
  usernames: string[],
) {
  if (usernames.length === 0) return summary;

  const { watchedBy, uncheckedTmdbIds } = await lookupWatchedByUsernames(
    usernames,
    summary.results.map((movie) => movie.tmdbId),
  );
  const unwatched = summary.results.filter((movie) => !watchedBy.has(movie.tmdbId));
  const removedAsWatched = summary.results
    .filter((movie) => watchedBy.has(movie.tmdbId))
    .map((movie) => ({ title: movie.title, watchedBy: watchedBy.get(movie.tmdbId) }));

  return {
    ...summary,
    results: unwatched,
    removedAsWatched,
    ...(uncheckedTmdbIds.length > 0 && {
      watchStatusNote: `${uncheckedTmdbIds.length} results were kept unchecked because Letterboxd history is still syncing or unavailable (tmdbIds: ${uncheckedTmdbIds.join(", ")}). Retrying in a few seconds may filter them.`,
    }),
  };
}

function optionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function toGenreIds(names: string[]) {
  return names.map((name) => {
    if (!Object.hasOwn(TMDB_MOVIE_GENRES, name)) throw new Error(`Unknown genre: ${name}`);
    return TMDB_MOVIE_GENRES[name as GenreName];
  });
}

// TMDB people search is ordered by popularity, so the top hit is the best guess
async function resolvePerson(name: string) {
  const [match] = await searchTmdbPeople(name);
  if (!match) throw new Error(`No TMDB person found for "${name}"`);
  return match;
}

// Prefer an exact keyword match; otherwise take TMDB's first suggestion
async function resolveKeyword(term: string) {
  const keywords = await searchTmdbKeywords(term);
  const wanted = term.trim().toLowerCase();
  const match = keywords.find((k) => k.name.toLowerCase() === wanted) ?? keywords[0];
  if (!match) throw new Error(`No TMDB keyword found for "${term}"`);
  return match;
}

export const searchMoviesTool: Tool = {
  definition: {
    name: "search_movies",
    description: "Search TMDB for movies by title. Returns up to 20 results per page.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Movie title to search for" },
        page: { type: "integer", minimum: 1, description: "Results page, defaults to 1" },
        excludeWatchedBy: EXCLUDE_WATCHED_BY_SCHEMA,
      },
      required: ["query"],
    },
  },
  async run(input) {
    const result = await searchTmdbMovies(String(input.query), {
      page: optionalNumber(input.page),
    });
    return removeWatched(summarizeResults(result), stringList(input.excludeWatchedBy));
  },
};

export const discoverMoviesTool: Tool = {
  definition: {
    name: "discover_movies",
    description:
      "Browse TMDB movies by metadata and people. All filters combine with AND. Returns up to 20 results per page, plus the people and keywords each name was matched to.",
    inputSchema: {
      type: "object",
      properties: {
        genres: {
          type: "array",
          items: { type: "string", enum: Object.keys(TMDB_MOVIE_GENRES) },
          description: "Movies must have all of these genres",
        },
        excludeGenres: {
          type: "array",
          items: { type: "string", enum: Object.keys(TMDB_MOVIE_GENRES) },
          description: "Movies must have none of these genres",
        },
        cast: {
          type: "array",
          items: { type: "string" },
          description: "Actor names; every one must appear in the cast",
        },
        crew: {
          type: "array",
          items: { type: "string" },
          description:
            "Crew names (directors, writers, composers, etc.); every one must have a crew credit. TMDB doesn't distinguish crew roles here.",
        },
        keywords: {
          type: "array",
          items: { type: "string" },
          description: 'Themes or subjects, e.g. "heist", "time travel"; every one must match',
        },
        yearFrom: { type: "integer", description: "Earliest release year, inclusive" },
        yearTo: { type: "integer", description: "Latest release year, inclusive" },
        minRuntime: {
          type: "integer",
          minimum: 0,
          description: "Minimum runtime in minutes. Defaults to 60 to leave out shorts; pass 0 to include them.",
        },
        maxRuntime: { type: "integer", minimum: 0, description: "Maximum runtime in minutes" },
        originalLanguage: {
          type: "string",
          description: 'Two-letter ISO 639-1 code of the original language, e.g. "ko", "fr"',
        },
        minRating: { type: "number", minimum: 0, maximum: 10, description: "Minimum TMDB vote average" },
        minVotes: {
          type: "integer",
          minimum: 0,
          description:
            "Minimum number of TMDB votes. Defaults to 200 so rating sorts aren't topped by obscure films; lower it for niche people or keywords.",
        },
        sortBy: {
          type: "string",
          enum: Object.keys(SORT_OPTIONS),
          description: "Defaults to popularity",
        },
        page: { type: "integer", minimum: 1, description: "Results page, defaults to 1" },
        excludeWatchedBy: EXCLUDE_WATCHED_BY_SCHEMA,
      },
    },
  },
  async run(input) {
    const genreIds = toGenreIds(stringList(input.genres));
    const excludeGenreIds = toGenreIds(stringList(input.excludeGenres));
    const sortBy =
      typeof input.sortBy === "string" && Object.hasOwn(SORT_OPTIONS, input.sortBy)
        ? SORT_OPTIONS[input.sortBy]
        : undefined;
    // Skip the shorts-excluding default when the caller is asking for short films
    const runtimeMax = optionalNumber(input.maxRuntime);
    const defaultRuntimeMin = runtimeMax !== undefined && runtimeMax < 60 ? undefined : 60;

    const [cast, crew, keywords] = await Promise.all([
      Promise.all(stringList(input.cast).map(resolvePerson)),
      Promise.all(stringList(input.crew).map(resolvePerson)),
      Promise.all(stringList(input.keywords).map(resolveKeyword)),
    ]);

    const result = await discoverTmdbMovies(
      {
        genreIds,
        excludeGenreIds,
        castIds: cast.map((person) => person.tmdbPersonId),
        crewIds: crew.map((person) => person.tmdbPersonId),
        keywordIds: keywords.map((keyword) => keyword.tmdbKeywordId),
        releaseYearFrom: optionalNumber(input.yearFrom),
        releaseYearTo: optionalNumber(input.yearTo),
        runtimeMin: optionalNumber(input.minRuntime) ?? defaultRuntimeMin,
        runtimeMax,
        originalLanguage:
          typeof input.originalLanguage === "string" ? input.originalLanguage.toLowerCase() : undefined,
        minRating: optionalNumber(input.minRating),
        minVoteCount: optionalNumber(input.minVotes) ?? 200,
        sortBy,
      },
      { page: optionalNumber(input.page) },
    );

    // Echo what each name resolved to so the model can catch a wrong match
    return {
      matched: { cast, crew, keywords },
      ...(await removeWatched(summarizeResults(result), stringList(input.excludeWatchedBy))),
    };
  },
};

export function createMovieSearchAgent() {
  return new ChatAgent({
    provider: new OpenAIProvider(),
    system: MOVIE_SEARCH_SYSTEM_PROMPT,
    tools: [searchMoviesTool, discoverMoviesTool],
    maxIterations: 5,
  });
}
