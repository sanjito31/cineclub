import "server-only";

import {
  createTmdbClient,
  loadTmdbMovieOverviews,
  TmdbServiceError,
  type TmdbMovieDetailsOptions,
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
  TmdbMovieDetailsOptions,
  TmdbMovieSearchPage,
  TmdbMovieSearchResult,
  TmdbSearchOptions,
} from "@/lib/tmdb/core";
export {
  MAXIMUM_SEARCH_PAGE,
  SEARCH_RESULTS_PER_PAGE,
  TmdbServiceError,
  loadTmdbMovieOverviews,
  normalizeSearchPage,
  paginateTmdbSearchPage,
  tmdbPageForSearchPage,
  tmdbPosterUrl,
} from "@/lib/tmdb/core";
