import { DomainError } from "@/lib/auth/errors";

const maximumTitleLength = 200;
const maximumPosterPathLength = 500;
const maximumOverviewLength = 2000;
const earliestReleaseYear = 1888;
const latestReleaseYear = 9999;
const maximumTmdbId = 2_147_483_647;
const posterPathPattern = /^\/[A-Za-z0-9._/-]+$/;

export type NominationMovieSnapshot = {
  tmdbId: number;
  title: string;
  releaseYear: number | null;
  overview: string | null;
  posterPath: string | null;
};

export type NominationSelection = NominationMovieSnapshot & {
  slotIndex: number;
};

export type SelectionValidationErrorCode =
  | "INVALID_SELECTIONS"
  | "INVALID_SELECTION_COUNT"
  | "INVALID_SLOT_INDEX"
  | "DUPLICATE_SLOT_INDEX"
  | "NONCONTIGUOUS_SLOT_INDEXES"
  | "DUPLICATE_MOVIE"
  | "INVALID_TMDB_ID"
  | "INVALID_TITLE"
  | "INVALID_RELEASE_YEAR"
  | "INVALID_POSTER_PATH";

export type NominationSubmissionErrorCode =
  | "ROOM_NOT_FOUND"
  | "NOT_PARTICIPANT"
  | "WRONG_PHASE"
  | "ALREADY_SUBMITTED";

export class NominationSubmissionError extends DomainError {
  readonly code: NominationSubmissionErrorCode;

  constructor(code: NominationSubmissionErrorCode, message: string) {
    super(message);
    this.name = "NominationSubmissionError";
    this.code = code;
  }
}

export class SelectionValidationError extends DomainError {
  readonly code: SelectionValidationErrorCode;

  constructor(code: SelectionValidationErrorCode, message: string) {
    super(message);
    this.name = "SelectionValidationError";
    this.code = code;
  }
}

export type SubmissionDuplicate = {
  tmdbId: number;
  slotIndexes: number[];
};

export type ExistingNominationDuplicate = {
  tmdbId: number;
  participantIds: string[];
};

export type NominationDuplicateReport = {
  withinSubmission: SubmissionDuplicate[];
  existingByOtherParticipants: ExistingNominationDuplicate[];
};

function normalizedNullableString(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return typeof value === "string" ? value.trim() : value;
}

function normalizeMovieSnapshot(value: Record<string, unknown>) {
  const tmdbId = value.tmdbId;
  if (
    typeof tmdbId !== "number" ||
    !Number.isSafeInteger(tmdbId) ||
    tmdbId <= 0 ||
    tmdbId > maximumTmdbId
  ) {
    throw new SelectionValidationError(
      "INVALID_TMDB_ID",
      "Each selection must include a valid TMDB movie ID.",
    );
  }

  if (typeof value.title !== "string") {
    throw new SelectionValidationError(
      "INVALID_TITLE",
      "Each selection must include a movie title.",
    );
  }

  const title = value.title.trim().replace(/\s+/g, " ");
  if (title.length === 0 || title.length > maximumTitleLength) {
    throw new SelectionValidationError(
      "INVALID_TITLE",
      `Movie titles must be between 1 and ${maximumTitleLength} characters.`,
    );
  }

  const releaseYear = value.releaseYear ?? null;
  if (
    releaseYear !== null &&
    (typeof releaseYear !== "number" ||
      !Number.isInteger(releaseYear) ||
      releaseYear < earliestReleaseYear ||
      releaseYear > latestReleaseYear)
  ) {
    throw new SelectionValidationError(
      "INVALID_RELEASE_YEAR",
      "Movie release years must be valid four-digit years.",
    );
  }

  const posterPath = normalizedNullableString(value.posterPath);
  if (
    posterPath !== null &&
    (typeof posterPath !== "string" ||
      posterPath.length > maximumPosterPathLength ||
      !posterPathPattern.test(posterPath))
  ) {
    throw new SelectionValidationError(
      "INVALID_POSTER_PATH",
      "Movie poster paths must be valid TMDB image paths.",
    );
  }

  const overviewValue = normalizedNullableString(value.overview);
  const overview = typeof overviewValue === "string"
    ? overviewValue.slice(0, maximumOverviewLength)
    : null;

  return {
    tmdbId,
    title,
    releaseYear,
    overview,
    posterPath,
  } satisfies NominationMovieSnapshot;
}

