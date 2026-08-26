import { requireRoomMemberApi, noStoreJson } from "@/app/api/rooms/[code]/member-request";
import {
  loadRoomOverlapSuggestionsPage,
  loadRoomWatchboxdContext,
} from "@/lib/data/watchboxd-room";

function optionalBoundedNumber(
  searchParams: URLSearchParams,
  key: string,
  minimum: number,
  maximum: number,
) {
  const value = searchParams.get(key);
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : undefined;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const access = await requireRoomMemberApi((await params).code);
  if (!access.ok) return access.error;

  try {
    const searchParams = new URL(request.url).searchParams;
    if (searchParams.has("overlapPage")) {
      const page = Number(searchParams.get("overlapPage"));
      const letterboxdRatingMin = optionalBoundedNumber(searchParams, "ratingMin", 0, 5);
      const yearMin = optionalBoundedNumber(searchParams, "yearMin", 1870, 3000);
      const yearMax = optionalBoundedNumber(searchParams, "yearMax", 1870, 3000);
      if (
        !Number.isInteger(page)
        || page < 1
        || letterboxdRatingMin === undefined
        || yearMin === undefined
        || yearMax === undefined
        || (yearMin !== null && yearMax !== null && yearMin > yearMax)
      ) {
        return noStoreJson({ error: "Invalid overlap page or filters." }, { status: 400 });
      }

      const overlap = await loadRoomOverlapSuggestionsPage({
        participants: access.room.participants,
        page,
        letterboxdRatingMin,
        yearMin,
        yearMax,
        signal: request.signal,
      });
      const pending = overlap.overlapStatus === "pending";
      return noStoreJson({
        status: pending ? "pending" : "ready",
        retryAfter: overlap.retryAfter ?? 2,
        pendingJobIds: overlap.overlapPendingJobIds,
        eligibleForOverlap: overlap.eligibleForOverlap,
        usernames: overlap.usernames,
        watched: { byTmdbId: {}, bySlug: {}, byTitleYear: {} },
        suggestions: overlap.suggestions,
        overlapStatus: overlap.overlapStatus,
        overlapPagination: overlap.pagination,
      }, pending ? {
        status: 202,
        headers: { "Retry-After": String(overlap.retryAfter ?? 2) },
      } : undefined);
    }

    const context = await loadRoomWatchboxdContext({
      participants: access.room.participants,
      currentUserId: access.user.id,
      signal: request.signal,
    });
    const pending =
      context.watchedPendingJobIds.length > 0 || context.overlapStatus === "pending";

    return noStoreJson(
      {
        status: pending ? "pending" : "ready",
        retryAfter: context.retryAfter ?? 2,
        pendingJobIds: [
          ...context.watchedPendingJobIds,
          ...context.overlapPendingJobIds,
        ],
        eligibleForOverlap: context.eligibleForOverlap,
        usernames: context.usernames,
        watched: context.watched,
        suggestions: context.suggestions,
        overlapStatus: context.overlapStatus,
        overlapPagination: context.overlapPagination,
      },
      pending
        ? {
            status: 202,
            headers: { "Retry-After": String(context.retryAfter ?? 2) },
          }
        : undefined,
    );
  } catch {
    return noStoreJson(
      { error: "Letterboxd data is unavailable right now." },
      { status: 503 },
    );
  }
}
