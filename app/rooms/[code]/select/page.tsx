import { redirect } from "next/navigation";
import { submitNominationsAction } from "@/app/actions/nominations";
import { loadMemberRoom } from "@/app/rooms/[code]/load-room";
import { MovieSelection } from "@/app/rooms/[code]/movie-selection";
import { RoomTaskHeader, RoomTaskIdentity } from "@/app/rooms/[code]/room-task-header";
import { toSelectionMovie } from "@/app/rooms/[code]/selection-contracts";
import { RoomPhase } from "@/app/generated/prisma/enums";
import { getSubmittedNominations } from "@/lib/data/nominations";
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
  const nominations = alreadySubmitted && currentParticipant
    ? await getSubmittedNominations(room.id, currentParticipant.id)
    : [];
  const initialSelections = nominations.map((nomination) => ({
    slotIndex: nomination.slotIndex,
    movie: toSelectionMovie({
      tmdbId: nomination.tmdbId,
      title: nomination.title,
      releaseYear: nomination.releaseYear,
      overview: nomination.overview,
      posterPath: nomination.posterPath,
      letterboxdRating: nomination.letterboxdRating,
      letterboxdRatingJobId: nomination.letterboxdJobId,
      letterboxdSlug: nomination.letterboxdSlug,
    }),
  }));

  return (
    <main className="task-page">
      <RoomTaskHeader />
      <RoomTaskIdentity name={room.name} code={room.code} />
      <div className="task-main">
        <MovieSelection
          code={room.code}
          selectionsPerUser={room.selectionsPerUser}
          searchEndpoint={`/api/rooms/${encodeURIComponent(room.code)}/movies/search`}
          watchboxdEndpoint={`/api/rooms/${encodeURIComponent(room.code)}/watchboxd`}
          ratingsEndpoint={`/api/rooms/${encodeURIComponent(room.code)}/movies/ratings`}
          letterboxdMoviesEndpoint={`/api/rooms/${encodeURIComponent(room.code)}/movies/letterboxd`}
          submitSelectionsAction={submitNominationsAction}
          initialSelections={initialSelections}
          hasSubmittedSelections={alreadySubmitted}
        />
      </div>
    </main>
  );
}
