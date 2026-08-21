import { AuthorizationError } from "@/lib/auth/errors";
import { requireRoomMemberApi, noStoreJson } from "@/app/api/rooms/[code]/member-request";
import { finalizeRoom } from "@/lib/data/finalization";
import { FinalizationError } from "@/lib/domain/finalization";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const access = await requireRoomMemberApi((await params).code);
  if (!access.ok) return access.error;

  try {
    const result = await finalizeRoom({
      userId: access.user.id,
      code: access.code,
      signal: request.signal,
    });

    if (result.status === "pending") {
      return noStoreJson(
        {
          status: "pending",
          phase: result.phase,
          retryAfter: result.retryAfter,
          pendingRatingCount: result.pendingRatingCount,
        },
        {
          status: 202,
          headers: { "Retry-After": String(result.retryAfter) },
        },
      );
    }

    return noStoreJson({
      status: "ready",
      phase: result.phase,
      alreadyFinalized: result.alreadyFinalized,
      resultCount: result.resultCount,
      finalistCount: result.finalistCount,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return noStoreJson({ error: error.message }, { status: 403 });
    }
    if (error instanceof FinalizationError) {
      const status = error.code === "ROOM_NOT_FOUND" ? 404 : 409;
      return noStoreJson({ error: error.message, code: error.code }, { status });
    }
    return noStoreJson(
      { error: "Unable to finalize this room right now." },
      { status: 500 },
    );
  }
}