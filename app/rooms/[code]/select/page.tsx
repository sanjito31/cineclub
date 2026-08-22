import Image from "next/image";
import { redirect } from "next/navigation";
import { submitNominationsAction, withdrawSelectionsAction } from "@/app/actions/nominations";
import { WithdrawButton } from "@/app/rooms/[code]/withdraw-button";
import { loadMemberRoom } from "@/app/rooms/[code]/load-room";
import { MovieSelection } from "@/app/rooms/[code]/movie-selection";
import { RoomTaskHeader, RoomTaskIdentity } from "@/app/rooms/[code]/room-task-header";
import { tmdbPosterUrl } from "@/app/rooms/[code]/selection-contracts";
import { RoomPhase } from "@/app/generated/prisma/enums";
import { getSubmittedNominations, type SubmittedNominationView } from "@/lib/data/nominations";
import { roomTaskPath } from "@/lib/domain/room-paths";

export const dynamic = "force-dynamic";

function NominationReview({ nominations, code }: { nominations: SubmittedNominationView[]; code: string }) {
  return (
    <section className="panel" aria-labelledby="selection-review-heading">
      <span className="selection-complete-mark" aria-hidden="true">✓</span>
      <div>
        <span className="eyebrow">Selections submitted</span>
        <h2 id="selection-review-heading">Your nominations</h2>
        <p>Waiting for the rest of the crew. Head back to the room to follow progress.</p>
      </div>
      <ol className="submission-review-list">
        {nominations.map((movie) => (
          <li key={movie.slotIndex} className="submission-review-item">
            {movie.posterPath ? (
              <Image
                className="submission-review-poster"
                src={tmdbPosterUrl(movie.posterPath)}
                alt=""
                width={40}
                height={60}
              />
            ) : (
              <span className="submission-review-poster is-missing" aria-hidden="true">
                {movie.title.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="submission-review-copy">
              <strong>{movie.title}</strong>
              {movie.releaseYear ? <span>{movie.releaseYear}</span> : null}
            </span>
          </li>
        ))}
      </ol>
      <WithdrawButton code={code} action={withdrawSelectionsAction} label="Change selections" />
    </section>
  );
}

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

  return (
    <main className="task-page">
      <RoomTaskHeader />
      <RoomTaskIdentity name={room.name} code={room.code} />
      <div className="task-main">
        {alreadySubmitted ? (
          <NominationReview nominations={nominations} code={room.code} />
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
