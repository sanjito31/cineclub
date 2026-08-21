import "server-only";

import type { AsyncResourceResult } from "@/lib/integrations/async-resource";
import {
  WatchboxdClient,
  type WatchboxdDecoder,
  type WatchboxdRequestOptions,
} from "@/lib/watchboxd/core";

export type WatchboxdProfile = {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  letterboxdUrl: string;
};

export type WatchboxdUserLookup =
  | { status: "ready"; profile: WatchboxdProfile }
  | { status: "pending"; retryAfter: number; jobId: string | null }
  | { status: "not_found" }
  | { status: "unavailable" };

function readProfile(value: unknown): WatchboxdProfile | null {
  if (!value || typeof value !== "object") return null;
  const body = value as { data?: unknown };
  if (!body.data || typeof body.data !== "object") return null;
  const data = body.data as Record<string, unknown>;

  if (typeof data.username !== "string" || typeof data.letterboxdUrl !== "string") {
    return null;
  }

  return {
    username: data.username,
    displayName: typeof data.displayName === "string" ? data.displayName : null,
    avatarUrl: typeof data.avatarUrl === "string" ? data.avatarUrl : null,
    letterboxdUrl: data.letterboxdUrl,
  };
}

function createClient() {
  return new WatchboxdClient({
    baseUrl: process.env.WATCHBOXD_API_URL?.trim() || undefined,
  });
}

export async function lookupWatchboxdUser(username: string): Promise<WatchboxdUserLookup> {
  try {
    const result = await createClient().user(username, readProfile);
    if (result.status === "ready") {
      return { status: "ready", profile: result.data };
    }
    if (result.status === "pending") {
      return result;
    }
    if (result.status === "not_found") {
      return result;
    }
    return { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export function getWatchboxdMovie<T>(
  tmdbId: number,
  decode: WatchboxdDecoder<T>,
  options?: WatchboxdRequestOptions,
): Promise<AsyncResourceResult<T>> {
  return createClient().movie(tmdbId, decode, options);
}

export function getWatchboxdMovieByLetterboxdSlug<T>(
  letterboxdSlug: string,
  decode: WatchboxdDecoder<T>,
  options?: WatchboxdRequestOptions,
): Promise<AsyncResourceResult<T>> {
  return createClient().movieByLetterboxdSlug(letterboxdSlug, decode, options);
}

export function getWatchboxdWatchlist<T>(
  username: string,
  decode: WatchboxdDecoder<T>,
  options?: WatchboxdRequestOptions,
): Promise<AsyncResourceResult<T>> {
  return createClient().watchlist(username, decode, options);
}

export function getWatchboxdWatchedHistory<T>(
  username: string,
  decode: WatchboxdDecoder<T>,
  options?: WatchboxdRequestOptions,
): Promise<AsyncResourceResult<T>> {
  return createClient().watchedHistory(username, decode, options);
}

export function getWatchboxdOverlap<T>(
  usernames: readonly string[],
  decode: WatchboxdDecoder<T>,
  options?: WatchboxdRequestOptions,
): Promise<AsyncResourceResult<T>> {
  return createClient().overlap(usernames, decode, options);
}

export function getWatchboxdJob<T>(
  jobId: string,
  decode: WatchboxdDecoder<T>,
  options?: WatchboxdRequestOptions,
): Promise<AsyncResourceResult<T>> {
  return createClient().job(jobId, decode, options);
}

const noopDecoder = () => null;

export function warmWatchboxdCache(username: string) {
  const client = createClient();
  client.watchlist(username, noopDecoder).catch(() => {});
  client.watchedHistory(username, noopDecoder).catch(() => {});
}

export type {
  AsyncResourcePollResult,
  AsyncResourceResult,
  PollAsyncResourceOptions,
} from "@/lib/integrations/async-resource";
export { pollAsyncResource } from "@/lib/integrations/async-resource";
export { WatchboxdInputError } from "@/lib/watchboxd/core";
export type {
  WatchboxdDecoder,
  WatchboxdRequestOptions,
} from "@/lib/watchboxd/core";
