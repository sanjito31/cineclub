export type TmdbMovieSearchResult = {
  tmdbId: number;
  title: string;
  originalTitle: string | null;
  overview: string | null;
  releaseDate: string | null;
  releaseYear: number | null;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number | null;
};

export type TmdbMovieSearchPage = {
  page: number;
  totalPages: number;
  totalResults: number;
  results: TmdbMovieSearchResult[];
};

export type TmdbErrorCode =
  | "aborted"
  | "configuration"
  | "invalid_query"
  | "malformed_response"
  | "timeout"
  | "unavailable";

export class TmdbServiceError extends Error {
  readonly code: TmdbErrorCode;
  readonly retryAfter: number | null;
  readonly statusCode: number | null;

  constructor(
    code: TmdbErrorCode,
    message: string,
    options: { retryAfter?: number | null; statusCode?: number | null } = {},
  ) {
    super(message);
    this.name = "TmdbServiceError";
    this.code = code;
    this.retryAfter = options.retryAfter ?? null;
    this.statusCode = options.statusCode ?? null;
  }
}

export type TmdbClientConfig = {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  readAccessToken?: string;
  timeoutMs?: number;
};

export type TmdbSearchOptions = {
  page?: number;
  signal?: AbortSignal;
};

export const TMDB_NATIVE_PAGE_SIZE = 20;
export const SEARCH_RESULTS_PER_PAGE = 5;
export const MAXIMUM_SEARCH_PAGE = 2000;
const SEARCH_PAGES_PER_TMDB_PAGE = TMDB_NATIVE_PAGE_SIZE / SEARCH_RESULTS_PER_PAGE;

const DEFAULT_TMDB_API_URL = "https://api.themoviedb.org/3";
const TMDB_POSTER_BASE_URL = "https://image.tmdb.org/t/p/w92";

export function tmdbPosterUrl(posterPath: string) {
  return `${TMDB_POSTER_BASE_URL}${posterPath}`;
}

export function tmdbPageForSearchPage(searchPage: number) {
  return Math.floor((searchPage - 1) / SEARCH_PAGES_PER_TMDB_PAGE) + 1;
}

export function paginateTmdbSearchPage(
  page: TmdbMovieSearchPage,
  searchPage: number,
) {
  const offset =
    ((searchPage - 1) % SEARCH_PAGES_PER_TMDB_PAGE) * SEARCH_RESULTS_PER_PAGE;

  return {
    page: searchPage,
    totalPages: Math.ceil(page.totalResults / SEARCH_RESULTS_PER_PAGE),
    totalResults: page.totalResults,
    results: page.results.slice(offset, offset + SEARCH_RESULTS_PER_PAGE),
  };
}

function normalizeQuery(query: string) {
  const normalized = query.trim().replace(/\s+/g, " ");
  if (normalized.length < 2 || normalized.length > 100) {
    throw new TmdbServiceError(
      "invalid_query",
      "Movie searches must be between 2 and 100 characters.",
    );
  }
  return normalized;
}

function normalizePage(page: number | undefined) {
  const normalized = page ?? 1;
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 500) {
    throw new TmdbServiceError(
      "invalid_query",
      "Movie search pages must be integers between 1 and 500.",
    );
  }
  return normalized;
}

export function normalizeSearchPage(page: number | undefined) {
  const normalized = page ?? 1;
  if (
    !Number.isInteger(normalized) ||
    normalized < 1 ||
    normalized > MAXIMUM_SEARCH_PAGE
  ) {
    throw new TmdbServiceError(
      "invalid_query",
      `Movie search pages must be integers between 1 and ${MAXIMUM_SEARCH_PAGE}.`,
    );
  }
  return normalized;
}

function normalizeBaseUrl(value: string | undefined) {
  try {
    const url = new URL(value ?? DEFAULT_TMDB_API_URL);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Unsupported protocol.");
    }
    return url;
  } catch {
    throw new TmdbServiceError(
      "configuration",
      "The TMDB service is not configured correctly.",
    );
  }
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalPath(value: unknown) {
  const path = optionalString(value);
  return path?.startsWith("/") ? path : null;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readReleaseDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { releaseDate: null, releaseYear: null };
  }

  const releaseYear = Number(value.slice(0, 4));
  return {
    releaseDate: value,
    releaseYear: Number.isInteger(releaseYear) ? releaseYear : null,
  };
}

