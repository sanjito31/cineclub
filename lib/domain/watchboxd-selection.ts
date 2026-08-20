import { normalizeLetterboxdUsername } from "@/lib/validation/shared";
import type {
  WatchboxdCollectionPage,
  WatchboxdOverlapFilm,
  WatchboxdWatchedItem,
} from "@/lib/watchboxd/decode";

export const OVERLAP_SUGGESTION_LIMIT = 10;
export const MAXIMUM_WATCHED_PAGES = 8;
export const WATCHED_PAGE_SIZE = 100;

export type RoomLetterboxdMember = {
  userId: string;
  displayName: string;
  letterboxdUsername: string;
};

export type WatchedMember = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  isCurrentUser: boolean;
};

export type WatchedIndex = {
  byTmdbId: Record<string, WatchedMember[]>;
  bySlug: Record<string, WatchedMember[]>;
  byTitleYear: Record<string, WatchedMember[]>;
};

export type OverlapSuggestion = {
  tmdbId: number | null;
  title: string;
  releaseYear: number | null;
  posterUrl: string | null;
  letterboxdRating: number | null;
  letterboxdUrl: string;
  letterboxdSlug: string | null;
};

export function letterboxdUsernameForParticipant(participant: {
  letterboxdUsernameSnapshot?: string | null;
  user?: { letterboxdUsername?: string | null };
}) {
  return normalizeLetterboxdUsername(
    participant.letterboxdUsernameSnapshot
      ?? participant.user?.letterboxdUsername
      ?? null,
  );
}

export function collectRoomLetterboxdMembers(
  participants: readonly {
    userId: string;
    letterboxdUsernameSnapshot?: string | null;
    user?: { displayName?: string | null; letterboxdUsername?: string | null };
  }[],
): RoomLetterboxdMember[] {
  const members: RoomLetterboxdMember[] = [];
  const seen = new Set<string>();

  for (const participant of participants) {
    const letterboxdUsername = letterboxdUsernameForParticipant(participant);
    if (!letterboxdUsername) continue;
    const key = letterboxdUsername.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    members.push({
      userId: participant.userId,
      displayName: participant.user?.displayName?.trim() || letterboxdUsername,
      letterboxdUsername,
    });
    if (members.length === 10) break;
  }

  return members;
}

function appendWatchedMember(
  index: Record<string, WatchedMember[]>,
  key: string,
  member: WatchedMember,
) {
  const existing = index[key] ?? [];
  if (existing.some((candidate) => candidate.userId === member.userId)) {
    index[key] = existing;
    return;
  }
  index[key] = [...existing, member];
}

export function emptyWatchedIndex(): WatchedIndex {
  return { byTmdbId: {}, bySlug: {}, byTitleYear: {} };
}

export function movieTitleKey(title: string | null | undefined) {
  if (!title) return null;
  const normalized = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return normalized || null;
}

export function movieTitleYearKey(
  title: string | null | undefined,
  year: number | null | undefined,
) {
  const normalizedTitle = movieTitleKey(title);
  if (!normalizedTitle || year == null || !Number.isInteger(year)) return null;
  return `${normalizedTitle}|${year}`;
}

export function addWatchedPageToIndex(
  index: WatchedIndex,
  page: WatchboxdCollectionPage<WatchboxdWatchedItem>,
  member: WatchedMember,
) {
  const avatarUrl = member.avatarUrl ?? page.user?.avatarUrl ?? null;
  const watchedMember = { ...member, avatarUrl };

  for (const item of page.items) {
    if (item.tmdbId) {
      appendWatchedMember(index.byTmdbId, String(item.tmdbId), watchedMember);
    }
    if (item.letterboxdSlug) {
      appendWatchedMember(
        index.bySlug,
        item.letterboxdSlug.toLowerCase(),
        watchedMember,
      );
    }
    const titleYearKey = movieTitleYearKey(item.title, item.year);
    if (titleYearKey) {
      appendWatchedMember(index.byTitleYear, titleYearKey, watchedMember);
    }
  }

  return index;
}

export function watchedMembersForMovie(
  index: WatchedIndex,
  movie: {
    tmdbId: number;
    title?: string | null;
    releaseYear?: number | null;
    letterboxdSlug?: string | null;
  },
): WatchedMember[] {
  const titleYearKey = movieTitleYearKey(movie.title, movie.releaseYear);
  const members = [
    ...(index.byTmdbId[String(movie.tmdbId)] ?? []),
    ...(movie.letterboxdSlug
      ? index.bySlug[movie.letterboxdSlug.toLowerCase()] ?? []
      : []),
    ...(titleYearKey ? index.byTitleYear[titleYearKey] ?? [] : []),
  ];

  const unique: WatchedMember[] = [];
  for (const member of members) {
    if (unique.some((candidate) => candidate.userId === member.userId)) continue;
    unique.push(member);
  }
  return unique;
}

export function watchedWarningCopy(members: readonly WatchedMember[]) {
  if (members.length === 0) return null;

  const others = members.filter((member) => !member.isCurrentUser);
  if (others.length === 0) {
    return "You’ve already watched this.";
  }
  if (others.length === 1) {
    return "1 other has seen this already…";
  }
  return `${others.length} others have seen this already…`;
}

export function limitOverlapSuggestions(
  films: readonly WatchboxdOverlapFilm[],
  limit = OVERLAP_SUGGESTION_LIMIT,
): OverlapSuggestion[] {
  const suggestions: OverlapSuggestion[] = [];

  for (const film of films) {
    if (!film.letterboxdUrl || suggestions.length >= limit) continue;
    suggestions.push({
      tmdbId: film.tmdbId,
      title: film.title,
      releaseYear: film.year,
      posterUrl: film.posterUrl,
      letterboxdRating: film.letterboxdRating,
      letterboxdUrl: film.letterboxdUrl,
      letterboxdSlug: film.letterboxdSlug,
    });
  }

  return suggestions;
}

export function applyLetterboxdRating<T extends {
  letterboxdRating: number | null;
  letterboxdRatingJobId?: string | null;
  letterboxdUrl?: string | null;
  letterboxdSlug?: string | null;
  posterUrl?: string | null;
}>(
  movie: T,
  update: {
    letterboxdRating: number | null;
    letterboxdRatingJobId?: string | null;
    letterboxdUrl?: string | null;
    letterboxdSlug?: string | null;
    posterUrl?: string | null;
  },
): T {
  const pending = Boolean(update.letterboxdRatingJobId);
  return {
    ...movie,
    letterboxdRating: pending ? movie.letterboxdRating : update.letterboxdRating,
    letterboxdRatingJobId: update.letterboxdRatingJobId ?? null,
    letterboxdUrl: update.letterboxdUrl ?? movie.letterboxdUrl ?? null,
    letterboxdSlug: update.letterboxdSlug ?? movie.letterboxdSlug ?? null,
    posterUrl: update.posterUrl ?? movie.posterUrl ?? null,
  };
}
