import "server-only";

const defaultWatchboxdUrl = "https://watchboxd.vercel.app";

export type WatchboxdProfile = {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  letterboxdUrl: string;
};

export type WatchboxdUserLookup =
  | { status: "ready"; profile: WatchboxdProfile }
  | { status: "pending"; retryAfter: number }
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

function getRetryAfter(response: Response) {
  const retryAfter = Number(response.headers.get("retry-after"));
  return Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 10) : 2;
}

export async function lookupWatchboxdUser(username: string): Promise<WatchboxdUserLookup> {
  try {
    const baseUrl = process.env.WATCHBOXD_API_URL ?? defaultWatchboxdUrl;
    const url = new URL(`/api/v1/users/${encodeURIComponent(username)}`, baseUrl);
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    if (response.status === 202) {
      return { status: "pending", retryAfter: getRetryAfter(response) };
    }

    if (response.status === 404) {
      return { status: "not_found" };
    }

    if (!response.ok) {
      return { status: "unavailable" };
    }

    const profile = readProfile(await response.json());
    return profile ? { status: "ready", profile } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}
