import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { HostResultsPanel } from "@/app/rooms/[code]/host-results";
import { loadMemberRoom } from "@/app/rooms/[code]/load-room";
import { RoomTaskHeader, RoomTaskIdentity } from "@/app/rooms/[code]/room-task-header";
import { getHostResults } from "@/lib/data/host-results";
import { roomRevealPath, roomTaskPath } from "@/lib/domain/room-paths";

export const dynamic = "force-dynamic";

export default async function RoomResultsPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const { user, room, isOwner } = await loadMemberRoom(rawCode);
  if (!isOwner) notFound();

  const results = await getHostResults(room.code, user.id);
  if (!results) redirect(roomTaskPath(room.code, room.phase));

  return (
    <main className="task-page">
      <RoomTaskHeader code={room.code} />
      <RoomTaskIdentity name={room.name} code={room.code} />
      <div className="task-main">
        <div className="host-results-navigation">
          <Link className="button button-secondary button-small" href={roomRevealPath(room.code)}>
            Back to reveal
          </Link>
        </div>
        <HostResultsPanel results={results} />
      </div>
    </main>
  );
}
