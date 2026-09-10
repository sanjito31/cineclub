import Image from "next/image";
import { redirect } from "next/navigation";
import { submitBallotAction, withdrawBallotAction } from "@/app/actions/ballots";
import { WithdrawButton } from "@/app/rooms/[code]/withdraw-button";
import { loadMemberRoom } from "@/app/rooms/[code]/load-room";
import { MovieVoting } from "@/app/rooms/[code]/movie-voting";
import { RoomTaskHeader, RoomTaskIdentity } from "@/app/rooms/[code]/room-task-header";
import { tmdbPosterUrl, toVotingClientContext } from "@/app/rooms/[code]/voting-contracts";
import { RoomPhase } from "@/app/generated/prisma/enums";
import { getVotingBallotContext, getSubmittedBallot, type SubmittedBallotRankView } from "@/lib/data/ballots";
import { roomTaskPath } from "@/lib/domain/room-paths";

export const dynamic = "force-dynamic";

function BallotReview({ ranks, code }: { ranks: SubmittedBallotRankView[]; code: string }) {
  return (
    <section className="panel voting-review-panel" aria-labelledby="ballot-review-heading">
      <span className="selection-complete-mark" aria-hidden="true">✓</span>
      <div>
        <span className="eyebrow">Ballot submitted</span>
        <h2 id="ballot-review-heading">Your ranked ballot</h2>
        <p>Waiting for remaining voters. Head back to the club to follow progress.</p>
      </div>
      <ol className="submission-review-list">
        {ranks.map((movie) => (
          <li key={movie.rank} className="submission-review-item">
            <span className="submission-review-rank">{movie.rank}</span>
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
      <WithdrawButton code={code} action={withdrawBallotAction} label="Change ballot" />
    </section>
  );
}

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

  const ballotContext = await getVotingBallotContext(room.code, user.id);
  const voting = toVotingClientContext(ballotContext);

  if (voting.phase !== RoomPhase.VOTING) {
    redirect(roomTaskPath(voting.code, voting.phase));
  }

  const ballot = voting.alreadySubmitted
    ? await getSubmittedBallot(ballotContext.room.id, ballotContext.currentParticipant.id)
    : [];

  return (
    <main className="task-page">
      <RoomTaskHeader />
      <RoomTaskIdentity name={voting.name} code={voting.code} variant="ballot" />
      <div className="task-main">
        {voting.alreadySubmitted ? (
          <BallotReview ranks={ballot} code={voting.code} />
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
