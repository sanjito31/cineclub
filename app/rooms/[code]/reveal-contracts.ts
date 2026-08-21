import { RoomPhase } from "@/app/generated/prisma/enums";
import {
  moviePosterSrc,
  tmdbPosterUrl,
} from "@/app/rooms/[code]/selection-contracts";
import { letterboxdFilmUrl } from "@/app/rooms/[code]/voting-contracts";
import type {
  NextRevealView,
  RevealedMovieView,
} from "@/lib/domain/reveal";

export { letterboxdFilmUrl, moviePosterSrc, tmdbPosterUrl };

export type RevealClientMovie = RevealedMovieView & {
  posterUrl: string | null;
  letterboxdUrl: string | null;
};

export type RevealClientContext = {
  roomId: string;
  code: string;
  name: string;
  phase: RoomPhase;
  isOwner: boolean;
  totalFinalists: number;
  revealedCount: number;
  remainingCount: number;
  revealed: RevealClientMovie[];
  nextReveal: NextRevealView | null;
};

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRoomPhase(value: unknown): value is RoomPhase {
  return (
    value === "SELECTION"
    || value === "VOTING"
    || value === "FINALIZING"
    || value === "REVEAL"
    || value === "COMPLETE"
  );
}

export function tmdbRevealPosterUrl(posterPath: string) {
  return `https://image.tmdb.org/t/p/w342${posterPath}`;
}

export function revealPosterSrc(movie: {
  posterPath?: string | null;
  posterUrl?: string | null;
}) {
  if (movie.posterUrl) return movie.posterUrl;
  if (movie.posterPath) return tmdbRevealPosterUrl(movie.posterPath);
  return moviePosterSrc(movie);
}

export function formatNominatorList(
  nominators: readonly { displayName: string }[],
) {
  const names = nominators.map((nominator) => nominator.displayName).filter(Boolean);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

function toClientMovie(movie: RevealedMovieView): RevealClientMovie {
  return {
    ...movie,
    posterUrl: revealPosterSrc(movie),
    letterboxdUrl: letterboxdFilmUrl(movie.letterboxdSlug),
  };
}

export function toRevealClientContext(value: {
  roomId: string;
  code: string;
  name: string;
  phase: RoomPhase;
  isOwner: boolean;
  totalFinalists: number;
  revealedCount: number;
  remainingCount: number;
  revealed: RevealedMovieView[];
  nextReveal: NextRevealView | null;
}): RevealClientContext {
  return {
    roomId: value.roomId,
    code: value.code,
    name: value.name,
    phase: value.phase,
    isOwner: value.isOwner,
    totalFinalists: value.totalFinalists,
    revealedCount: value.revealedCount,
    remainingCount: value.remainingCount,
    revealed: value.revealed.map(toClientMovie),
    nextReveal: value.nextReveal,
  };
}

function parseNominator(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const participantId = optionalString(record.participantId);
  const displayName = optionalString(record.displayName);
  if (!participantId || !displayName) return null;
  return { participantId, displayName };
}

function parseRevealedMovie(value: unknown): RevealedMovieView | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const roomMovieId = optionalString(record.roomMovieId);
  const title = optionalString(record.title);
  const revealedAt = optionalString(record.revealedAt);
  const revealPosition = optionalNumber(record.revealPosition);
  if (!roomMovieId || !title || !revealedAt || revealPosition == null) return null;

  const nominators = Array.isArray(record.nominators)
    ? record.nominators.map(parseNominator).filter((item): item is NonNullable<typeof item> => item !== null)
    : [];

  return {
    roomMovieId,
    title,
    releaseYear: optionalNumber(record.releaseYear),
    posterPath: optionalString(record.posterPath),
    letterboxdRating: optionalNumber(record.letterboxdRating),
    letterboxdSlug: optionalString(record.letterboxdSlug),
    nominators,
    revealedAt,
    revealPosition,
  };
}

function parseNextReveal(value: unknown): NextRevealView | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const revealPosition = optionalNumber(record.revealPosition);
  const cooldownEndsAt = optionalString(record.cooldownEndsAt);
  if (revealPosition == null || !cooldownEndsAt) return null;
  return {
    revealPosition,
    cooldownEndsAt,
    isOnCooldown: record.isOnCooldown === true,
  };
}

export function parseRevealPayload(value: unknown): RevealClientContext | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!isRoomPhase(record.phase)) return null;

  const roomId = optionalString(record.roomId);
  const code = optionalString(record.code);
  const name = optionalString(record.name);
  const totalFinalists = optionalNumber(record.totalFinalists);
  const revealedCount = optionalNumber(record.revealedCount);
  const remainingCount = optionalNumber(record.remainingCount);
  if (
    !roomId
    || !code
    || !name
    || totalFinalists == null
    || revealedCount == null
    || remainingCount == null
    || typeof record.isOwner !== "boolean"
    || !Array.isArray(record.revealed)
  ) {
    return null;
  }

  return toRevealClientContext({
    roomId,
    code,
    name,
    phase: record.phase,
    isOwner: record.isOwner,
    totalFinalists,
    revealedCount,
    remainingCount,
    revealed: record.revealed
      .map(parseRevealedMovie)
      .filter((movie): movie is RevealedMovieView => movie !== null),
    nextReveal: parseNextReveal(record.nextReveal),
  });
}

export function payloadContainsUnrevealedIdentity(
  payload: unknown,
  secret: string,
) {
  return JSON.stringify(payload).includes(secret);
}