function normalizeMovie(value: unknown): TmdbMovieSearchResult | null {
  if (!value || typeof value !== "object") return null;
  const movie = value as Record<string, unknown>;
  const tmdbId = movie.id;
  const title = optionalString(movie.title);

  if (!Number.isInteger(tmdbId) || (tmdbId as number) <= 0 || !title) {
    return null;
  }

  const release = readReleaseDate(movie.release_date);
  return {
    tmdbId: tmdbId as number,
    title,
    originalTitle: optionalString(movie.original_title),
    overview: optionalString(movie.overview),
    ...release,
    posterPath: optionalPath(movie.poster_path),
    backdropPath: optionalPath(movie.backdrop_path),
    voteAverage: optionalNumber(movie.vote_average),
  };
}

export function normalizeTmdbSearchResponse(value: unknown): TmdbMovieSearchPage {
  if (!value || typeof value !== "object") {
    throw new TmdbServiceError(
      "malformed_response",
      "TMDB returned an invalid movie search response.",
    );
  }

  const body = value as Record<string, unknown>;
  if (
    !Array.isArray(body.results) ||
    !Number.isInteger(body.page) ||
    !Number.isInteger(body.total_pages) ||
    !Number.isInteger(body.total_results)
  ) {
    throw new TmdbServiceError(
      "malformed_response",
      "TMDB returned an invalid movie search response.",
    );
  }

  const results = body.results.flatMap((movie) => {
    const normalized = normalizeMovie(movie);
    return normalized ? [normalized] : [];
  });

  if (body.results.length > 0 && results.length === 0) {
    throw new TmdbServiceError(
      "malformed_response",
      "TMDB returned invalid movie search results.",
    );
  }

  return {
    page: body.page as number,
    totalPages: body.total_pages as number,
    totalResults: body.total_results as number,
    results,
  };
}

function getRetryAfter(response: Response) {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 60) : null;
}

function createRequestSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;

  const abortFromCaller = () => controller.abort(signal?.reason);
  if (signal?.aborted) {
    abortFromCaller();
  } else {
    signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("Request timed out.", "TimeoutError"));
  }, timeoutMs);

  return {
    signal: controller.signal,
    wasTimedOut: () => timedOut,
    cleanup() {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortFromCaller);
    },
  };
}

export function createTmdbClient(config: TmdbClientConfig = {}) {
  const readAccessToken = config.readAccessToken?.trim();
  const apiKey = config.apiKey?.trim();
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? 8_000;

  if (!readAccessToken && !apiKey) {
    throw new TmdbServiceError(
      "configuration",
      "TMDB movie search is not configured.",
    );
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TmdbServiceError(
      "configuration",
      "The TMDB request timeout is not configured correctly.",
    );
  }

  return {
    async searchMovies(
      query: string,
      options: TmdbSearchOptions = {},
    ): Promise<TmdbMovieSearchPage> {
      const normalizedQuery = normalizeQuery(query);
      const page = normalizePage(options.page);
      const url = new URL(
        `${baseUrl.pathname.replace(/\/$/, "")}/search/movie`,
        baseUrl,
      );
      url.searchParams.set("query", normalizedQuery);
      url.searchParams.set("include_adult", "false");
      url.searchParams.set("language", "en-US");
      url.searchParams.set("page", String(page));

      const headers = new Headers({ Accept: "application/json" });
      if (readAccessToken) {
        headers.set("Authorization", `Bearer ${readAccessToken}`);
      } else {
        url.searchParams.set("api_key", apiKey as string);
      }

      const requestSignal = createRequestSignal(options.signal, timeoutMs);

      try {
        const response = await fetchImpl(url, {
          headers,
          cache: "no-store",
          signal: requestSignal.signal,
        });

        if (!response.ok) {
          const isCredentialError = response.status === 401 || response.status === 403;
          throw new TmdbServiceError(
            isCredentialError ? "configuration" : "unavailable",
            isCredentialError
              ? "TMDB rejected the configured credentials."
              : "TMDB movie search is unavailable right now.",
            {
              retryAfter: getRetryAfter(response),
              statusCode: response.status,
            },
          );
        }

        let body: unknown;
        try {
          body = await response.json();
        } catch {
          throw new TmdbServiceError(
            "malformed_response",
            "TMDB returned an invalid movie search response.",
          );
        }

        return normalizeTmdbSearchResponse(body);
      } catch (error) {
        if (error instanceof TmdbServiceError) throw error;
        if (requestSignal.wasTimedOut()) {
          throw new TmdbServiceError(
            "timeout",
            "TMDB movie search took too long. Please try again.",
          );
        }
        if (options.signal?.aborted) {
          throw new TmdbServiceError("aborted", "TMDB movie search was cancelled.");
        }
        throw new TmdbServiceError(
          "unavailable",
          "TMDB movie search is unavailable right now.",
        );
      } finally {
        requestSignal.cleanup();
      }
    },
  };
}
