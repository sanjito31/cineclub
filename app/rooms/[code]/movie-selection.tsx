"use client";

import Image from "next/image";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { initialActionState } from "@/app/actions/types";
import { ActionMessage } from "@/app/components/action-message";
import {
  applyRatingLookupToMovie,
  applyWatchedIndexToMovie,
  createSelectionSlots,
  duplicateSelectionIds,
  moviePosterSrc,
  overlapToSelectionMovie,
  parseLetterboxdMovieLookupsResponse,
  parseMovieRatingsResponse,
  parseMovieSearchResponse,
  parseWatchboxdContextResponse,
  serializeSelectionSubmission,
  tmdbMovieUrl,
} from "@/app/rooms/[code]/selection-contracts";
import type {
  OverlapSuggestion,
  SelectionMovie,
  SelectionSubmissionState,
  SelectionSlotValue,
  SubmitSelectionsAction,
  WatchedIndex,
  WatchedMember,
} from "@/app/rooms/[code]/selection-contracts";
import { pollAsyncResource } from "@/lib/integrations/async-resource";
import { applyLetterboxdMovieLookupToSuggestion, emptyWatchedIndex, mergeOverlapSuggestion, watchedWarningCopy } from "@/lib/domain/watchboxd-selection";

type SearchStatus = "idle" | "loading" | "success" | "empty" | "error";

type SlotSearchState = {
  query: string;
  submittedQuery: string;
  results: SelectionMovie[];
  status: SearchStatus;
  message?: string;
  editing: boolean;
  page: number;
  totalPages: number;
};

type OverlapState = {
  eligible: boolean;
  status: "idle" | "pending" | "ready" | "skipped" | "unavailable";
  suggestions: OverlapSuggestion[];
};

function createSearchStates(count: number): SlotSearchState[] {
  return Array.from({ length: count }, () => ({
    query: "",
    submittedQuery: "",
    results: [],
    status: "idle",
    editing: true,
    page: 1,
    totalPages: 0,
  }));
}

function searchStateIndex(slotIndex: number) {
  return slotIndex - 1;
}

