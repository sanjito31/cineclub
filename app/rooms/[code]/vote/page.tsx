import { redirect } from "next/navigation";
import { submitBallotAction } from "@/app/actions/ballots";
import { loadMemberRoom } from "@/app/rooms/[code]/load-room";
import { MovieVoting } from "@/app/rooms/[code]/movie-voting";
import { RoomTaskHeader, RoomTaskIdentity } from "@/app/rooms/[code]/room-task-header";
import { toVotingClientContext } from "@/app/rooms/[code]/voting-contracts";
import { RoomPhase } from "@/app/generated/prisma/enums";
import { getVotingBallotContext } from "@/lib/data/ballots";
import { roomTaskPath } from "@/lib/domain/room-paths";

export const dynamic = "force-dynamic";

export default async function RoomVotingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const { user, room, isOwner } = await loadMemberRoom(rawCode);

  if (room.phase !== RoomPhase.VOTING) {
    redirect(roomTaskPath(room.code, room.phase));
  }

  const voting = toVotingClientContext(
    await getVotingBallotContext(room.code, user.id),
  );

  if (voting.phase !== RoomPhase.VOTING) {
    redirect(roomTaskPath(voting.code, voting.phase));
  }

  return (
    <main className="task-page">
      <RoomTaskHeader />
      <RoomTaskIdentity name={voting.name} code={voting.code} />
      <div className="task-main">
        {voting.alreadySubmitted ? (
          <section className="panel selection-complete-panel" aria-labelledby="voting-waiting-heading">
            <span className="selection-complete-mark" aria-hidden="true">✓</span>
            <div>
              <span className="eyebrow">Ballot submitted</span>
              <h2 id="voting-waiting-heading">Your ballot is locked in</h2>
              <p>
                Waiting for remaining voters. Head back to the room to follow progress.
              </p>
            </div>
          </section>
        ) : (
          <MovieVoting
            code={voting.code}
            movies={voting.movies}
            participants={voting.participants}
            participantCount={voting.participantCount}
            requiredRankingCount={voting.requiredRankingCount}
            requireParticipantCoverage={voting.requireParticipantCoverage}
            isOwner={isOwner}
            submitBallotAction={submitBallotAction}
          />
        )}
      </div>
    </main>
  );
}
