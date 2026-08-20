import { redirect } from "next/navigation";
import { requireUserOrRedirect } from "@/lib/auth/session";
import { getRoomForMember } from "@/lib/data/rooms";
import { roomHomePath } from "@/lib/domain/room-paths";
import { normalizeRoomCode } from "@/lib/validation/shared";

export async function loadMemberRoom(rawCode: string) {
  const code = normalizeRoomCode(rawCode);
  if (!code) redirect("/join");

  const user = await requireUserOrRedirect(roomHomePath(code));
  try {
    const room = await getRoomForMember(code, user.id);
    return {
      user,
      room,
      code: room.code,
      isOwner: room.ownerId === user.id,
    };
  } catch {
    redirect(`/join/${code}`);
  }
}
