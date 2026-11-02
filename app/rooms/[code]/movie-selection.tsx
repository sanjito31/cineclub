"use client";

import Image from "next/image";
import { useActionState, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { initialActionState } from "@/app/actions/types";
import { ActionMessage } from "@/app/components/action-message";
import { MovieAgentChat } from "@/app/rooms/[code]/movie-agent-chat";
import {
  applyRatingLookupToMovie, applyWatchedIndexToMovie, createSelectionSlots,
  duplicateSelectionIds, letterboxdMovieUrlFromTmdbId, moviePosterSrc,
  overlapToSelectionMovie, parseLetterboxdMovieLookupsResponse,
  parseMovieRatingsResponse, parseMovieSearchResponse, parseWatchboxdContextResponse,
  serializeSelectionSubmission,
} from "@/app/rooms/[code]/selection-contracts";
import type {
  OverlapSuggestion, SelectionMovie, SelectionSubmissionState, SelectionSlotValue,
  SubmitSelectionsAction, WatchedIndex, WatchedMember,
} from "@/app/rooms/[code]/selection-contracts";
import {
  applyLetterboxdMovieLookupToSuggestion, emptyWatchedIndex,
  filterAndSortOverlapSuggestions, mergeOverlapSuggestion, watchedWarningCopy,
  type OverlapSuggestionSort,
} from "@/lib/domain/watchboxd-selection";
import { pollAsyncResource } from "@/lib/integrations/async-resource";

type SearchStatus = "idle" | "loading" | "success" | "empty" | "error";
type SearchState = {
  query: string; submittedQuery: string; results: SelectionMovie[];
  status: SearchStatus; message?: string; page: number; totalPages: number;
};
type OverlapState = {
  eligible: boolean;
  status: "idle" | "pending" | "ready" | "skipped" | "unavailable";
  suggestions: OverlapSuggestion[];
  page: number;
  totalPages: number;
  total: number;
};
type ParsedWatchboxdContext = NonNullable<ReturnType<typeof parseWatchboxdContextResponse>>;

const PROGRESS_BAR_COLORS = ["#a59723", "#3d8b9c", "#317133", "#8a5389", "#8f1820", "#a8a49c", "#202657"];

const createSearchState = (): SearchState => ({
  query: "", submittedQuery: "", results: [], status: "idle", page: 1, totalPages: 0,
});

function wait(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

function LetterboxdMovieLink({ movie, children }: { movie: SelectionMovie; children: ReactNode }) {
  return (
    <a className="selection-movie-letterboxd-link" href={letterboxdMovieUrlFromTmdbId(movie.tmdbId)}
      target="_blank" rel="noreferrer" aria-label={`Open ${movie.title} on Letterboxd`}>
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

function WatchedAvatars({ members }: { members: WatchedMember[] }) {
  return <span className="watched-avatars" aria-hidden="true">{members.map((member) => member.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img key={member.userId} className="watched-avatar" src={member.avatarUrl} alt="" width={22} height={22} />
  ) : (
    <span key={member.userId} className="watched-avatar is-fallback">
      {member.displayName.slice(0, 1).toUpperCase()}
    </span>
  ))}</span>;
}

function MoviePoster({ movie }: {
  movie: { title: string; posterUrl?: string | null; posterPath?: string | null };
}) {
  const src = moviePosterSrc(movie);
  return src
    ? <Image className="selection-movie-poster" src={src} alt="" width={46} height={69} />
    : <span className="selection-movie-poster is-missing" aria-hidden="true">{movie.title.slice(0, 1).toUpperCase()}</span>;
}

function RatingMarks({ letterboxdRating }: { letterboxdRating?: number | null }) {
  if (letterboxdRating == null) return null;
  return (
    <span className="selection-rating-marks">
      <span className="rating-badge letterboxd-rating"
        aria-label={`Letterboxd rating ${letterboxdRating.toFixed(1)} out of 5`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="rating-badge-logo" src="/letterboxd.png" alt="" width={20} height={20} />
        <span className="rating-badge-value">{letterboxdRating.toFixed(1)}</span>
      </span>
    </span>
  );
}

function MovieDetails({ movie, sameUserDuplicate = false }: {
  movie: SelectionMovie; sameUserDuplicate?: boolean;
}) {
  const watchedCopy = watchedWarningCopy(movie.watchedByMembers);
  return (
    <div className="selection-movie-entry">
      <MoviePoster movie={movie} />
      <div className="selection-movie-details">
        <div className="selection-movie-heading">
          <div><strong>{movie.title}</strong>{movie.releaseYear ? <span>{movie.releaseYear}</span> : null}</div>
          <RatingMarks letterboxdRating={movie.letterboxdRating} />
        </div>
        {movie.overview ? <p className="selection-movie-overview">{movie.overview}</p> : null}
        {movie.suggestionReason ? <p className="selection-suggestion-note">Suggested: {movie.suggestionReason}</p> : null}
        <div className="selection-warnings" aria-live="polite">
          {sameUserDuplicate ? <p className="selection-warning is-blocking">You chose this movie more than once. Remove one copy before submitting.</p> : null}
          {watchedCopy ? (
            <p className="selection-warning watched-warning"><WatchedAvatars members={movie.watchedByMembers} /><span>{watchedCopy}</span></p>
          ) : movie.watchedByCurrentUser ? <p className="selection-warning">You’ve already logged this movie.</p> : null}
          {movie.alreadyNominatedBy.length > 0 ? (
            <p className="selection-warning"><span className="selection-warning-icon" aria-hidden="true">⚠</span>This movie has already been chosen by someone else. Choose another movie.</p>
          ) : null}
          {movie.overlappingParticipants.length > 0 ? <p className="selection-overlap">Watchlist overlap with {movie.overlappingParticipants.join(", ")}.</p> : null}
        </div>
      </div>
    </div>
  );
}

function SelectedCheck({ title }: { title: string }) {
  return <span className="movie-choice-check" aria-label={`${title} selected`} title="Selected">
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l5 5L19 7" /></svg>
  </span>;
}

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function MovieSelection({
  code, roomName, selectionsPerUser, searchEndpoint, watchboxdEndpoint, ratingsEndpoint,
  letterboxdMoviesEndpoint, agentEndpoint, submitSelectionsAction, initialSelections = [],
  hasSubmittedSelections = false,
}: {
  code: string; roomName: string; selectionsPerUser: number; searchEndpoint: string; watchboxdEndpoint: string;
  ratingsEndpoint: string; letterboxdMoviesEndpoint: string; agentEndpoint: string;
  submitSelectionsAction: SubmitSelectionsAction; initialSelections?: SelectionSlotValue[];
  initialSuggestions?: SelectionMovie[];
  hasSubmittedSelections?: boolean;
}) {
  const [state, formAction, pending] = useActionState<SelectionSubmissionState, FormData>(submitSelectionsAction, initialActionState);
  const [slots, setSlots] = useState<SelectionSlotValue[]>(() => {
    const values = createSelectionSlots(selectionsPerUser);
    for (const initial of initialSelections) {
      const index = initial.slotIndex - 1;
      if (index >= 0 && index < values.length) values[index] = initial;
    }
    return values;
  });
  const [search, setSearch] = useState(createSearchState);
  const [searchOpen, setSearchOpen] = useState(false);
  const [overlap, setOverlap] = useState<OverlapState>({
    eligible: false, status: "idle", suggestions: [], page: 1, totalPages: 0, total: 0,
  });
  const [overlapPageLoading, setOverlapPageLoading] = useState(false);
  const [overlapError, setOverlapError] = useState(false);
  const [overlapSort, setOverlapSort] = useState<OverlapSuggestionSort>("rating");
  const [ratingMin, setRatingMin] = useState("");
  const [yearMin, setYearMin] = useState("");
  const [yearMax, setYearMax] = useState("");
  const [includedUsers, setIncludedUsers] = useState<string[]>([]);
  const [controlTray, setControlTray] = useState<"sort" | "filter" | null>(null);
  const [draftSort, setDraftSort] = useState<OverlapSuggestionSort>("rating");
  const [draftRatingMin, setDraftRatingMin] = useState("");
  const [draftYearMin, setDraftYearMin] = useState("");
  const [draftYearMax, setDraftYearMax] = useState("");
  const [draftIncludedUsers, setDraftIncludedUsers] = useState<string[]>([]);
  const [watched, setWatched] = useState<WatchedIndex>(emptyWatchedIndex);
  const searchController = useRef<AbortController | null>(null);
  const overlapPageController = useRef<AbortController | null>(null);
  const searchSectionRef = useRef<HTMLDivElement | null>(null);
  const overlapControlsRef = useRef<HTMLDivElement | null>(null);
  const submitStarted = useRef(false);
  const watchedRef = useRef(watched);
  watchedRef.current = watched;

  useEffect(() => () => {
    searchController.current?.abort();
    overlapPageController.current?.abort();
  }, []);
  useEffect(() => { if (!pending) submitStarted.current = false; }, [pending, state.status]);
  useEffect(() => {
    if (!searchOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!searchSectionRef.current?.contains(event.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [searchOpen]);
  useEffect(() => {
    if (!controlTray) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!overlapControlsRef.current?.contains(event.target as Node)) setControlTray(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [controlTray]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await pollAsyncResource(async ({ signal }) => {
          const response = await fetch(watchboxdEndpoint, { cache: "no-store", credentials: "same-origin", signal });
          const body: unknown = await response.json().catch(() => null);
          const parsed = parseWatchboxdContextResponse(body);
          if (!parsed) return response.status === 202
            ? { status: "pending", retryAfter: 2, jobId: null }
            : { status: "unavailable", reason: "malformed_response" };

          setWatched(parsed.watched);
          setOverlapError(parsed.overlapStatus === "unavailable");
          setOverlap((current) => ({
            eligible: parsed.eligibleForOverlap,
            status: parsed.status === "pending" && parsed.overlapStatus !== "ready" ? "pending" : parsed.overlapStatus,
            suggestions: parsed.suggestions.map((suggestion) => {
              const existing = current.suggestions.find((candidate) =>
                (suggestion.letterboxdSlug && candidate.letterboxdSlug === suggestion.letterboxdSlug)
                || candidate.letterboxdUrl === suggestion.letterboxdUrl);
              return mergeOverlapSuggestion(suggestion, existing);
            }),
            page: parsed.overlapPagination.page,
            totalPages: parsed.overlapPagination.totalPages,
            total: parsed.overlapPagination.total,
          }));
          setSlots((current) => current.map((slot) => ({
            ...slot, movie: slot.movie ? applyWatchedIndexToMovie(slot.movie, parsed.watched) : null,
          })));
          setSearch((current) => ({
            ...current, results: current.results.map((movie) => applyWatchedIndexToMovie(movie, parsed.watched)),
          }));
          if (parsed.status === "pending" || response.status === 202) return {
            status: "pending", retryAfter: parsed.retryAfter, jobId: parsed.pendingJobIds[0] ?? null,
          };
          return { status: "ready", data: parsed };
        }, { signal: controller.signal, maxAttempts: 30, timeoutMs: 90_000, maxDelayMs: 10_000 });
        if (result.status !== "ready" && result.status !== "cancelled") {
          setOverlapError(true);
          setOverlap((current) => ({ ...current, status: "unavailable" }));
        }
      } catch (error) {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        setOverlapError(true);
        setOverlap((current) => ({ ...current, status: "unavailable" }));
      }
    })();
    return () => controller.abort();
  }, [watchboxdEndpoint]);

  const pendingRatingKey = [...new Set([
    ...slots.flatMap((slot) => slot.movie?.letterboxdRatingJobId ? [slot.movie.tmdbId] : []),
    ...search.results.flatMap((movie) => movie.letterboxdRatingJobId ? [movie.tmdbId] : []),
  ])].sort((left, right) => left - right).join(",");

  useEffect(() => {
    if (!pendingRatingKey) return;
    const controller = new AbortController();
    void (async () => {
      try {
        let pendingIds = pendingRatingKey.split(",").map(Number);
        for (let attempt = 0; attempt < 20 && pendingIds.length > 0; attempt += 1) {
          const url = new URL(ratingsEndpoint, window.location.origin);
          url.searchParams.set("tmdbIds", pendingIds.join(","));
          const response = await fetch(url, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
          const ratings = parseMovieRatingsResponse(await response.json().catch(() => null));
          if (!ratings) { await wait(2_000, controller.signal); continue; }
          const byId = new Map(ratings.map((rating) => [rating.tmdbId, rating]));
          setSlots((current) => current.map((slot) => {
            if (!slot.movie) return slot;
            const update = byId.get(slot.movie.tmdbId);
            return update ? { ...slot, movie: applyWatchedIndexToMovie(applyRatingLookupToMovie(slot.movie, update), watchedRef.current) } : slot;
          }));
          setSearch((current) => ({ ...current, results: current.results.map((movie) => {
            const update = byId.get(movie.tmdbId);
            return update ? applyWatchedIndexToMovie(applyRatingLookupToMovie(movie, update), watchedRef.current) : movie;
          }) }));
          pendingIds = ratings.filter((rating) => rating.letterboxdRatingJobId && pendingIds.includes(rating.tmdbId)).map((rating) => rating.tmdbId);
          if (pendingIds.length === 0) return;
          await wait(2_000, controller.signal);
        }
      } catch (error) {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      }
    })();
    return () => controller.abort();
  }, [pendingRatingKey, ratingsEndpoint]);

  const pendingOverlapKey = [...new Set(overlap.suggestions.flatMap((suggestion) =>
    !suggestion.tmdbId && suggestion.letterboxdMovieJobId && suggestion.letterboxdSlug ? [suggestion.letterboxdSlug] : [],
  ))].sort((left, right) => left.localeCompare(right)).join(",");

  useEffect(() => {
    if (!pendingOverlapKey) return;
    const controller = new AbortController();
    void (async () => {
      try {
        let pendingSlugs = pendingOverlapKey.split(",");
        for (let attempt = 0; attempt < 20 && pendingSlugs.length > 0; attempt += 1) {
          const url = new URL(letterboxdMoviesEndpoint, window.location.origin);
          url.searchParams.set("slugs", pendingSlugs.join(","));
          const response = await fetch(url, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
          const lookups = parseLetterboxdMovieLookupsResponse(await response.json().catch(() => null));
          if (!lookups) { await wait(2_000, controller.signal); continue; }
          const bySlug = new Map(lookups.map((lookup) => [lookup.letterboxdSlug.toLowerCase(), lookup]));
          setOverlap((current) => ({ ...current, suggestions: current.suggestions.map((suggestion) => {
            const lookup = suggestion.letterboxdSlug ? bySlug.get(suggestion.letterboxdSlug.toLowerCase()) : undefined;
            return lookup ? applyLetterboxdMovieLookupToSuggestion(suggestion, lookup) : suggestion;
          }) }));
          pendingSlugs = lookups.filter((lookup) => lookup.letterboxdMovieJobId && pendingSlugs.includes(lookup.letterboxdSlug)).map((lookup) => lookup.letterboxdSlug);
          if (pendingSlugs.length === 0) return;
          await wait(2_000, controller.signal);
        }
      } catch (error) {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      }
    })();
    return () => controller.abort();
  }, [letterboxdMoviesEndpoint, pendingOverlapKey]);

  const overlapUsers = useMemo(() => {
    const users = new Map<string, { username: string; label: string }>();
    for (const suggestion of overlap.suggestions) for (const user of suggestion.presentFor) {
      users.set(user.username.toLowerCase(), { username: user.username, label: user.displayName || user.username });
    }
    return [...users.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [overlap.suggestions]);
  const visibleOverlapSuggestions = useMemo(() => filterAndSortOverlapSuggestions(overlap.suggestions, overlapSort, {
    ratingMin: optionalNumber(ratingMin),
    yearMin: optionalNumber(yearMin), yearMax: optionalNumber(yearMax), usernames: includedUsers,
  }), [includedUsers, overlap.suggestions, overlapSort, ratingMin, yearMax, yearMin]);

  const duplicates = duplicateSelectionIds(slots);
  const completedSlots = slots.filter((slot) => slot.movie).length;
  const allSlotsFilled = completedSlots === selectionsPerUser;
  const submissionReady = allSlotsFilled && duplicates.size === 0;
  const acceptedDuplicateWarnings = state.result?.duplicateWarnings.length ?? 0;
  const isSelected = (tmdbId: number) => slots.some((slot) => slot.movie?.tmdbId === tmdbId);

  function updateQuery(query: string) {
    setSearch((current) => ({ ...current, query, status: query.trim() ? "idle" : current.results.length ? "success" : "idle", message: undefined }));
    setSearchOpen(true);
  }

  async function searchMovies(page = 1) {
    const query = (page === 1 ? search.query : search.submittedQuery || search.query).trim();
    setSearchOpen(true);
    if (query.length < 2) {
      setSearch((current) => ({ ...current, status: "error", message: "Enter at least two characters to search." }));
      return;
    }
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setSearch((current) => ({ ...current, status: "loading", message: undefined, page }));
    try {
      const url = new URL(searchEndpoint, window.location.origin);
      url.searchParams.set("q", query); url.searchParams.set("page", String(page));
      const response = await fetch(url, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(searchErrorMessage(body) ?? "Movie search is unavailable. Please try again.");
      const parsed = parseMovieSearchResponse(body);
      if (!parsed) throw new Error("Movie search returned an unexpected response.");
      setSearch((current) => ({ ...current, submittedQuery: query,
        results: parsed.results.map((movie) => applyWatchedIndexToMovie(movie, watchedRef.current)),
        page: parsed.page, totalPages: parsed.totalPages,
        status: parsed.results.length ? "success" : "empty",
        message: parsed.results.length ? undefined : `No movies found for “${query}”. Try another title.`,
      }));
    } catch (error) {
      if (!controller.signal.aborted) setSearch((current) => ({ ...current, status: "error",
        message: error instanceof Error ? error.message : "Movie search is unavailable. Please try again.",
      }));
    } finally { if (searchController.current === controller) searchController.current = null; }
  }

  async function loadOverlapPage(page: number, filters: {
    ratingMin: string;
    yearMin: string;
    yearMax: string;
  } = { ratingMin, yearMin, yearMax }) {
    overlapPageController.current?.abort();
    const controller = new AbortController();
    overlapPageController.current = controller;
    setOverlapPageLoading(true);
    setOverlapError(false);
    try {
      const result = await pollAsyncResource<ParsedWatchboxdContext>(async ({ signal }) => {
        const url = new URL(watchboxdEndpoint, window.location.origin);
        url.searchParams.set("overlapPage", String(page));
        if (filters.ratingMin) url.searchParams.set("ratingMin", filters.ratingMin);
        if (filters.yearMin) url.searchParams.set("yearMin", filters.yearMin);
        if (filters.yearMax) url.searchParams.set("yearMax", filters.yearMax);
        const response = await fetch(url, {
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
        if (response.status === 202 || parsed.status === "pending") {
          return {
            status: "pending",
            retryAfter: parsed.retryAfter,
            jobId: parsed.pendingJobIds[0] ?? null,
          };
        }
        if (parsed.overlapStatus === "unavailable") {
          return { status: "unavailable", reason: "http_error" };
        }
        return { status: "ready", data: parsed };
      }, {
        signal: controller.signal,
        maxAttempts: 30,
        timeoutMs: 90_000,
        maxDelayMs: 10_000,
      });

      if (result.status !== "ready") {
        if (result.status !== "cancelled") setOverlapError(true);
        return;
      }
      const parsed = result.data;
      setOverlap((current) => ({
        eligible: parsed.eligibleForOverlap,
        status: parsed.overlapStatus,
        suggestions: parsed.suggestions.map((suggestion) => {
          const existing = current.suggestions.find((candidate) => (
            (suggestion.letterboxdSlug && candidate.letterboxdSlug === suggestion.letterboxdSlug)
            || candidate.letterboxdUrl === suggestion.letterboxdUrl
          ));
          return mergeOverlapSuggestion(suggestion, existing);
        }),
        page: parsed.overlapPagination.page,
        totalPages: parsed.overlapPagination.totalPages,
        total: parsed.overlapPagination.total,
      }));
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      setOverlapError(true);
    } finally {
      if (overlapPageController.current === controller) overlapPageController.current = null;
      if (!controller.signal.aborted) setOverlapPageLoading(false);
    }
  }

  function chooseMovie(movie: SelectionMovie, closeSearch = false) {
    setSlots((current) => {
      if (current.some((slot) => slot.movie?.tmdbId === movie.tmdbId)) return current;
      const openIndex = current.findIndex((slot) => !slot.movie);
      return openIndex < 0 ? current : current.map((slot, index) => index === openIndex
        ? { ...slot, movie: applyWatchedIndexToMovie(movie, watchedRef.current) } : slot);
    });
    if (closeSearch) {
      setSearchOpen(false);
      setSearch(createSearchState());
    }
  }
  function removeMovie(slotIndex: number) {
    setSlots((current) => current.map((slot) => slot.slotIndex === slotIndex ? { ...slot, movie: null } : slot));
  }
  function toggleDraftIncludedUser(username: string) {
    setDraftIncludedUsers((current) => current.includes(username) ? current.filter((user) => user !== username) : [...current, username]);
  }
  function openSortTray() {
    setDraftSort(overlapSort);
    setControlTray((current) => current === "sort" ? null : "sort");
  }
  function openFilterTray() {
    setDraftRatingMin(ratingMin);
    setDraftYearMin(yearMin);
    setDraftYearMax(yearMax);
    setDraftIncludedUsers(includedUsers);
    setControlTray((current) => current === "filter" ? null : "filter");
  }

  if (state.status === "success" && state.result?.phaseTransitioned) return (
    <section className="panel selection-complete-panel nomination-locked-panel" aria-labelledby="selection-complete-heading">
      <span className="selection-complete-mark" aria-hidden="true">✓</span>
      <div><span className="eyebrow">Selections submitted</span><h2 id="selection-complete-heading">Voting is now open</h2>
        <p>{state.message ?? "Your selections were submitted and the club has moved to voting."}</p>
        {acceptedDuplicateWarnings ? <p className="selection-post-submit-warning">{acceptedDuplicateWarnings} of your movies were also chosen by another participant. The duplicate nominations were accepted.</p> : null}
      </div>
    </section>
  );

  return (
    <section className="panel selection-panel nomination-panel" aria-labelledby="selection-heading">
      <div className="poster-hero">
        <div className="poster-hero-scan" aria-hidden="true" />
        <div className="poster-hero-tagrow">
          <span className="poster-stripe-tag" aria-hidden="true">
            <span /><span /><span /><span /><span />
          </span>
          <div className="poster-club-badge">
            <span className="poster-club-badge-ribbon">{roomName}</span>
            <span className="poster-club-badge-sub">Video Club</span>
          </div>
        </div>

        <div className="poster-progress" role="progressbar" aria-valuenow={completedSlots} aria-valuemin={0} aria-valuemax={selectionsPerUser} aria-label="Selections progress">
          {Array.from({ length: selectionsPerUser }).map((_, i) => (
            <span
              key={i}
              className={`poster-progress-bar${i < completedSlots ? " is-filled" : ""}`}
              style={{ "--bar-color": PROGRESS_BAR_COLORS[i % PROGRESS_BAR_COLORS.length] } as React.CSSProperties}
            />
          ))}
        </div>

        <h2 id="selection-heading" className="poster-headline">
          Choose<br />your movies
        </h2>
        <p className="poster-subhead">
          We&rsquo;ve been there and now we have a <strong>solution</strong>: search the full catalog or browse your group&rsquo;s watchlist, pick {selectionsPerUser}, then lock them in.
        </p>

        <div className="poster-photo-grid" aria-hidden="true">
          <span className="poster-photo poster-photo-a" />
          <span className="poster-photo poster-photo-b" />
          <span className="poster-photo poster-photo-c" />
          <span className="poster-photo poster-photo-d" />
          <span className="poster-photo poster-photo-e" />
        </div>

        <div className="poster-hero-bio">
          <p>Every pick comes with ratings and warnings before you commit &mdash; no blind rentals, no regrets. You&rsquo;re not alone in the queue: the whole club decides together.</p>
        </div>

      </div>

      <form action={formAction} className="selection-form" onSubmit={(event) => {
        if (!submissionReady || pending || submitStarted.current) { event.preventDefault(); return; }
        submitStarted.current = true;
      }}>
        <input name="code" type="hidden" value={code} />
        <input name="selections" type="hidden" value={serializeSelectionSubmission(slots)} />

        {overlap.status === "idle" || overlap.eligible || overlapError ? <section className="overlap-suggestions overlap-suggestions-panel" aria-labelledby="overlap-heading">
          <div className="selection-section-heading overlap-heading"><div><span className="eyebrow">From your group</span><h3 id="overlap-heading">Watchlist overlap suggestions</h3>
            <p>Shared picks, always grouped from most overlap to least overlap.</p></div><span>{overlap.status === "idle" || overlap.status === "pending" ? "Loading" : `${visibleOverlapSuggestions.length} shown`}</span></div>
          {overlap.suggestions.length > 0 ? <div ref={overlapControlsRef} className="overlap-control-toolbar">
            <button className={`overlap-control-pill${controlTray === "sort" ? " is-open" : ""}`} type="button" aria-expanded={controlTray === "sort"} onClick={openSortTray}>
              Sort
            </button>
            <button className={`overlap-control-pill${controlTray === "filter" ? " is-open" : ""}${ratingMin || yearMin || yearMax || includedUsers.length ? " has-value" : ""}`} type="button" aria-expanded={controlTray === "filter"} onClick={openFilterTray}>
              Filter
            </button>
            {controlTray === "sort" ? <div className="overlap-control-popover" role="dialog" aria-label="Sort overlap suggestions">
              <fieldset className="overlap-sort-options"><legend>Sort</legend>
                {([
                  ["rating", "Rating: high to low"],
                  ["runtime", "Runtime: short to long"],
                  ["year", "Year: newest first"],
                  ["alphabetical", "Title: A–Z"],
                ] as const).map(([value, label]) => <label key={value}>
                  <input type="radio" name="overlap-sort" value={value} checked={draftSort === value} onChange={() => setDraftSort(value)} />
                  <span>{label}</span>
                </label>)}
              </fieldset>
              <div className="overlap-popover-actions">
                <button className="text-button" type="button" onClick={() => setControlTray(null)}>Cancel</button>
                <button className="button button-primary button-compact" type="button" onClick={() => { setOverlapSort(draftSort); setControlTray(null); }}>Confirm</button>
              </div>
            </div> : null}
            {controlTray === "filter" ? <div className="overlap-control-popover is-filter" role="dialog" aria-label="Filter overlap suggestions">
              <label className="overlap-filter-field"><span>Minimum rating</span>
                <select value={draftRatingMin} onChange={(event) => setDraftRatingMin(event.target.value)}>
                  <option value="">Any rating</option>
                  {Array.from({ length: 10 }, (_, index) => ((index + 1) / 2).toFixed(1)).map((rating) => <option key={rating} value={rating}>{rating} stars and up</option>)}
                </select>
              </label>
              <div className="overlap-filter-field"><span>Release year</span><div className="overlap-filter-year-range">
                <input aria-label="Earliest year" inputMode="numeric" min="1888" max="2100" placeholder="From" type="number" value={draftYearMin} onChange={(event) => setDraftYearMin(event.target.value)} />
                <span aria-hidden="true">–</span>
                <input aria-label="Latest year" inputMode="numeric" min="1888" max="2100" placeholder="To" type="number" value={draftYearMax} onChange={(event) => setDraftYearMax(event.target.value)} />
              </div></div>
              {overlapUsers.length > 0 ? <div className="overlap-filter-field"><span>Includes</span><div className="overlap-user-filter" role="group" aria-label="People included in overlap">
                <button className={draftIncludedUsers.length === 0 ? "is-active" : ""} type="button" onClick={() => setDraftIncludedUsers([])}>Everyone</button>
                {overlapUsers.map((user) => <button className={draftIncludedUsers.includes(user.username) ? "is-active" : ""} key={user.username} type="button"
                  aria-pressed={draftIncludedUsers.includes(user.username)} onClick={() => toggleDraftIncludedUser(user.username)}>{user.label}</button>)}
              </div></div> : null}
              <div className="overlap-popover-actions">
                <button className="text-button" type="button" onClick={() => setControlTray(null)}>Cancel</button>
                <button className="button button-primary button-compact" type="button" onClick={() => {
                  setRatingMin(draftRatingMin); setYearMin(draftYearMin); setYearMax(draftYearMax);
                  setIncludedUsers(draftIncludedUsers); setControlTray(null);
                  void loadOverlapPage(1, {
                    ratingMin: draftRatingMin,
                    yearMin: draftYearMin,
                    yearMax: draftYearMax,
                  });
                }}>Confirm</button>
              </div>
            </div> : null}
          </div> : null}
          {overlapPageLoading ? <p className="overlap-suggestions-status is-loading" role="status"><span className="status-spinner" aria-hidden="true" /> Loading suggestions…</p> : null}
          {overlapError || overlap.status === "unavailable" ? <p className="overlap-suggestions-status is-warning">Could not get suggestions. Refresh page to try again.</p>
            : (overlap.status === "idle" || overlap.status === "pending") && overlap.suggestions.length === 0 ? <p className="overlap-suggestions-status is-loading" role="status"><span className="status-spinner" aria-hidden="true" /> Loading shared watchlist picks…</p>
            : overlap.suggestions.length === 0 ? <p className="overlap-suggestions-status">No shared watchlist movies yet.</p>
            : visibleOverlapSuggestions.length === 0 ? <p className="overlap-suggestions-status">No suggestions match these filters.</p>
            : <ul className="overlap-suggestion-list">{visibleOverlapSuggestions.map((suggestion) => {
              const selectable = overlapToSelectionMovie(suggestion);
              const selected = selectable ? isSelected(selectable.tmdbId) : false;
              return <li key={suggestion.letterboxdSlug ?? suggestion.letterboxdUrl}>
                <a className="overlap-suggestion-link" href={suggestion.letterboxdUrl} target="_blank" rel="noreferrer" aria-label={`Open ${suggestion.title} on Letterboxd`}>
                  <MoviePoster movie={suggestion} /><span className="overlap-suggestion-copy"><strong>{suggestion.title}</strong><span className="overlap-suggestion-facts">
                    {suggestion.releaseYear ? <span>{suggestion.releaseYear}</span> : null}{suggestion.runtimeMinutes ? <span>{suggestion.runtimeMinutes} min</span> : null}{suggestion.overlapCount ? <span>{suggestion.overlapCount} watchlists</span> : null}
                  </span></span><span className="overlap-suggestion-meta"><RatingMarks letterboxdRating={suggestion.letterboxdRating} />
                    {suggestion.presentFor.length > 0 ? <span className="overlap-avatars" title={suggestion.presentFor.map((user) => user.displayName || user.username).join(", ")}>
                      {suggestion.presentFor.slice(0, 3).map((user) => <span key={user.username} className="overlap-avatar">{user.avatarUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={user.avatarUrl} alt={user.displayName || user.username} />
                        : <span className="overlap-avatar-fallback">{(user.displayName || user.username).charAt(0).toUpperCase()}</span>}</span>)}
                      {suggestion.presentFor.length > 3 ? <span className="overlap-avatar overlap-avatar-more">+{suggestion.presentFor.length - 3}</span> : null}
                    </span> : null}
                  </span>
                </a>
                {selected ? <SelectedCheck title={suggestion.title} /> : selectable ? <button className="button button-secondary button-compact" type="button" onClick={() => chooseMovie(selectable)} disabled={allSlotsFilled}>Choose</button> : null}
              </li>;
            })}</ul>}
          {overlap.totalPages > 1 ? <div className="overlap-pagination" aria-label="Overlap suggestion pages">
            <button className="button button-secondary button-compact" type="button" disabled={overlap.page <= 1 || overlapPageLoading} onClick={() => void loadOverlapPage(overlap.page - 1)}>Prev</button>
            <span aria-live="polite">Page {overlap.page} of {overlap.totalPages}</span>
            <button className="button button-secondary button-compact" type="button" disabled={overlap.page >= overlap.totalPages || overlapPageLoading} onClick={() => void loadOverlapPage(overlap.page + 1)}>Next</button>
          </div> : null}
        </section> : null}

        <MovieAgentChat endpoint={agentEndpoint} renderMovie={(movie) => <>
          <LetterboxdMovieLink movie={movie}><MovieDetails movie={movie} /></LetterboxdMovieLink>
          {isSelected(movie.tmdbId) ? <SelectedCheck title={movie.title} /> : <button className="button button-secondary button-compact" type="button" onClick={() => chooseMovie(movie)} disabled={allSlotsFilled}>Choose</button>}
        </>} />

        <section className="selected-selections" aria-labelledby="selected-selections-heading">
          <div className="selection-section-heading"><div><span id="selected-selections-heading" className="eyebrow">Find your movie</span></div><span>{allSlotsFilled ? "All choices filled" : `${selectionsPerUser - completedSlots} remaining`}</span></div>
          {completedSlots === 0 ? <div className="selected-selections-empty">Your choices will appear here as you add them.</div>
            : <ol className="selected-selections-grid">{slots.flatMap((slot) => slot.movie ? [{ slot, movie: slot.movie }] : []).map(({ slot, movie }, ticketIndex) => {
              const serial = String((movie.tmdbId * 48271) % 900000 + 100000);
              return <li key={slot.slotIndex} className="selection-ticket-wrap">
                <div className={`selection-ticket ticket-color-${(ticketIndex % 6) + 1}`}>
                  <span className="selection-ticket-serial selection-ticket-serial-left" aria-hidden="true">{serial}</span>
                  <div className="selection-ticket-inner">
                    <div className="selection-ticket-head">★★★ CINECLUB ★★★</div>
                    <LetterboxdMovieLink movie={movie}><span className="selection-ticket-title">{movie.title}</span></LetterboxdMovieLink>
                    {movie.releaseYear ? <span className="selection-ticket-year">{movie.releaseYear}</span> : null}
                    <span className="selection-ticket-club">★ {roomName} ★</span>
                  </div>
                  <span className="selection-ticket-serial selection-ticket-serial-right" aria-hidden="true">{serial}</span>
                </div>
                <button className="text-button selection-ticket-remove" type="button" onClick={() => removeMovie(slot.slotIndex)}>
                  <span className="sr-only">Remove movie</span>
                  <span aria-hidden="true">−</span>
                </button>
              </li>;
            })}</ol>}

        <div ref={searchSectionRef} className="selection-search-section" {...(allSlotsFilled ? {} : { role: "search", "aria-label": "Search movies" })}>
          {allSlotsFilled ? (
            <div className="selection-submit">
              {duplicates.size > 0 ? <p className="selection-submit-hint is-error">Remove duplicate movies before submitting.</p> : null}
              <ActionMessage status={state.status} message={state.message} />
              <button className="button button-primary selection-submit-button" disabled={!submissionReady || pending} type="submit">{pending ? "Saving selections…" : hasSubmittedSelections || state.status === "success" ? "Update selections" : "Submit selections"}</button>
            </div>
          ) : (
            <>
          <label className="sr-only" htmlFor="unified-movie-search">Search movies</label>
          <div className="movie-search-controls">
            <div className="movie-search-input-wrap">
              <span className="movie-search-filmtext movie-search-filmtext-top-left" aria-hidden="true">18A</span>
              <span className="movie-search-filmtext movie-search-filmtext-top-right" aria-hidden="true">S-200</span>
              <input id="unified-movie-search" value={search.query} onChange={(event) => updateQuery(event.target.value)}
                onFocus={() => setSearchOpen(true)} onKeyDown={(event) => {
                  if (event.key === "Enter") { event.preventDefault(); void searchMovies(); }
                  else if (event.key === "Escape") { setSearchOpen(false); event.currentTarget.blur(); }
                }} placeholder="Search by movie title" autoComplete="off" role="combobox" aria-autocomplete="list" aria-controls="movie-search-tray" aria-expanded={searchOpen} />
              <span className="movie-search-fake-caret" aria-hidden="true">I</span>
              <span className="movie-search-filmtext movie-search-filmtext-bottom-left" aria-hidden="true">19</span>
              <span className="movie-search-filmtext movie-search-filmtext-bottom-right" aria-hidden="true">F85</span>
              <button className="button button-secondary button-compact movie-search-submit" disabled={search.status === "loading"} type="button" onClick={() => void searchMovies()}>
                Go
              </button>
            </div>
          </div>
          {searchOpen && (search.status !== "idle" || search.results.length > 0) ? (
            <div id="movie-search-tray" className="movie-search-tray">
              <div className={`movie-search-status is-${search.status}`} role={search.status === "error" ? "alert" : "status"} aria-live="polite">
                {search.status === "loading" ? <><span className="status-spinner" aria-hidden="true" /> Searching movies…</> : search.message ?? ""}
              </div>
              {search.results.length > 0 && search.status !== "error" ? <>
                <ul className="movie-result-list" aria-label="Movie search results">{search.results.map((movie) => {
                  const selected = isSelected(movie.tmdbId);
                  return <li key={movie.tmdbId}><LetterboxdMovieLink movie={movie}><MovieDetails movie={movie} /></LetterboxdMovieLink>
                    {selected ? <SelectedCheck title={movie.title} /> : <button className="button button-secondary button-compact" type="button" onClick={() => chooseMovie(movie, true)} disabled={allSlotsFilled}>Choose</button>}
                  </li>;
                })}</ul>
                {search.totalPages > 1 ? <div className="movie-search-pagination">
                  <button className="button button-secondary button-compact" type="button" disabled={search.page <= 1 || search.status === "loading"} onClick={() => void searchMovies(search.page - 1)}>Previous</button>
                  <span>Page {search.page} of {search.totalPages}</span>
                  <button className="button button-secondary button-compact" type="button" disabled={search.page >= search.totalPages || search.status === "loading"} onClick={() => void searchMovies(search.page + 1)}>Next</button>
                </div> : null}
              </> : null}
            </div>
          ) : null}
            </>
          )}
        </div>
        </section>
      </form>
    </section>
  );
}
