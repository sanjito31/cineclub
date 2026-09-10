"use client";

import Image from "next/image";
import { useActionState, useMemo, useState } from "react";
import type { RevealNextActionState } from "@/app/actions/reveal";
import { ActionMessage } from "@/app/components/action-message";
import { SubmitButton } from "@/app/components/submit-button";
import {
  formatNominatorList,
  revealPosterSrc,
  type RevealClientContext,
  type RevealClientMovie,
} from "@/app/rooms/[code]/reveal-contracts";

type RevealNextAction = (
  previousState: RevealNextActionState,
  formData: FormData,
) => Promise<RevealNextActionState>;

function LetterboxdRatingPill({ rating }: { rating: number | null }) {
  if (rating === null) return null;

  return (
    <span
      className="rating-badge letterboxd-rating"
      aria-label={`Letterboxd rating ${rating.toFixed(1)} out of 5`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="rating-badge-logo" src="/letterboxd.png" alt="" width={20} height={20} />
      <span className="rating-badge-value">{rating.toFixed(1)}</span>
    </span>
  );
}

function RevealedPoster({
  movie,
  large = false,
}: {
  movie: RevealClientMovie;
  large?: boolean;
}) {
  const src = large ? revealPosterSrc(movie) : movie.posterUrl;
  const width = large ? 228 : 46;
  const height = large ? 342 : 69;
  if (src) {
    return (
      <Image
        className={large ? "reveal-hero-poster" : "selection-movie-poster"}
        src={src}
        alt=""
        width={width}
        height={height}
      />
    );
  }

  return (
    <span
      className={large ? "reveal-hero-poster is-missing" : "selection-movie-poster is-missing"}
      aria-hidden="true"
    >
      {movie.title.slice(0, 1).toUpperCase()}
    </span>
  );
}

function RevealedMovieCard({
  movie,
  featured = false,
  animate = false,
}: {
  movie: RevealClientMovie;
  featured?: boolean;
  animate?: boolean;
}) {
  const nominators = formatNominatorList(movie.nominators);
  const href = movie.letterboxdUrl;

  return (
    <article
      className={`reveal-movie-card${featured ? " is-featured" : ""}${animate ? " is-animating" : ""}`}
    >
      {featured ? (
        <div className="reveal-marquee" aria-hidden="true">
          <span className="tv-bulb" /><span className="tv-bulb" /><span className="tv-bulb" /><span className="tv-bulb" />
          <span className="reveal-marquee-label">✷ Now Revealing ✷</span>
          <span className="tv-bulb" /><span className="tv-bulb" /><span className="tv-bulb" /><span className="tv-bulb" />
        </div>
      ) : null}
      {featured ? <RevealedPoster movie={movie} large /> : <RevealedPoster movie={movie} />}
      <div className="reveal-movie-copy">
        <span className="eyebrow">
          Reveal {movie.revealPosition}
        </span>
        <h3>{movie.title}{movie.releaseYear ? ` (${movie.releaseYear})` : ""}</h3>
        {nominators ? <p>Nominated by {nominators}</p> : null}
        <LetterboxdRatingPill rating={movie.letterboxdRating} />
      </div>
      {href ? (
        <a
          className="voting-card-letterboxd"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${movie.title} on Letterboxd`}
        />
      ) : null}
    </article>
  );
}

export function MovieReveal({
  initial,
  revealAction,
  skipRevealAction,
}: {
  initial: RevealClientContext;
  revealAction: RevealNextAction;
  skipRevealAction: RevealNextAction;
}) {
  const [warningForCount, setWarningForCount] = useState<number | null>(null);
  const [dismissedCooldown, setDismissedCooldown] = useState(false);
  const [understoodEarly, setUnderstoodEarly] = useState(false);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [state, action] = useActionState(revealAction, {
    status: "idle",
  } satisfies RevealNextActionState);
  const [skipState, doSkip, skipPending] = useActionState(skipRevealAction, {
    status: "idle",
  } satisfies RevealNextActionState);
  const latest = initial.revealed.at(-1) ?? null;
  const history = initial.revealed.slice(0, -1).reverse();
  const completed = initial.remainingCount === 0;
  const onCooldown = Boolean(initial.nextReveal?.isOnCooldown);
  const confirmingEarly =
    warningForCount === initial.revealedCount
    || (state.errorCode === "COOLDOWN_UNCONFIRMED" && !dismissedCooldown);
  const sealedSlots = useMemo(
    () => Array.from({ length: initial.remainingCount }, (_, index) => index),
    [initial.remainingCount],
  );

  return (
    <div className="reveal-layout">
      <section className="panel reveal-stage" aria-labelledby="reveal-heading">
        <div className="selection-intro">
          <div>
            <span className="eyebrow">{completed ? "The lineup" : "The reveal"}</span>
            <h2 id="reveal-heading">
              {completed
                ? "Every finalist is on the table"
                : latest
                  ? "Just revealed"
                  : "Waiting on the first reveal"}
            </h2>
            <p>
              {completed
                ? "This Cineclub is complete. The host revealed each finalist in order, and the titles below are the full list."
                : initial.isOwner
                  ? "Reveal one movie at a time. The group only sees a title after you uncover it."
                  : "Titles stay hidden until the host reveals them. Future movies never leave the server early."}
            </p>
          </div>
          <span className="selection-count">
            {initial.revealedCount} of {initial.totalFinalists} revealed
          </span>
        </div>

        {latest ? (
          <RevealedMovieCard
            movie={latest}
            featured
            animate={state.revealedMovieId === latest.roomMovieId}
          />
        ) : (
          <div className="reveal-empty">
            <span className="reveal-sealed-card" aria-hidden="true">?</span>
            <p>The first movie is still sealed.</p>
          </div>
        )}

        {initial.nextReveal ? (
          <div className="reveal-next">
            <span className="eyebrow">Up next</span>
            <p className="reveal-sealed-copy">
              Movie {initial.nextReveal.revealPosition} of {initial.totalFinalists} is sealed.
            </p>
            {sealedSlots.length > 1 ? (
              <ul className="reveal-sealed-row" aria-label="Remaining sealed movies">
                {sealedSlots.map((slot) => (
                  <li key={slot} className="reveal-sealed-card" aria-hidden="true">?</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {initial.isOwner && !completed ? (
          <form action={action} className="reveal-host-form">
            <input name="code" type="hidden" value={initial.code} />

            {confirmingEarly ? (
              <div className="reveal-early-warning" role="alertdialog" aria-labelledby="reveal-early-title">
                <span className="eyebrow">Strong warning</span>
                <h3 id="reveal-early-title">Reveal before the 24-hour pause?</h3>
                <p>
                  Cineclub spaces reveals at least 24 hours apart so the group can watch and talk
                  between movies. Revealing now skips that pause. This cannot be undone.
                </p>
                <label className="check-field reveal-early-confirm">
                  <input
                    name="confirmEarlyReveal"
                    type="checkbox"
                    value="1"
                    checked={understoodEarly}
                    onChange={(event) => setUnderstoodEarly(event.target.checked)}
                  />
                  <span>
                    <strong>I understand, reveal the next movie now.</strong>
                    <small>The 24-hour cooldown is a recommendation, not a lock. The next title stays hidden from everyone else until you confirm.</small>
                  </span>
                </label>
                <div className="reveal-early-actions">
                  <SubmitButton
                    disabled={!understoodEarly}
                    pendingLabel="Revealing…"
                  >
                    Reveal anyway
                  </SubmitButton>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => {
                      setWarningForCount(null);
                      setDismissedCooldown(true);
                      setUnderstoodEarly(false);
                    }}
                  >
                    Wait
                  </button>
                </div>
              </div>
            ) : onCooldown ? (
              <button
                className="button button-primary"
                type="button"
                onClick={() => {
                  setWarningForCount(initial.revealedCount);
                  setDismissedCooldown(false);
                  setUnderstoodEarly(false);
                }}
              >
                Reveal early
              </button>
            ) : (
              <SubmitButton pendingLabel="Revealing…">
                {latest ? "Reveal next movie" : "Reveal the first movie"}
              </SubmitButton>
            )}
            <ActionMessage status={state.status} message={state.message} />
          </form>
        ) : null}

        {initial.isOwner && !completed ? (
          <div className="reveal-skip-section">
            {confirmSkip ? (
              <div className="reveal-early-warning" role="alertdialog" aria-labelledby="skip-reveal-title">
                <span className="eyebrow">Skip reveal</span>
                <h3 id="skip-reveal-title">Reveal all remaining movies at once?</h3>
                <p>This will uncover every sealed movie immediately. The group will see the full list without the one-at-a-time pacing.</p>
                <div className="reveal-early-actions">
                  <form action={doSkip}>
                    <input name="code" type="hidden" value={initial.code} />
                    <button
                      className="button button-danger button-small"
                      disabled={skipPending}
                      type="submit"
                    >
                      {skipPending ? "Revealing all…" : "Yes, reveal everything"}
                    </button>
                  </form>
                  <button
                    className="button button-secondary button-small"
                    type="button"
                    onClick={() => setConfirmSkip(false)}
                  >
                    Cancel
                  </button>
                </div>
                <ActionMessage status={skipState.status} message={skipState.message} />
              </div>
            ) : (
              <button
                className="button button-secondary button-small"
                type="button"
                onClick={() => setConfirmSkip(true)}
              >
                Skip reveal
              </button>
            )}
          </div>
        ) : null}

        {!initial.isOwner && !completed ? (
          <p className="muted-copy">
            Waiting for the host to uncover the next movie.
          </p>
        ) : null}
      </section>

      {history.length > 0 ? (
        <section className="panel reveal-history-panel" aria-labelledby="reveal-history-heading">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Already shown</span>
              <h2 id="reveal-history-heading">Reveal history</h2>
            </div>
          </div>
          <ul className="reveal-history-list">
            {history.map((movie) => (
              <li key={movie.roomMovieId}>
                <RevealedMovieCard movie={movie} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
