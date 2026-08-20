import {
  extractAsyncResourceJobIds,
  requestAsyncResource,
  type AsyncResourceDecoder,
  type AsyncResourceResult,
} from "@/lib/integrations/async-resource";

export const DEFAULT_WATCHBOXD_URL = "https://watchboxd.vercel.app";

export class WatchboxdInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WatchboxdInputError";
  }
}

export type WatchboxdDecoder<T> = AsyncResourceDecoder<T>;

export type WatchboxdRequestOptions = {
  query?: Readonly<Record<string, string>>;
  signal?: AbortSignal;
};

export type WatchboxdClientConfig = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const usernamePattern = /^[A-Za-z0-9_-]{1,40}$/;
const jobIdPattern = /^[A-Za-z0-9_-]{1,160}$/;

function normalizeUsername(username: string) {
  const normalized = username.trim();
  if (!usernamePattern.test(normalized)) {
    throw new WatchboxdInputError("Enter a valid Letterboxd username.");
  }
  return normalized;
}

function normalizeJobId(jobId: string) {
  const normalized = jobId.trim();
  if (!jobIdPattern.test(normalized)) {
    throw new WatchboxdInputError("Enter a valid Watchboxd job ID.");
  }
  return normalized;
}

function readJobId(value: unknown) {
  return extractAsyncResourceJobIds(value)[0] ?? null;
}

function normalizeTmdbId(tmdbId: number) {
  if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
    throw new WatchboxdInputError("Enter a valid TMDB movie ID.");
  }
  return tmdbId;
}

function createBaseUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Unsupported protocol.");
    }
    return url;
  } catch {
    throw new WatchboxdInputError("WATCHBOXD_API_URL must be a valid HTTP(S) URL.");
  }
}

function addConfiguredQuery(url: URL, query?: Readonly<Record<string, string>>) {
  if (!query) return;

  for (const [key, value] of Object.entries(query)) {
    if (!key || key === "users") {
      throw new WatchboxdInputError(`Watchboxd query parameter "${key}" is reserved.`);
    }
    url.searchParams.set(key, value);
  }
}

export class WatchboxdClient {
  private readonly baseUrl: URL;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(config: WatchboxdClientConfig = {}) {
    this.baseUrl = createBaseUrl(config.baseUrl ?? DEFAULT_WATCHBOXD_URL);
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  private request<T>(
    path: string,
    decode: WatchboxdDecoder<T>,
    options: WatchboxdRequestOptions = {},
    configureUrl?: (url: URL) => void,
  ): Promise<AsyncResourceResult<T>> {
    const url = new URL(path, this.baseUrl);
    addConfiguredQuery(url, options.query);
    configureUrl?.(url);

    return requestAsyncResource(url, {
      decode,
      fetchImpl: this.fetchImpl,
      readJobId,
      signal: options.signal,
      timeoutMs: this.timeoutMs,
    });
  }

  user<T>(
    username: string,
    decode: WatchboxdDecoder<T>,
    options?: WatchboxdRequestOptions,
  ) {
    const normalized = normalizeUsername(username);
    return this.request(
      `/api/v1/users/${encodeURIComponent(normalized)}`,
      decode,
      options,
    );
  }

  watchlist<T>(
    username: string,
    decode: WatchboxdDecoder<T>,
    options?: WatchboxdRequestOptions,
  ) {
    const normalized = normalizeUsername(username);
    return this.request(
      `/api/v1/users/${encodeURIComponent(normalized)}/watchlist`,
      decode,
      options,
    );
  }

  watchedHistory<T>(
    username: string,
    decode: WatchboxdDecoder<T>,
    options?: WatchboxdRequestOptions,
  ) {
    const normalized = normalizeUsername(username);
    return this.request(
      `/api/v1/users/${encodeURIComponent(normalized)}/watched`,
      decode,
      options,
    );
  }

  movie<T>(
    tmdbId: number,
    decode: WatchboxdDecoder<T>,
    options?: WatchboxdRequestOptions,
  ) {
    const normalized = normalizeTmdbId(tmdbId);
    return this.request(
      `/api/v1/movies/${encodeURIComponent(String(normalized))}`,
      decode,
      options,
    );
  }

  overlap<T>(
    usernames: readonly string[],
    decode: WatchboxdDecoder<T>,
    options?: WatchboxdRequestOptions,
  ) {
    const normalized = [...new Set(usernames.map(normalizeUsername))];
    if (normalized.length < 2 || normalized.length > 10) {
      throw new WatchboxdInputError("Watchboxd overlap requires 2 to 10 unique usernames.");
    }

    return this.request("/api/v1/overlap", decode, options, (url) => {
      url.searchParams.set("users", normalized.join(","));
    });
  }

  job<T>(
    jobId: string,
    decode: WatchboxdDecoder<T>,
    options?: WatchboxdRequestOptions,
  ) {
    const normalized = normalizeJobId(jobId);
    return this.request(
      `/api/v1/jobs/${encodeURIComponent(normalized)}`,
      decode,
      options,
    );
  }
}
