"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, type DragEvent } from "react";
import { initialActionState } from "@/app/actions/types";
import { ActionMessage } from "@/app/components/action-message";
import { SubmitButton } from "@/app/components/submit-button";
import {
  appendRankedMovie,
  formatNominatorList,
  isParticipantCoverageSatisfied,
  letterboxdFilmUrl,
  minimumRankingCopy,
  moveRankedMovie,
  moveRankedMovieToIndex,
  nominationGroupsForParticipants,
  moviePosterSrc,
  participantCoverageFromRankedIds,
  rankedMoviesForIds,
  removeRankedMovie,
  serializeBallotSubmission,
  toBallotMovieCoverage,
  uniqueNominators,
  uniqueVotingMovies,
  unrankedMoviesForIds,
  type BallotSubmissionState,
  type SubmitBallotAction,
  type VotingMovie,
  type VotingNominator,
} from "@/app/rooms/[code]/voting-contracts";
import { roomFinalizePath } from "@/lib/domain/room-paths";

function LetterboxdRatingPill({ rating }: { rating: number | null }) {
  if (rating === null) return null;

  return (
    <span
      className="rating-badge letterboxd-rating"
      aria-label={`Letterboxd rating ${rating.toFixed(1)} out of 5`}
    >
      {/* Logos are local public assets; img keeps SVG/PNG sizing simple in these tiny badges. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="rating-badge-logo" src="/letterboxd.png" alt="" width={20} height={20} />
      <span className="rating-badge-value">{rating.toFixed(1)}</span>
    </span>
  );
}

function VotingMoviePoster({ movie }: { movie: VotingMovie }) {
  const src = moviePosterSrc(movie);
  if (src) {
    return (
      <Image
        className="selection-movie-poster"
        src={src}
        alt=""
        width={46}
        height={69}
      />
    );
  }

  return (
    <span className="selection-movie-poster is-missing" aria-hidden="true">
      {movie.title.slice(0, 1).toUpperCase()}
    </span>
  );
}

function VotingMovieCardLink({ movie }: { movie: VotingMovie }) {
  const href = movie.letterboxdUrl ?? letterboxdFilmUrl(movie.letterboxdSlug);
  if (!href) return null;

  return (
    <a
      className="voting-card-letterboxd"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${movie.title} on Letterboxd`}
    />
  );
}

function VotingMovieIdentity({
  movie,
  showOverview = false,
  showNominators = false,
}: {
  movie: VotingMovie;
  showOverview?: boolean;
  showNominators?: boolean;
}) {
  const nominators = showNominators ? formatNominatorList(movie.nominators) : "";

  return (
    <div className="voting-movie-identity">
      <VotingMoviePoster movie={movie} />
      <div className="voting-movie-copy">
        <span className="voting-movie-heading">
          <strong>{movie.title}</strong>
          {movie.releaseYear ? <span>{movie.releaseYear}</span> : null}
          <LetterboxdRatingPill rating={movie.letterboxdRating} />
        </span>
        {nominators ? (
          <span className="voting-nominators">Nominated by {nominators}</span>
        ) : null}
        {showOverview && movie.overview ? (
          <p className="voting-movie-overview">{movie.overview}</p>
        ) : null}
      </div>
    </div>
  );
}

function VotingLockedInPanel({
  headingId,
  title,
  copy,
}: {
  headingId: string;
  title: string;
  copy: string;
}) {
  return (
    <section className="panel selection-complete-panel" aria-labelledby={headingId}>
      <span className="selection-complete-mark" aria-hidden="true">✓</span>
      <div>
        <span className="eyebrow">Ballot submitted</span>
        <h2 id={headingId}>{title}</h2>
        <p>{copy}</p>
      </div>
    </section>
  );
}

function RankList({
  rankedMovies,
  pending,
  onMove,
  onRemove,
  onReorder,
}: {
  rankedMovies: VotingMovie[];
  pending: boolean;
  onMove: (roomMovieId: string, direction: -1 | 1) => void;
  onRemove: (roomMovieId: string) => void;
  onReorder: (roomMovieId: string, toIndex: number) => void;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  function clearDragState() {
    setDraggedId(null);
    setDropIndex(null);
  }

  function handleDragStart(event: DragEvent<HTMLLIElement>, roomMovieId: string) {
    const target = event.target as HTMLElement;
    if (target.closest("a, .voting-rank-actions")) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", roomMovieId);
    setDraggedId(roomMovieId);
  }

  function handleDragOver(event: DragEvent<HTMLLIElement>, index: number) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropIndex(index);
  }

  function handleDrop(event: DragEvent<HTMLLIElement>, index: number) {
    event.preventDefault();
    const roomMovieId = event.dataTransfer.getData("text/plain") || draggedId;
    if (roomMovieId) onReorder(roomMovieId, index);
    clearDragState();
  }

  return (
    <ol className="voting-rank-list">
      {rankedMovies.map((movie, index) => {
        const rank = index + 1;
        return (
          <li
            className={[
              "voting-rank-item",
              draggedId === movie.roomMovieId ? "is-dragging" : "",
              dropIndex === index && draggedId !== movie.roomMovieId ? "is-drop-target" : "",
            ].filter(Boolean).join(" ")}
            key={movie.roomMovieId}
            value={rank}
            draggable={!pending}
            onDragStart={(event) => handleDragStart(event, movie.roomMovieId)}
            onDragOver={(event) => handleDragOver(event, index)}
            onDrop={(event) => handleDrop(event, index)}
            onDragEnd={clearDragState}
          >
            <VotingMovieCardLink movie={movie} />
            <span
              className="voting-drag-handle"
              role="img"
              aria-label={`Drag to reorder ${movie.title}`}
            >
              <span aria-hidden="true">⠿</span>
            </span>
            <span className="voting-rank-index">{rank}</span>
            <VotingMovieIdentity movie={movie} showNominators />
            <div className="voting-rank-actions">
              <button
                className="button button-secondary button-compact"
                type="button"
                disabled={index === 0 || pending}
                onClick={() => onMove(movie.roomMovieId, -1)}
                aria-label={`Move ${movie.title} up to rank ${rank - 1}`}
              >
                Up
              </button>
              <button
                className="button button-secondary button-compact"
                type="button"
                disabled={index === rankedMovies.length - 1 || pending}
                onClick={() => onMove(movie.roomMovieId, 1)}
                aria-label={`Move ${movie.title} down to rank ${rank + 1}`}
              >
                Down
              </button>
              <button
                className="text-button voting-unrank"
                type="button"
                disabled={pending}
                onClick={() => onRemove(movie.roomMovieId)}
                aria-label={`Remove ${movie.title} from ranking`}
              >
                Remove
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function MovieVoting({
  code,
  movies,
  participants,
  participantCount,
  requiredRankingCount,
  requireParticipantCoverage,
  isOwner,
  submitBallotAction,
}: {
  code: string;
  movies: VotingMovie[];
  participants: VotingNominator[];
  participantCount: number;
  requiredRankingCount: number;
  requireParticipantCoverage: boolean;
  isOwner: boolean;
  submitBallotAction: SubmitBallotAction;
}) {
  const [state, formAction, pending] = useActionState<BallotSubmissionState, FormData>(
    submitBallotAction,
    initialActionState,
  );
  const router = useRouter();
  const [rankedIds, setRankedIds] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const submitStarted = useRef(false);

  useEffect(() => {
    if (!pending && state.status !== "success") submitStarted.current = false;
  }, [pending, state.status]);

  useEffect(() => {
    if (state.status === "success" && state.result?.phaseTransitioned) {
      router.replace(roomFinalizePath(code));
      router.refresh();
    }
  }, [code, router, state.result?.phaseTransitioned, state.status]);

  const uniqueMovies = uniqueVotingMovies(movies);
  const rankedMovies = rankedMoviesForIds(uniqueMovies, rankedIds);
  const poolMovies = unrankedMoviesForIds(uniqueMovies, rankedIds);
  const rankedCount = rankedMovies.length;
  const movieCount = uniqueMovies.length;
  const minimumMet = rankedCount >= requiredRankingCount;
  const coverageParticipants = uniqueNominators(participants);
  const participantIds = coverageParticipants.map((participant) => participant.participantId);
  const coverage = participantCoverageFromRankedIds(
    uniqueMovies,
    rankedIds,
    coverageParticipants,
  );
  const nominationGroups = nominationGroupsForParticipants(
    uniqueMovies,
    coverageParticipants,
    rankedIds,
  );
  const missingCoverage = coverage.filter((participant) => !participant.covered);
  const coveredCount = coverage.filter((participant) => participant.covered).length;
  const coverageSatisfied = !requireParticipantCoverage
    || isParticipantCoverageSatisfied(
      rankedIds,
      toBallotMovieCoverage(uniqueMovies),
      participantIds,
    );
  const remainingMinimum = Math.max(0, requiredRankingCount - rankedCount);
  const submissionReady = minimumMet && coverageSatisfied && confirmed;
  const showRankList = !requireParticipantCoverage || coverageSatisfied;
  const roomProgressLabel = isOwner ? "Host Controls" : "Room Info";

  function updateRanking(nextIds: string[]) {
    setRankedIds(nextIds);
    setConfirmed(false);
  }

  function selectMovie(roomMovieId: string) {
    updateRanking(appendRankedMovie(rankedIds, roomMovieId));
  }

  function unselectMovie(roomMovieId: string) {
    updateRanking(removeRankedMovie(rankedIds, roomMovieId));
  }

  if (state.status === "success") {
    const movedOn = state.result?.phaseTransitioned === true;
    return (
      <VotingLockedInPanel
        headingId="voting-complete-heading"
        title="Your ballot is locked in"
        copy={
          state.message
          ?? (movedOn
            ? "The room is moving on to finalizing."
            : `Waiting for remaining voters. Open ${roomProgressLabel} to follow room progress.`)
        }
      />
    );
  }

  return (
    <section className="panel selection-panel voting-panel" aria-labelledby="voting-heading">
      <div className="selection-intro">
        <div>
          <span className="eyebrow">Ranked voting</span>
          <h2 id="voting-heading">
            {requireParticipantCoverage ? "Cover every person, then rank" : "Rank the movies"}
          </h2>
          <p>
            {requireParticipantCoverage
              ? "Select at least one movie from each person. A shared nomination counts for everyone who picked that film. When every person is covered, rank your selections below. Rank 1 is first."
              : "Add movies from the pool, then drag to set rank order. Rank 1 is your first choice. You can rank more than the minimum; unranked titles stay in the pool."}
          </p>
        </div>
        <span className="selection-count" aria-live="polite">
          {requireParticipantCoverage
            ? `${coveredCount} / ${participantCount} covered`
            : `${rankedCount} / ${movieCount} ranked`}
        </span>
      </div>

      <p className="voting-minimum" aria-live="polite">
        {minimumRankingCopy(requiredRankingCount, movieCount)}
        {requireParticipantCoverage && !coverageSatisfied
          ? " Cover every participant before ranking."
          : minimumMet
            ? rankedCount < movieCount
              ? " Minimum met. You can keep ranking or submit."
              : " Every movie is ranked."
            : ` Rank ${remainingMinimum} more ${remainingMinimum === 1 ? "movie" : "movies"} to continue.`}
      </p>

      <form
        action={formAction}
        className="selection-form"
        onSubmit={(event) => {
          if (!submissionReady || pending || submitStarted.current) {
            event.preventDefault();
            return;
          }
          submitStarted.current = true;
        }}
      >
        <input name="code" type="hidden" value={code} />
        <input name="ranks" type="hidden" value={serializeBallotSubmission(rankedIds)} />

        {requireParticipantCoverage ? (
          <div className={`voting-nominations${coverageSatisfied ? " is-complete" : ""}`}>
            <h3>Nominations</h3>
            <p>
              {coverageSatisfied
                ? `Every participant is represented. Rank the selected movies below.`
                : `Choose movies until all ${participantCount} participants are represented.`}
            </p>
            {nominationGroups.map((group) => {
              const headingId = `voting-group-${group.participantId}`;
              return (
                <section
                  className={`voting-nomination-group${group.covered ? " is-covered" : ""}`}
                  key={group.participantId}
                  aria-labelledby={headingId}
                >
                  <h4 className="voting-nomination-heading" id={headingId}>
                    <span>{group.displayName}</span>
                    {group.covered ? (
                      <span className="voting-nomination-check" aria-label="Coverage satisfied">
                        ✓
                      </span>
                    ) : null}
                  </h4>
                  {group.movies.length === 0 ? (
                    <p className="voting-empty">No nominations from this person.</p>
                  ) : (
                    <ul className="voting-nominate-list">
                      {group.movies.map((movie) => {
                        const selected = rankedIds.includes(movie.roomMovieId);
                        return (
                          <li
                            className={`voting-nominate-item${selected ? " is-selected" : ""}`}
                            key={`${group.participantId}-${movie.roomMovieId}`}
                          >
                            <VotingMovieCardLink movie={movie} />
                            <VotingMovieIdentity movie={movie} showOverview />
                            <button
                              className="button button-secondary button-compact"
                              type="button"
                              disabled={pending}
                              aria-pressed={selected}
                              onClick={() => {
                                if (selected) unselectMovie(movie.roomMovieId);
                                else selectMovie(movie.roomMovieId);
                              }}
                              aria-label={
                                selected
                                  ? `Remove ${movie.title} from ballot`
                                  : `Add ${movie.title} to ballot`
                              }
                            >
                              {selected ? "Selected" : "Select"}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}
            {missingCoverage.length > 0 ? (
              <p className="selection-submit-hint is-error">
                Still missing {missingCoverage.map((participant) => (
                  participant.isCurrentUser ? "you" : participant.displayName
                )).join(", ")}.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="voting-pool">
            <h3>Unranked movies</h3>
            {poolMovies.length === 0 ? (
              <p className="voting-empty">All movies are in your ranking.</p>
            ) : (
              <ul className="voting-pool-list">
                {poolMovies.map((movie) => (
                  <li key={movie.roomMovieId}>
                    <VotingMovieCardLink movie={movie} />
                    <VotingMovieIdentity movie={movie} />
                    <button
                      className="button button-secondary button-compact"
                      type="button"
                      disabled={pending}
                      onClick={() => selectMovie(movie.roomMovieId)}
                      aria-label={`Add ${movie.title} to ranking`}
                    >
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {showRankList ? (
          <div className="voting-ranked">
            <h3>Your ranking</h3>
            {rankedMovies.length === 0 ? (
              <p className="voting-empty">
                {requireParticipantCoverage
                  ? "Selected movies appear here once every participant is covered. Rank 1 is best."
                  : "Add movies from the pool above. Rank 1 is best."}
              </p>
            ) : (
              <RankList
                rankedMovies={rankedMovies}
                pending={pending}
                onMove={(roomMovieId, direction) => {
                  updateRanking(moveRankedMovie(rankedIds, roomMovieId, direction));
                }}
                onRemove={unselectMovie}
                onReorder={(roomMovieId, toIndex) => {
                  updateRanking(moveRankedMovieToIndex(rankedIds, roomMovieId, toIndex));
                }}
              />
            )}
          </div>
        ) : null}

        <div className="selection-submit">
          <label className="selection-confirmation">
            <input
              checked={confirmed}
              disabled={!minimumMet || !coverageSatisfied || pending}
              name="confirmed"
              required
              type="checkbox"
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              <strong>I understand I cannot change this ballot</strong>
              <small>
                Submitting locks your ranking permanently. There is no edit after this.
              </small>
            </span>
          </label>
          {!minimumMet ? (
            <p className="selection-submit-hint">
              Rank {remainingMinimum} more {remainingMinimum === 1 ? "movie" : "movies"} before submitting.
            </p>
          ) : requireParticipantCoverage && !coverageSatisfied ? (
            <p className="selection-submit-hint is-error">
              Cover every participant before submitting.
            </p>
          ) : null}
          <ActionMessage status={state.status} message={state.message} />
          <SubmitButton
            disabled={!submissionReady}
            pendingLabel="Submitting ballot…"
          >
            Submit ballot
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}
