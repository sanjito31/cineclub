import { AuthorizationError, DomainError } from "@/lib/auth/errors";
import { getCurrentUser } from "@/lib/auth/session";
import { getRoomForMember } from "@/lib/data/rooms";
import { normalizeRoomCode } from "@/lib/validation/shared";

export function noStoreJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  return Response.json(body, { ...init, headers });
}

export async function requireRoomMemberApi(codeParam: string) {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false as const,
      error: noStoreJson(
        { error: "Sign in before using this room." },
        { status: 401 },
      ),
    };
  }

  const code = normalizeRoomCode(codeParam);
  if (!code) {
    return {
      ok: false as const,
      error: noStoreJson({ error: "Enter a valid room code." }, { status: 400 }),
    };
  }

  try {
    const room = await getRoomForMember(code, user.id);
    return { ok: true as const, user, room, code };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return {
        ok: false as const,
        error: noStoreJson({ error: error.message }, { status: 403 }),
      };
    }
    if (error instanceof DomainError) {
      return {
        ok: false as const,
        error: noStoreJson({ error: error.message }, { status: 404 }),
      };
    }
    return {
      ok: false as const,
      error: noStoreJson(
        { error: "Unable to load this room right now." },
        { status: 500 },
      ),
    };
  }
}
