import { redirect } from "next/navigation";
import { submitNominationsAction } from "@/app/actions/nominations";
import { loadMemberRoom } from "@/app/rooms/[code]/load-room";
import { MovieSelection } from "@/app/rooms/[code]/movie-selection";
import { RoomTaskHeader, RoomTaskIdentity } from "@/app/rooms/[code]/room-task-header";
import { RoomPhase } from "@/app/generated/prisma/enums";
import { roomTaskPath } from "@/lib/domain/room-paths";

export const dynamic = "force-dynamic";

export default async function RoomSelectionPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const { user, room } = await loadMemberRoom(rawCode);

  if (room.phase !== RoomPhase.SELECTION) {
    redirect(roomTaskPath(room.code, room.phase));
  }

  const currentParticipant = room.participants.find(
    (participant) => participant.userId === user.id,
  );
  const alreadySubmitted = Boolean(currentParticipant?.selectionSubmittedAt);

  return (
    <main className="task-page">
      <RoomTaskHeader />
      <RoomTaskIdentity name={room.name} code={room.code} />
      <div className="task-main">
        {alreadySubmitted ? (
          <section className="panel selection-complete-panel" aria-labelledby="selection-waiting-heading">
            <span className="selection-complete-mark" aria-hidden="true">✓</span>
            <div>
              <span className="eyebrow">Selections submitted</span>
              <h2 id="selection-waiting-heading">Your picks are locked in</h2>
              <p>
                Waiting for the rest of the crew. Head back to the room to follow progress.
              </p>
            </div>
          </section>
        ) : (
          <MovieSelection
            code={room.code}
            selectionsPerUser={room.selectionsPerUser}
            searchEndpoint={`/api/rooms/${encodeURIComponent(room.code)}/movies/search`}
            watchboxdEndpoint={`/api/rooms/${encodeURIComponent(room.code)}/watchboxd`}
            ratingsEndpoint={`/api/rooms/${encodeURIComponent(room.code)}/movies/ratings`}
            letterboxdMoviesEndpoint={`/api/rooms/${encodeURIComponent(room.code)}/movies/letterboxd`}
            submitSelectionsAction={submitNominationsAction}
          />
        )}
      </div>
    </main>
  );
}
