import { requireRoomMemberApi, noStoreJson } from "@/app/api/rooms/[code]/member-request";
import { loadRoomWatchboxdContext } from "@/lib/data/watchboxd-room";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const access = await requireRoomMemberApi((await params).code);
  if (!access.ok) return access.error;

  try {
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
