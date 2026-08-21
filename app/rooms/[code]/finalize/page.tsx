import { redirect } from "next/navigation";
import { loadMemberRoom } from "@/app/rooms/[code]/load-room";
import { FinalizePoller } from "@/app/rooms/[code]/finalize-poller";
import { RoomTaskHeader, RoomTaskIdentity } from "@/app/rooms/[code]/room-task-header";
import { RoomPhase } from "@/app/generated/prisma/enums";
import { roomRevealPath, roomTaskPath } from "@/lib/domain/room-paths";

export const dynamic = "force-dynamic";

export default async function RoomFinalizePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const { room } = await loadMemberRoom(rawCode);

  if (room.phase !== RoomPhase.FINALIZING) {
    redirect(roomTaskPath(room.code, room.phase));
  }

  return (
    <main className="task-page">
      <RoomTaskHeader />
      <RoomTaskIdentity name={room.name} code={room.code} />
      <div className="task-main">
        <FinalizePoller
          code={room.code}
          endpoint={`/api/rooms/${encodeURIComponent(room.code)}/finalize`}
          lobbyHref={roomRevealPath(room.code)}
        />
      </div>
    </main>
  );
}