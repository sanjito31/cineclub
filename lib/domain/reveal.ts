import { RoomPhase } from "@/app/generated/prisma/enums";
import { DomainError } from "@/lib/auth/errors";

export const REVEAL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export type RevealErrorCode =
  | "ROOM_NOT_FOUND"
  | "WRONG_PHASE"
  | "NOTHING_TO_REVEAL"
  | "COOLDOWN_UNCONFIRMED";

export class RevealError extends DomainError {
  readonly code: RevealErrorCode;

  constructor(code: RevealErrorCode, message: string) {
    super(message);
    this.name = "RevealError";
    this.code = code;
  }
}

export type RevealScheduleInput = {
  roomMovieId: string;
  isFinalist: boolean;
  finalOrder: number | null;
};

export type RevealResultRow = {
  roomMovieId: string;
  isFinalist: boolean;
  finalOrder: number | null;
  scheduledRevealAt: Date | null;
  revealedAt: Date | null;
};

export type RevealMovieDetails = {
  title: string;
  releaseYear: number | null;
  posterPath: string | null;
  letterboxdRating: number | null;
  letterboxdSlug: string | null;
  nominators: readonly {
    participantId: string;
    displayName: string;
  }[];
};

export type RevealedMovieView = {
  roomMovieId: string;
  title: string;
  releaseYear: number | null;
  posterPath: string | null;
  letterboxdRating: number | null;
  letterboxdSlug: string | null;
  nominators: readonly {
    participantId: string;
    displayName: string;
  }[];
  revealedAt: string;
  revealPosition: number;
};

export type NextRevealView = {
  revealPosition: number;
  cooldownEndsAt: string;
  isOnCooldown: boolean;
};

export type SpoilerSafeRevealView = {
  phase: RoomPhase;
  totalFinalists: number;
  revealedCount: number;
  remainingCount: number;
  revealed: RevealedMovieView[];
  nextReveal: NextRevealView | null;
};

function byFinalOrder(left: RevealResultRow, right: RevealResultRow) {
  return (left.finalOrder ?? Number.POSITIVE_INFINITY)
    - (right.finalOrder ?? Number.POSITIVE_INFINITY);
}

export function scheduledRevealAtForFinalist(
  finalizedAt: Date,
  finalOrder: number,
) {
  return new Date(finalizedAt.getTime() + (finalOrder - 1) * REVEAL_COOLDOWN_MS);
}

export function scheduleFinalistReveals(
  results: readonly RevealScheduleInput[],
  finalizedAt: Date,
): Readonly<Record<string, Date | null>> {
  return Object.fromEntries(
    results.map((result) => [
      result.roomMovieId,
      result.isFinalist && result.finalOrder != null && result.finalOrder >= 1
        ? scheduledRevealAtForFinalist(finalizedAt, result.finalOrder)
        : null,
    ]),
  );
}

export function finalistRows<T extends RevealResultRow>(results: readonly T[]) {
  return results
    .filter((result) => result.isFinalist)
    .slice()
    .sort(byFinalOrder);
}

export function nextUnrevealedFinalist(results: readonly RevealResultRow[]) {
  return finalistRows(results).find((result) => result.revealedAt === null) ?? null;
}

export function lastRevealedFinalist(results: readonly RevealResultRow[]) {
  return finalistRows(results)
    .filter((result) => result.revealedAt !== null)
    .at(-1) ?? null;
}

export function revealCooldownEndsAt(input: {
  scheduledRevealAt: Date | null;
  previousRevealedAt: Date | null;
}) {
  const candidates: number[] = [];
  if (input.scheduledRevealAt) {
    candidates.push(input.scheduledRevealAt.getTime());
  }
  if (input.previousRevealedAt) {
    candidates.push(input.previousRevealedAt.getTime() + REVEAL_COOLDOWN_MS);
  }
  if (candidates.length === 0) {
    return null;
  }
  return new Date(Math.max(...candidates));
}

export function isRevealOnCooldown(cooldownEndsAt: Date | null, now: Date) {
  return cooldownEndsAt !== null && now.getTime() < cooldownEndsAt.getTime();
}

export function assertRevealAllowed(input: {
  cooldownEndsAt: Date | null;
  now: Date;
  confirmEarlyReveal: boolean;
}) {
  if (!isRevealOnCooldown(input.cooldownEndsAt, input.now) || input.confirmEarlyReveal) {
    return;
  }

  throw new RevealError(
    "COOLDOWN_UNCONFIRMED",
    "Revealing now skips the 24-hour pause between movies. Confirm to continue.",
  );
}

export function buildSpoilerSafeRevealView(input: {
  phase: RoomPhase;
  now: Date;
  results: readonly (RevealResultRow & { movie?: RevealMovieDetails | null })[];
}): SpoilerSafeRevealView {
  const finalists = finalistRows(input.results);
  const revealed = finalists.flatMap((result) => {
    if (!result.revealedAt || result.finalOrder == null) return [];
    const movie = result.movie;
    if (!movie) {
      throw new DomainError("Revealed movies must include their public details.");
    }

    return [{
      roomMovieId: result.roomMovieId,
      title: movie.title,
      releaseYear: movie.releaseYear,
      posterPath: movie.posterPath,
      letterboxdRating: movie.letterboxdRating,
      letterboxdSlug: movie.letterboxdSlug,
      nominators: movie.nominators,
      revealedAt: result.revealedAt.toISOString(),
      revealPosition: result.finalOrder,
    } satisfies RevealedMovieView];
  });

  const next = nextUnrevealedFinalist(finalists);
  const previous = lastRevealedFinalist(finalists);
  const cooldownEndsAt = next
    ? revealCooldownEndsAt({
        scheduledRevealAt: next.scheduledRevealAt,
        previousRevealedAt: previous?.revealedAt ?? null,
      })
    : null;

  return {
    phase: input.phase,
    totalFinalists: finalists.length,
    revealedCount: revealed.length,
    remainingCount: finalists.length - revealed.length,
    revealed,
    nextReveal: next && next.finalOrder != null && cooldownEndsAt
      ? {
          revealPosition: next.finalOrder,
          cooldownEndsAt: cooldownEndsAt.toISOString(),
          isOnCooldown: isRevealOnCooldown(cooldownEndsAt, input.now),
        }
      : next && next.finalOrder != null
        ? {
            revealPosition: next.finalOrder,
            cooldownEndsAt: input.now.toISOString(),
            isOnCooldown: false,
          }
      : null,
  };
}