export function detectSubmissionDuplicates(
  selections: readonly Pick<NominationSelection, "slotIndex" | "tmdbId">[],
): SubmissionDuplicate[] {
  const indexesByTmdbId = new Map<number, number[]>();

  for (const selection of selections) {
    const indexes = indexesByTmdbId.get(selection.tmdbId) ?? [];
    indexes.push(selection.slotIndex);
    indexesByTmdbId.set(selection.tmdbId, indexes);
  }

  return [...indexesByTmdbId.entries()]
    .filter(([, slotIndexes]) => slotIndexes.length > 1)
    .map(([tmdbId, slotIndexes]) => ({
      tmdbId,
      slotIndexes: [...slotIndexes].sort((left, right) => left - right),
    }))
    .sort((left, right) => left.tmdbId - right.tmdbId);
}

export function validateNominationSelections(
  value: unknown,
  expectedCount: number,
): NominationSelection[] {
  if (!Array.isArray(value)) {
    throw new SelectionValidationError(
      "INVALID_SELECTIONS",
      "Selections must be submitted as a list.",
    );
  }

  if (value.length !== expectedCount) {
    throw new SelectionValidationError(
      "INVALID_SELECTION_COUNT",
      `Submit exactly ${expectedCount} movie selections.`,
    );
  }

  const selections = value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new SelectionValidationError(
        "INVALID_SELECTIONS",
        "Each selection must be a movie selection object.",
      );
    }

    const selection = entry as Record<string, unknown>;
    if (
      typeof selection.slotIndex !== "number" ||
      !Number.isInteger(selection.slotIndex) ||
      selection.slotIndex < 1
    ) {
      throw new SelectionValidationError(
        "INVALID_SLOT_INDEX",
        "Selection slot indexes must be positive integers starting at 1.",
      );
    }

    const movieValue =
      selection.movie &&
      typeof selection.movie === "object" &&
      !Array.isArray(selection.movie)
        ? (selection.movie as Record<string, unknown>)
        : selection;

    return {
      slotIndex: selection.slotIndex,
      ...normalizeMovieSnapshot(movieValue),
    };
  });

  const slotIndexes = selections
    .map(({ slotIndex }) => slotIndex)
    .sort((left, right) => left - right);
  if (new Set(slotIndexes).size !== slotIndexes.length) {
    throw new SelectionValidationError(
      "DUPLICATE_SLOT_INDEX",
      "Each selection slot may only be submitted once.",
    );
  }

  if (slotIndexes.some((slotIndex, position) => slotIndex !== position + 1)) {
    throw new SelectionValidationError(
      "NONCONTIGUOUS_SLOT_INDEXES",
      `Selection slot indexes must be contiguous from 1 to ${expectedCount}.`,
    );
  }

  const duplicates = detectSubmissionDuplicates(selections);
  if (duplicates.length > 0) {
    throw new SelectionValidationError(
      "DUPLICATE_MOVIE",
      "Choose a different movie for each selection slot.",
    );
  }

  return selections.sort((left, right) => left.slotIndex - right.slotIndex);
}

export function buildNominationDuplicateReport(
  selections: readonly Pick<NominationSelection, "slotIndex" | "tmdbId">[],
  existingNominations: readonly {
    participantId: string;
    tmdbId: number;
  }[],
): NominationDuplicateReport {
  const participantsByTmdbId = new Map<number, Set<string>>();

  for (const nomination of existingNominations) {
    const participants =
      participantsByTmdbId.get(nomination.tmdbId) ?? new Set<string>();
    participants.add(nomination.participantId);
    participantsByTmdbId.set(nomination.tmdbId, participants);
  }

  const selectedTmdbIds = new Set(selections.map(({ tmdbId }) => tmdbId));
  const existingByOtherParticipants = [...participantsByTmdbId.entries()]
    .filter(([tmdbId]) => selectedTmdbIds.has(tmdbId))
    .map(([tmdbId, participantIds]) => ({
      tmdbId,
      participantIds: [...participantIds].sort(),
    }))
    .sort((left, right) => left.tmdbId - right.tmdbId);

  return {
    withinSubmission: detectSubmissionDuplicates(selections),
    existingByOtherParticipants,
  };
}
