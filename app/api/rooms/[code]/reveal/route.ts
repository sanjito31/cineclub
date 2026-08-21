import { AuthorizationError } from "@/lib/auth/errors";
import { requireRoomMemberApi, noStoreJson } from "@/app/api/rooms/[code]/member-request";
import { getRevealContext } from "@/lib/data/reveal";
import { RevealError } from "@/lib/domain/reveal";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const access = await requireRoomMemberApi((await params).code);
  if (!access.ok) return access.error;

  try {
    const context = await getRevealContext(access.code, access.user.id);
    return noStoreJson(context);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return noStoreJson({ error: error.message }, { status: 403 });
    }
    if (error instanceof RevealError) {
      const status = error.code === "ROOM_NOT_FOUND" ? 404 : 409;
      return noStoreJson({ error: error.message, code: error.code }, { status });
    }
    return noStoreJson(
      { error: "Unable to load this reveal right now." },
      { status: 500 },
    );
  }
}
