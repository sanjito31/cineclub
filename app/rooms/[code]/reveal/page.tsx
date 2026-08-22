import { redirect } from "next/navigation";
import { revealNextMovieAction, skipRevealAction } from "@/app/actions/reveal";
import { loadMemberRoom } from "@/app/rooms/[code]/load-room";
import { MovieReveal } from "@/app/rooms/[code]/movie-reveal";
import { toRevealClientContext } from "@/app/rooms/[code]/reveal-contracts";
import { RoomTaskHeader, RoomTaskIdentity } from "@/app/rooms/[code]/room-task-header";
import { RoomPhase } from "@/app/generated/prisma/enums";
import { getRevealContext } from "@/lib/data/reveal";
import { roomTaskPath } from "@/lib/domain/room-paths";

export const dynamic = "force-dynamic";

export default async function RoomRevealPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const { user, room } = await loadMemberRoom(rawCode);

  if (room.phase !== RoomPhase.REVEAL && room.phase !== RoomPhase.COMPLETE) {
    redirect(roomTaskPath(room.code, room.phase));
  }

  const reveal = toRevealClientContext(await getRevealContext(room.code, user.id));

  return (
    <main className="task-page">
      <RoomTaskHeader />
      <RoomTaskIdentity name={reveal.name} code={reveal.code} />
      <div className="task-main">
        <MovieReveal initial={reveal} revealAction={revealNextMovieAction} skipRevealAction={skipRevealAction} />
      </div>
    </main>
  );
}
