import { FinalistOrdering } from "@/app/generated/prisma/enums";
import { DomainError } from "@/lib/auth/errors";

export { FinalistOrdering };

export const DEFAULT_FINALIST_ORDERING = FinalistOrdering.RANKED_CHOICE_FORWARD;

export type FinalistForOrdering = {
  roomMovieId: string;
  aggregateRank: number;
  tieBreakRandom: number;
};

export type FinalistOrderingStrategy = {
  id: FinalistOrdering;
  label: string;
  shortLabel: string;
  description: string;
  orderFinalists: (movies: readonly FinalistForOrdering[]) => string[];
};

function byMovieId(left: FinalistForOrdering, right: FinalistForOrdering) {
  return left.roomMovieId.localeCompare(right.roomMovieId);
}

function orderByReverseRankedChoice(movies: readonly FinalistForOrdering[]) {
  return [...movies]
    .sort((left, right) => {
      if (left.aggregateRank !== right.aggregateRank) {
        return right.aggregateRank - left.aggregateRank;
      }
      return byMovieId(left, right);
    })
    .map((movie) => movie.roomMovieId);
}

function orderByRankedChoiceForward(movies: readonly FinalistForOrdering[]) {
  return [...movies]
    .sort((left, right) => {
      if (left.aggregateRank !== right.aggregateRank) {
        return left.aggregateRank - right.aggregateRank;
      }
      return byMovieId(left, right);
    })
    .map((movie) => movie.roomMovieId);
}

function orderByRandom(movies: readonly FinalistForOrdering[]) {
  return [...movies]
    .sort((left, right) => {
      if (left.tieBreakRandom !== right.tieBreakRandom) {
        return left.tieBreakRandom - right.tieBreakRandom;
      }
      return byMovieId(left, right);
    })
    .map((movie) => movie.roomMovieId);
}

export const finalistOrderingStrategies: Readonly<
  Record<FinalistOrdering, FinalistOrderingStrategy>
> = {
  [FinalistOrdering.RANKED_CHOICE_FORWARD]: {
    id: FinalistOrdering.RANKED_CHOICE_FORWARD,
    label: "Ranked choice",
    shortLabel: "Winner first",
    description:
      "Reveal follows the vote ranking. The highest-ranked finalist is first.",
    orderFinalists: orderByRankedChoiceForward,
  },
  [FinalistOrdering.RANKED_CHOICE]: {
    id: FinalistOrdering.RANKED_CHOICE,
    label: "Reverse ranked choice",
    shortLabel: "Winner last",
    description:
      "Reveal follows the vote ranking in reverse. The lowest-ranked finalist is first and the winner is last.",
    orderFinalists: orderByReverseRankedChoice,
  },
  [FinalistOrdering.RANDOM]: {
    id: FinalistOrdering.RANDOM,
    label: "Random",
    shortLabel: "Shuffled",
    description:
      "Shuffle the finalists into a persisted random order so refreshing never changes the reveal.",
    orderFinalists: orderByRandom,
  },
};

export function isFinalistOrdering(value: string): value is FinalistOrdering {
  return Object.values(FinalistOrdering).includes(value as FinalistOrdering);
}

export function parseFinalistOrdering(
  value: unknown,
  fallback: FinalistOrdering = DEFAULT_FINALIST_ORDERING,
): FinalistOrdering {
  return typeof value === "string" && isFinalistOrdering(value) ? value : fallback;
}

export function getFinalistOrderingStrategy(id: FinalistOrdering) {
  const strategy = finalistOrderingStrategies[id];
  if (!strategy) {
    throw new DomainError(`Unknown finalist ordering: ${id}`);
  }
  return strategy;
}

export function listFinalistOrderingStrategies() {
  return Object.values(finalistOrderingStrategies);
}

export function orderFinalists(
  ordering: FinalistOrdering,
  movies: readonly FinalistForOrdering[],
) {
  return getFinalistOrderingStrategy(ordering).orderFinalists(movies);
}

export function finalistOrderingLabel(ordering: FinalistOrdering) {
  return getFinalistOrderingStrategy(ordering).shortLabel;
}