function wait(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function TmdbResultLink({
  movie,
  children,
}: {
  movie: SelectionMovie;
  children: ReactNode;
}) {
  return (
    <a
      className="selection-movie-tmdb-link"
      href={tmdbMovieUrl(movie.tmdbId)}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open ${movie.title} on TMDB`}
    >
      {children}
    </a>
  );
}

function searchErrorMessage(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const message = (value as { error?: unknown; message?: unknown }).error
    ?? (value as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message.trim() : null;
}

function enrichMovie(movie: SelectionMovie, watched: WatchedIndex) {
  return applyWatchedIndexToMovie(movie, watched);
}

function WatchedAvatars({ members }: { members: WatchedMember[] }) {
  return (
    <span className="watched-avatars" aria-hidden="true">
      {members.map((member) => (
        member.avatarUrl ? (
          // Letterboxd avatar hosts vary; a plain img avoids Next image-config misses crashing the warning.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={member.userId}
            className="watched-avatar"
            src={member.avatarUrl}
            alt=""
            width={22}
            height={22}
          />
        ) : (
          <span key={member.userId} className="watched-avatar is-fallback">
            {member.displayName.slice(0, 1).toUpperCase()}
          </span>
        )
      ))}
    </span>
  );
}

function MoviePoster({
  movie,
}: {
  movie: { title: string; posterUrl?: string | null; posterPath?: string | null };
}) {
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

function RatingBadge({
  className,
  src,
  value,
  label,
}: {
  className: string;
  src: string;
  value: number;
  label: string;
}) {
  return (
    <span className={`rating-badge ${className}`} aria-label={label}>
      {/* Logos are local public assets; img keeps SVG/PNG sizing simple in these tiny badges. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="rating-badge-logo" src={src} alt="" width={20} height={20} />
      <span className="rating-badge-value">{value.toFixed(1)}</span>
    </span>
  );
}

function RatingMarks({
  tmdbRating,
  letterboxdRating,
}: {
  tmdbRating?: number | null;
  letterboxdRating?: number | null;
}) {
  return (
    <span className="selection-rating-marks">
      {tmdbRating !== null && tmdbRating !== undefined ? (
        <RatingBadge
          className="tmdb-rating"
          src="/tmdb.svg"
          value={tmdbRating}
          label={`TMDB rating ${tmdbRating.toFixed(1)} out of 10`}
        />
      ) : null}
      {letterboxdRating !== null && letterboxdRating !== undefined ? (
        <RatingBadge
          className="letterboxd-rating"
          src="/letterboxd.png"
          value={letterboxdRating}
          label={`Letterboxd rating ${letterboxdRating.toFixed(1)} out of 5`}
        />
      ) : null}
    </span>
  );
}

function MovieDetails({
  movie,
  sameUserDuplicate = false,
}: {
  movie: SelectionMovie;
  sameUserDuplicate?: boolean;
}) {
  const watchedCopy = watchedWarningCopy(movie.watchedByMembers);
  return (
    <div className="selection-movie-entry">
      <MoviePoster movie={movie} />
      <div className="selection-movie-details">
        <div className="selection-movie-heading">
          <div>
            <strong>{movie.title}</strong>
            {movie.releaseYear ? <span>{movie.releaseYear}</span> : null}
          </div>
          <RatingMarks
            tmdbRating={movie.tmdbRating}
            letterboxdRating={movie.letterboxdRating}
          />
        </div>
        {movie.overview ? <p className="selection-movie-overview">{movie.overview}</p> : null}
        {movie.suggestionReason ? (
          <p className="selection-suggestion-note">Suggested: {movie.suggestionReason}</p>
        ) : null}
        <div className="selection-warnings" aria-live="polite">
          {sameUserDuplicate ? (
            <p className="selection-warning is-blocking">
              You chose this movie in another slot. Replace one copy before submitting.
            </p>
          ) : null}
          {watchedCopy ? (
            <p className="selection-warning watched-warning">
              <WatchedAvatars members={movie.watchedByMembers} />
              <span>{watchedCopy}</span>
            </p>
          ) : movie.watchedByCurrentUser ? (
            <p className="selection-warning">
              Watched warning: you’ve already logged this movie.
            </p>
          ) : null}
          {movie.alreadyNominatedBy.length > 0 ? (
            <p className="selection-warning">
              <span className="selection-warning-icon" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none">
                  <path
                    d="M8 2.4 1.7 13.2h12.6L8 2.4Z"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M8 6.4v3.1"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                  <circle cx="8" cy="11.35" r=".7" fill="currentColor" />
                </svg>
              </span>
              This movie has already been chosen by someone else. Choose another movie.
            </p>
          ) : null}
          {movie.overlappingParticipants.length > 0 ? (
            <p className="selection-overlap">
              Watchlist overlap with {movie.overlappingParticipants.join(", ")}.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function MovieSelection({
  code,
  selectionsPerUser,
  searchEndpoint,
  watchboxdEndpoint,
  ratingsEndpoint,
  letterboxdMoviesEndpoint,
  submitSelectionsAction,
  initialSelections = [],
  initialSuggestions = [],
}: {
  code: string;
  selectionsPerUser: number;
  searchEndpoint: string;
  watchboxdEndpoint: string;
  ratingsEndpoint: string;
  letterboxdMoviesEndpoint: string;
  submitSelectionsAction: SubmitSelectionsAction;
  initialSelections?: SelectionSlotValue[];
  initialSuggestions?: SelectionMovie[];
}) {
  const [state, formAction, pending] = useActionState<SelectionSubmissionState, FormData>(
    submitSelectionsAction,
    initialActionState,
  );
  const [slots, setSlots] = useState<SelectionSlotValue[]>(() => {
    const emptySlots = createSelectionSlots(selectionsPerUser);
    for (const initial of initialSelections) {
      const index = searchStateIndex(initial.slotIndex);
      if (index >= 0 && index < emptySlots.length) {
        emptySlots[index] = initial;
      }
    }
    return emptySlots;
  });
  const [searches, setSearches] = useState(() => createSearchStates(selectionsPerUser));
  const [suggestions] = useState(initialSuggestions);
  const [overlap, setOverlap] = useState<OverlapState>({
    eligible: false,
    status: "idle",
    suggestions: [],
  });
  const [watched, setWatched] = useState<WatchedIndex>(emptyWatchedIndex);
  const [confirmed, setConfirmed] = useState(false);
  const controllers = useRef(new Map<number, AbortController>());
  const submitStarted = useRef(false);
  const watchedRef = useRef(watched);
  watchedRef.current = watched;

  useEffect(() => {
    const activeControllers = controllers.current;
    return () => {
      for (const controller of activeControllers.values()) controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!pending && state.status !== "success") submitStarted.current = false;
  }, [pending, state.status]);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        await pollAsyncResource(async ({ signal }) => {
          const response = await fetch(watchboxdEndpoint, {
            cache: "no-store",
            credentials: "same-origin",
            signal,
          });
          const body: unknown = await response.json().catch(() => null);
          const parsed = parseWatchboxdContextResponse(body);
          if (!parsed) {
            return response.status === 202
              ? { status: "pending", retryAfter: 2, jobId: null }
              : { status: "unavailable", reason: "malformed_response" };
          }

          setWatched(parsed.watched);
          let overlapStatus: OverlapState["status"] = parsed.overlapStatus;
          if (parsed.overlapStatus === "skipped") {
            overlapStatus = "skipped";
          } else if (parsed.status === "pending" && parsed.overlapStatus !== "ready") {
            overlapStatus = "pending";
          }
          setOverlap((current) => ({
            eligible: parsed.eligibleForOverlap,
            status: overlapStatus,
            suggestions: parsed.suggestions.map((suggestion) => {
              const existing = current.suggestions.find((candidate) => (
                (suggestion.letterboxdSlug && candidate.letterboxdSlug === suggestion.letterboxdSlug)
                || candidate.letterboxdUrl === suggestion.letterboxdUrl
              ));
              return mergeOverlapSuggestion(suggestion, existing);
            }),
          }));
          setSlots((current) => current.map((slot) => ({
            ...slot,
            movie: slot.movie ? applyWatchedIndexToMovie(slot.movie, parsed.watched) : slot.movie,
          })));
          setSearches((current) => current.map((search) => ({
            ...search,
            results: search.results.map((movie) => applyWatchedIndexToMovie(movie, parsed.watched)),
          })));

          if (parsed.status === "pending" || response.status === 202) {
            return {
              status: "pending",
              retryAfter: parsed.retryAfter,
              jobId: parsed.pendingJobIds[0] ?? null,
            };
          }
          return { status: "ready", data: parsed };
        }, {
          signal: controller.signal,
          maxAttempts: 30,
          timeoutMs: 90_000,
          maxDelayMs: 10_000,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    })();

    return () => controller.abort();
  }, [watchboxdEndpoint]);

  const pendingRatingIds = [
    ...new Set([
      ...slots.flatMap((slot) => slot.movie?.letterboxdRatingJobId ? [slot.movie.tmdbId] : []),
      ...searches.flatMap((search) =>
        search.results.flatMap((movie) => movie.letterboxdRatingJobId ? [movie.tmdbId] : []),
      ),
    ]),
  ].sort((left, right) => left - right);
  const pendingRatingKey = pendingRatingIds.join(",");

  useEffect(() => {
    if (!pendingRatingKey) return;
    const tmdbIds = pendingRatingKey.split(",").map(Number);
    const controller = new AbortController();

    void (async () => {
      try {
        let pendingIds = tmdbIds;
        for (let attempt = 0; attempt < 20 && pendingIds.length > 0; attempt += 1) {
          const url = new URL(ratingsEndpoint, window.location.origin);
          url.searchParams.set("tmdbIds", pendingIds.join(","));
          const response = await fetch(url, {
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal,
          });
          const body: unknown = await response.json().catch(() => null);
          const ratings = parseMovieRatingsResponse(body);
          if (!ratings) {
            await wait(2_000, controller.signal);
            continue;
          }

          const byTmdbId = new Map(ratings.map((rating) => [rating.tmdbId, rating]));
          setSlots((current) => current.map((slot) => {
            if (!slot.movie) return slot;
            const update = byTmdbId.get(slot.movie.tmdbId);
            return update
              ? { ...slot, movie: applyWatchedIndexToMovie(applyRatingLookupToMovie(slot.movie, update), watchedRef.current) }
              : slot;
          }));
          setSearches((current) => current.map((search) => ({
            ...search,
            results: search.results.map((movie) => {
              const update = byTmdbId.get(movie.tmdbId);
              return update
                ? applyWatchedIndexToMovie(applyRatingLookupToMovie(movie, update), watchedRef.current)
                : movie;
            }),
          })));

          pendingIds = ratings
            .filter((rating) => rating.letterboxdRatingJobId && pendingIds.includes(rating.tmdbId))
            .map((rating) => rating.tmdbId);
          if (pendingIds.length === 0) return;
          await wait(2_000, controller.signal);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    })();

    return () => controller.abort();
  }, [pendingRatingKey, ratingsEndpoint]);

  const pendingOverlapSlugs = [
    ...new Set(
      overlap.suggestions.flatMap((suggestion) => (
        !suggestion.tmdbId && suggestion.letterboxdMovieJobId && suggestion.letterboxdSlug
          ? [suggestion.letterboxdSlug]
          : []
      )),
    ),
  ].sort((left, right) => left.localeCompare(right));
  const pendingOverlapKey = pendingOverlapSlugs.join(",");

  useEffect(() => {
    if (!pendingOverlapKey) return;
    const slugs = pendingOverlapKey.split(",");
    const controller = new AbortController();

    void (async () => {
      try {
        let pendingSlugs = slugs;
        for (let attempt = 0; attempt < 20 && pendingSlugs.length > 0; attempt += 1) {
          const url = new URL(letterboxdMoviesEndpoint, window.location.origin);
          url.searchParams.set("slugs", pendingSlugs.join(","));
          const response = await fetch(url, {
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal,
          });
          const body: unknown = await response.json().catch(() => null);
          const lookups = parseLetterboxdMovieLookupsResponse(body);
          if (!lookups) {
            await wait(2_000, controller.signal);
            continue;
          }

          const bySlug = new Map(
            lookups.map((lookup) => [lookup.letterboxdSlug.toLowerCase(), lookup]),
          );
          setOverlap((current) => ({
            ...current,
            suggestions: current.suggestions.map((suggestion) => {
              const lookup = suggestion.letterboxdSlug
                ? bySlug.get(suggestion.letterboxdSlug.toLowerCase())
                : undefined;
              return lookup
                ? applyLetterboxdMovieLookupToSuggestion(suggestion, lookup)
                : suggestion;
            }),
          }));

          pendingSlugs = lookups
            .filter((lookup) => lookup.letterboxdMovieJobId && pendingSlugs.includes(lookup.letterboxdSlug))
            .map((lookup) => lookup.letterboxdSlug);
          if (pendingSlugs.length === 0) return;
          await wait(2_000, controller.signal);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    })();

    return () => controller.abort();
  }, [letterboxdMoviesEndpoint, pendingOverlapKey]);

  const duplicates = duplicateSelectionIds(slots);
  const completedSlots = slots.filter((slot) => slot.movie !== null).length;
  const allSlotsFilled = completedSlots === selectionsPerUser;
  const submissionReady = allSlotsFilled && duplicates.size === 0 && confirmed;
  const acceptedDuplicateWarnings = state.result?.duplicateWarnings.length ?? 0;

  function updateSearch(
    slotIndex: number,
    update: (current: SlotSearchState) => SlotSearchState,
  ) {
    setSearches((current) => current.map(
      (search, index) => index === searchStateIndex(slotIndex) ? update(search) : search,
    ));
  }

  function updateQuery(slotIndex: number, query: string) {
    updateSearch(slotIndex, (search) => ({
      ...search,
      query,
      status: query.trim() ? "idle" : search.results.length > 0 ? "success" : "idle",
      message: undefined,
    }));
  }

  async function searchMovies(slotIndex: number, page = 1) {
    const current = searches[searchStateIndex(slotIndex)];
    const query = (page === 1 ? current?.query : current?.submittedQuery || current?.query)?.trim()
      ?? "";
    if (query.length < 2) {
      updateSearch(slotIndex, (search) => ({
        ...search,
        status: "error",
        message: "Enter at least two characters to search.",
      }));
      return;
    }

    controllers.current.get(slotIndex)?.abort();
    const controller = new AbortController();
    controllers.current.set(slotIndex, controller);
    updateSearch(slotIndex, (search) => ({
      ...search,
      status: "loading",
      message: undefined,
      page,
    }));

    try {
      const url = new URL(searchEndpoint, window.location.origin);
      url.searchParams.set("q", query);
      url.searchParams.set("page", String(page));
      const response = await fetch(url, {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          searchErrorMessage(body) ?? "Movie search is unavailable. Please try again.",
        );
      }

      const parsed = parseMovieSearchResponse(body);
      if (!parsed) {
        throw new Error("Movie search returned an unexpected response.");
      }

      updateSearch(slotIndex, (search) => ({
        ...search,
        submittedQuery: query,
        results: parsed.results.map((movie) => enrichMovie(movie, watchedRef.current)),
        page: parsed.page,
        totalPages: parsed.totalPages,
        status: parsed.results.length > 0 ? "success" : "empty",
        message: parsed.results.length > 0
          ? undefined
          : `No movies found for “${query}”. Try another title.`,
      }));
    } catch (error) {
      if (controller.signal.aborted) return;
      updateSearch(slotIndex, (search) => ({
        ...search,
        status: "error",
        message: error instanceof Error
          ? error.message
          : "Movie search is unavailable. Please try again.",
      }));
    } finally {
      if (controllers.current.get(slotIndex) === controller) {
        controllers.current.delete(slotIndex);
      }
    }
  }

  function chooseMovie(slotIndex: number, movie: SelectionMovie) {
    setSlots((current) => current.map(
      (slot) => slot.slotIndex === slotIndex
        ? { ...slot, movie: enrichMovie(movie, watchedRef.current) }
        : slot,
    ));
    updateSearch(slotIndex, (search) => ({
      ...search,
      editing: false,
    }));
    setConfirmed(false);
  }

  function editSlot(slotIndex: number) {
    updateSearch(slotIndex, (search) => ({
      ...search,
      editing: true,
    }));
  }

  function removeMovie(slotIndex: number) {
    setSlots((current) => current.map(
      (slot) => slot.slotIndex === slotIndex ? { ...slot, movie: null } : slot,
    ));
    updateSearch(slotIndex, (search) => ({
      ...search,
      editing: true,
    }));
    setConfirmed(false);
  }

  if (state.status === "success") {
    return (
      <section className="panel selection-complete-panel" aria-labelledby="selection-complete-heading">
        <span className="selection-complete-mark" aria-hidden="true">✓</span>
        <div>
          <span className="eyebrow">Selections submitted</span>
          <h2 id="selection-complete-heading">Your picks are locked in</h2>
          <p>{state.message ?? "Waiting for everyone else to finish choosing."}</p>
          {acceptedDuplicateWarnings > 0 ? (
            <p className="selection-post-submit-warning">
              {acceptedDuplicateWarnings} of your{" "}
              {acceptedDuplicateWarnings === 1 ? "movies was" : "movies were"} also
              chosen by another participant. The duplicate nominations were accepted.
            </p>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="panel selection-panel" aria-labelledby="selection-heading">
      <div className="selection-intro">
        <div>
          <span className="eyebrow">Your movie picks</span>
          <h2 id="selection-heading">Fill every selection slot</h2>
          <p>
            Search TMDB through Cineclub, then choose one movie for each slot.
            You can start picking before the host locks the roster.
            Warnings are helpful context unless you pick the same movie twice.
          </p>
        </div>
        <span className="selection-count" aria-live="polite">
          {completedSlots} / {selectionsPerUser} filled
        </span>
      </div>

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
        <input
          name="selections"
          type="hidden"
          value={serializeSelectionSubmission(slots)}
        />

        <ol className="selection-slot-list">
          {slots.map((slot) => {
            const search = searches[searchStateIndex(slot.slotIndex)];
            const slotHeadingId = `selection-slot-${slot.slotIndex}`;
            const duplicate = Boolean(
              slot.movie && duplicates.has(slot.movie.tmdbId),
            );
            const showSuggestions = search.editing
              && !search.query.trim()
              && suggestions.length > 0;

            return (
              <li className="selection-slot" key={slot.slotIndex}>
                <div className="selection-slot-heading">
                  <div>
                    <span>Slot {slot.slotIndex}</span>
                    <h3 id={slotHeadingId}>
                      {slot.movie ? slot.movie.title : "Choose a movie"}
                    </h3>
                  </div>
                  {slot.movie ? (
                    <span className={`selection-slot-status${duplicate ? " is-warning" : ""}`}>
                      {duplicate ? "Needs attention" : "Filled"}
                    </span>
                  ) : (
                    <span className="selection-slot-status">Open</span>
                  )}
                </div>

                {slot.movie ? (
                  <div className="selected-movie">
                    <MovieDetails movie={slot.movie} sameUserDuplicate={duplicate} />
                    <div className="selection-card-actions">
                      <button
                        className="button button-secondary button-compact"
                        type="button"
                        onClick={() => editSlot(slot.slotIndex)}
                      >
                        Replace
                      </button>
                      <button
                        className="text-button remove-selection"
                        type="button"
                        onClick={() => removeMovie(slot.slotIndex)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : null}

                {search.editing ? (
                  <div
                    className="movie-search"
                    role="search"
                    aria-labelledby={slotHeadingId}
                  >
                    <label htmlFor={`movie-search-${slot.slotIndex}`}>
                      Search TMDB for slot {slot.slotIndex}
                    </label>
                    <div className="movie-search-controls">
                      <input
                        id={`movie-search-${slot.slotIndex}`}
                        value={search.query}
                        onChange={(event) => updateQuery(slot.slotIndex, event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void searchMovies(slot.slotIndex);
                          }
                        }}
                        placeholder="Start with a movie title"
                        autoComplete="off"
                        aria-describedby={`movie-search-status-${slot.slotIndex}`}
                      />
                      <button
                        className="button button-secondary button-compact"
                        disabled={search.status === "loading"}
                        type="button"
                        onClick={() => void searchMovies(slot.slotIndex)}
                      >
                        {search.status === "loading" ? "Searching…" : "Search"}
                      </button>
                    </div>

                    <div
                      id={`movie-search-status-${slot.slotIndex}`}
                      className={`movie-search-status is-${search.status}`}
                      role={search.status === "error" ? "alert" : "status"}
                      aria-live="polite"
                    >
                      {search.status === "loading" ? (
                        <><span className="status-spinner" aria-hidden="true" /> Searching movies…</>
                      ) : search.message ?? ""}
                    </div>

                    {showSuggestions ? (
                      <div className="overlap-suggestions">
                        <h4>Watchlist overlap suggestions</h4>
                        <p>Server-provided ideas shared across your crew’s watchlists.</p>
                        <ul className="movie-result-list">
                          {suggestions.map((movie) => (
                            <li key={movie.tmdbId}>
                              <TmdbResultLink movie={movie}>
                                <MovieDetails
                                  movie={movie}
                                  sameUserDuplicate={slots.some(
                                    (candidate) => candidate.slotIndex !== slot.slotIndex
                                      && candidate.movie?.tmdbId === movie.tmdbId,
                                  )}
                                />
                              </TmdbResultLink>
                              <button
                                className="button button-secondary button-compact"
                                type="button"
                                onClick={() => chooseMovie(slot.slotIndex, movie)}
                              >
                                Choose
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {search.results.length > 0 && search.status !== "error" ? (
                      <>
                        <ul className="movie-result-list" aria-label="Movie search results">
                          {search.results.map((movie) => {
                            const selectedElsewhere = slots.some(
                              (candidate) => candidate.slotIndex !== slot.slotIndex
                                && candidate.movie?.tmdbId === movie.tmdbId,
                            );
                            return (
                              <li key={movie.tmdbId}>
                                <TmdbResultLink movie={movie}>
                                  <MovieDetails
                                    movie={movie}
                                    sameUserDuplicate={selectedElsewhere}
                                  />
                                </TmdbResultLink>
                                <button
                                  className="button button-secondary button-compact"
                                  type="button"
                                  onClick={() => chooseMovie(slot.slotIndex, movie)}
                                >
                                  {slot.movie ? "Use as replacement" : "Choose"}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                        {search.totalPages > 1 ? (
                          <div className="movie-search-pagination">
                            <button
                              className="button button-secondary button-compact"
                              type="button"
                              disabled={search.page <= 1 || search.status === "loading"}
                              onClick={() => void searchMovies(slot.slotIndex, search.page - 1)}
                            >
                              Previous
                            </button>
                            <span aria-live="polite">
                              Page {search.page} of {search.totalPages}
                            </span>
                            <button
                              className="button button-secondary button-compact"
                              type="button"
                              disabled={
                                search.page >= search.totalPages
                                || search.status === "loading"
                              }
                              onClick={() => void searchMovies(slot.slotIndex, search.page + 1)}
                            >
                              Next
                            </button>
                          </div>
                        ) : null}
                      </>
                    ) : null}

                    {slot.movie ? (
                      <button
                        className="text-button cancel-replacement"
                        type="button"
                        onClick={() => updateSearch(slot.slotIndex, (current) => ({
                          ...current,
                          editing: false,
                        }))}
                      >
                        Keep {slot.movie.title}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>

        {overlap.eligible ? (
          <div className="overlap-suggestions overlap-suggestions-panel">
            <h3>Watchlist overlap suggestions</h3>
            <p>Shared watchlist picks for this room, ranked by Watchboxd overlap.</p>
            {overlap.status === "pending" && overlap.suggestions.length === 0 ? (
              <p className="overlap-suggestions-status" role="status">
                Loading shared watchlist picks…
              </p>
            ) : overlap.suggestions.length === 0 ? (
              <p className="overlap-suggestions-status">
                No shared watchlist movies yet.
              </p>
            ) : (
              <ul className="overlap-suggestion-list">
                {overlap.suggestions.map((suggestion) => {
                  const selectable = overlapToSelectionMovie(suggestion);
                  return (
                    <li key={suggestion.letterboxdSlug ?? suggestion.letterboxdUrl}>
                      <a
                        className="overlap-suggestion-link"
                        href={suggestion.letterboxdUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open ${suggestion.title} on Letterboxd`}
                      >
                        <MoviePoster
                          movie={{
                            title: suggestion.title,
                            posterUrl: suggestion.posterUrl,
                            posterPath: suggestion.posterPath,
                          }}
                        />
                        <span className="overlap-suggestion-copy">
                          <strong>{suggestion.title}</strong>
                          {suggestion.releaseYear ? <span>{suggestion.releaseYear}</span> : null}
                        </span>
                        <RatingMarks letterboxdRating={suggestion.letterboxdRating} />
                        {suggestion.presentFor.length > 0 ? (
                          <span className="overlap-avatars" title={suggestion.presentFor.map((u) => u.displayName || u.username).join(", ")}>
                            {suggestion.presentFor.slice(0, 3).map((user) => (
                              <span key={user.username} className="overlap-avatar">
                                {user.avatarUrl ? (
                                  <img src={user.avatarUrl} alt={user.displayName || user.username} />
                                ) : (
                                  <span className="overlap-avatar-fallback">{(user.displayName || user.username).charAt(0).toUpperCase()}</span>
                                )}
                              </span>
                            ))}
                            {suggestion.presentFor.length > 3 ? (
                              <span className="overlap-avatar overlap-avatar-more">+{suggestion.presentFor.length - 3}</span>
                            ) : null}
                          </span>
                        ) : null}
                      </a>
                      {selectable ? (
                        <button
                          className="button button-secondary button-compact"
                          type="button"
                          onClick={() => {
                            const openSlot = slots.find((slot) => slot.movie === null);
                            if (openSlot) chooseMovie(openSlot.slotIndex, selectable);
                          }}
                          disabled={slots.every((slot) => slot.movie !== null)}
                        >
                          Choose
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}

        <div className="selection-submit">
          <label className="selection-confirmation">
            <input
              checked={confirmed}
              disabled={!allSlotsFilled || duplicates.size > 0 || pending}
              name="confirmed"
              required
              type="checkbox"
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              <strong>Lock these selections permanently</strong>
              <small>
                I understand I cannot replace or remove movies after submitting.
              </small>
            </span>
          </label>
          {!allSlotsFilled ? (
            <p className="selection-submit-hint">
              Fill {selectionsPerUser - completedSlots} more{" "}
              {selectionsPerUser - completedSlots === 1 ? "slot" : "slots"} to continue.
            </p>
          ) : duplicates.size > 0 ? (
            <p className="selection-submit-hint is-error">
              Replace duplicate movies before submitting.
            </p>
          ) : null}
          <ActionMessage status={state.status} message={state.message} />
          <button
            className="button button-primary"
            disabled={!submissionReady || pending}
            type="submit"
          >
            {pending ? "Submitting all selections…" : "Submit all selections"}
          </button>
        </div>
      </form>
    </section>
  );
}
