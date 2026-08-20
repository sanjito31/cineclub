import { redirect } from "next/navigation";
import { loadMemberRoom } from "@/app/rooms/[code]/load-room";
import { RoomTaskHeader, RoomTaskIdentity } from "@/app/rooms/[code]/room-task-header";
import { RoomPhase } from "@/app/generated/prisma/enums";
import { roomTaskPath } from "@/lib/domain/room-paths";

export const dynamic = "force-dynamic";

export default async function RoomVotingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const { room, isOwner } = await loadMemberRoom(rawCode);

  if (room.phase !== RoomPhase.VOTING) {
    redirect(roomTaskPath(room.code, room.phase));
  }

  return (
    <main className="task-page">
      <RoomTaskHeader />
      <RoomTaskIdentity name={room.name} code={room.code} isOwner={isOwner} />
      <div className="task-main">
        <section className="panel selection-complete-panel" aria-labelledby="voting-heading">
          <div>
            <span className="eyebrow">Voting</span>
            <h2 id="voting-heading">Rank the movies</h2>
            <p>
              Voting is open. This page will stay focused on ranking; open{" "}
              {isOwner ? "Host Controls" : "Room Info"} for roster and progress details.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
