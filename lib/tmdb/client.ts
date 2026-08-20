import "server-only";

import {
  createTmdbClient,
  TmdbServiceError,
  type TmdbMovieSearchPage,
  type TmdbSearchOptions,
} from "@/lib/tmdb/core";

function readEnvironment() {
  const readAccessToken = process.env.TMDB_API_READ_ACCESS_TOKEN?.trim();
  const apiKey = process.env.TMDB_API_KEY?.trim();

  if (!readAccessToken && !apiKey) {
    throw new TmdbServiceError(
      "configuration",
      "TMDB movie search is not configured.",
    );
  }

  return {
    readAccessToken,
    apiKey,
    baseUrl: process.env.TMDB_API_URL?.trim() || undefined,
  };
}

export function searchTmdbMovies(
  query: string,
  options?: TmdbSearchOptions,
): Promise<TmdbMovieSearchPage> {
  return createTmdbClient(readEnvironment()).searchMovies(query, options);
}

export type {
  TmdbMovieSearchPage,
  TmdbMovieSearchResult,
  TmdbSearchOptions,
} from "@/lib/tmdb/core";
export {
  MAXIMUM_SEARCH_PAGE,
  SEARCH_RESULTS_PER_PAGE,
  TmdbServiceError,
  normalizeSearchPage,
  paginateTmdbSearchPage,
  tmdbPageForSearchPage,
  tmdbPosterUrl,
} from "@/lib/tmdb/core";
