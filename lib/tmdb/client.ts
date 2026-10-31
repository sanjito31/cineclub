import "server-only";

import {
  createTmdbClient,
  loadTmdbMovieOverviews,
  TmdbServiceError,
  type TmdbDiscoverFilters,
  type TmdbKeywordResult,
  type TmdbMovieDetailsOptions,
  type TmdbPersonResult,
  type TmdbRequestOptions,
  type TmdbMovieSearchPage,
  type TmdbMovieSearchResult,
  type TmdbSearchOptions,
} from "@/lib/tmdb/core";
import { serverConfig } from "@/lib/config/server";

function readEnvironment() {
  const { readAccessToken, apiKey, baseUrl } = serverConfig.tmdb;

  if (!readAccessToken && !apiKey) {
    throw new TmdbServiceError(
      "configuration",
      "TMDB movie search is not configured.",
    );
  }

  return {
    readAccessToken,
    apiKey,
    baseUrl,
  };
}

export function searchTmdbMovies(
  query: string,
  options?: TmdbSearchOptions,
): Promise<TmdbMovieSearchPage> {
  return createTmdbClient(readEnvironment()).searchMovies(query, options);
}

export function discoverTmdbMovies(
  filters: TmdbDiscoverFilters,
  options?: TmdbSearchOptions,
): Promise<TmdbMovieSearchPage> {
  return createTmdbClient(readEnvironment()).discoverMovies(filters, options);
}

export function searchTmdbPeople(
  query: string,
  options?: TmdbRequestOptions,
): Promise<TmdbPersonResult[]> {
  return createTmdbClient(readEnvironment()).searchPeople(query, options);
}

export function searchTmdbKeywords(
  query: string,
  options?: TmdbRequestOptions,
): Promise<TmdbKeywordResult[]> {
  return createTmdbClient(readEnvironment()).searchKeywords(query, options);
}

export function getTmdbMovie(
  tmdbId: number,
  options?: TmdbMovieDetailsOptions,
): Promise<TmdbMovieSearchResult> {
  return createTmdbClient(readEnvironment()).getMovie(tmdbId, options);
}

export async function getTmdbMovieOverviews(
  tmdbIds: readonly number[],
  options?: TmdbMovieDetailsOptions,
): Promise<Map<number, string | null>> {
  try {
    return await loadTmdbMovieOverviews(
      createTmdbClient(readEnvironment()),
      tmdbIds,
      options,
    );
  } catch {
    return new Map(
      [...new Set(tmdbIds.filter((id) => Number.isInteger(id) && id > 0))].map(
        (tmdbId) => [tmdbId, null],
      ),
    );
  }
}

export type {
  TmdbDiscoverFilters,
  TmdbDiscoverSort,
  TmdbKeywordResult,
  TmdbMovieDetailsOptions,
  TmdbPersonResult,
  TmdbMovieSearchPage,
  TmdbMovieSearchResult,
  TmdbSearchOptions,
} from "@/lib/tmdb/core";
export {
  MAXIMUM_SEARCH_PAGE,
  SEARCH_RESULTS_PER_PAGE,
  TMDB_MOVIE_GENRES,
  TmdbServiceError,
  loadTmdbMovieOverviews,
  normalizeSearchPage,
  paginateTmdbSearchPage,
  tmdbPageForSearchPage,
  tmdbPosterUrl,
} from "@/lib/tmdb/core";
