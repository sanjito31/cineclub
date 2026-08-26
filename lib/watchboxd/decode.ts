export type WatchboxdListUser = {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type WatchboxdMovie = {
  tmdbId: number | null;
  title: string;
  year: number | null;
  letterboxdRating: number | null;
  letterboxdSlug: string | null;
  letterboxdUrl: string | null;
  posterUrl: string | null;
  resolutionStatus: string | null;
  runtimeMinutes: number | null;
};

export type WatchboxdWatchedItem = {
  tmdbId: number | null;
  letterboxdSlug: string | null;
  title: string | null;
  year: number | null;
};

export type WatchboxdEnrichment = {
  complete: boolean;
  pendingSlugs: string[];
  failedSlugs: string[];
};

export type WatchboxdCollectionPage<T> = {
  user: WatchboxdListUser | null;
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  enrichment?: WatchboxdEnrichment | null;
};

export type WatchboxdOverlapFilm = WatchboxdMovie & {
  overlapCount: number | null;
  presentFor: WatchboxdListUser[];
};

export type WatchboxdOverlapPage = {
  users: WatchboxdListUser[];
  films: WatchboxdOverlapFilm[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  enrichment?: WatchboxdEnrichment | null;
};

export type WatchboxdWatchedBy = WatchboxdListUser & {
  userRating: number | null;
};

export type WatchboxdWatchedOverlapFilm = WatchboxdMovie & {
  watchedBy: WatchboxdWatchedBy[];
  watchedCount: number;
  partySize: number;
};

export type WatchboxdWatchedOverlapPage = {
  users: WatchboxdListUser[];
  films: WatchboxdWatchedOverlapFilm[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  enrichment?: WatchboxdEnrichment | null;
};

export type WatchboxdJob = {
  id: string;
  type: string | null;
  status: string;
  error: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function envelopeData(value: unknown): Record<string, unknown> | null {
  const body = asRecord(value);
  return asRecord(body?.data);
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalHttpsUrl(value: unknown) {
  const candidate = optionalString(value);
  if (!candidate || candidate.startsWith("/")) return null;

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function optionalFiniteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function optionalYear(value: unknown) {
  const year = optionalFiniteNumber(value);
  return year !== null && Number.isInteger(year) && year >= 1888 ? year : null;
}

function optionalTmdbId(value: unknown) {
  const tmdbId = optionalFiniteNumber(value);
  return tmdbId !== null && Number.isInteger(tmdbId) && tmdbId > 0 ? tmdbId : null;
}

function optionalRating(value: unknown) {
  const rating = optionalFiniteNumber(value);
  return rating !== null && rating >= 0 && rating <= 5 ? rating : null;
}

function optionalRuntime(value: unknown) {
  const runtime = optionalFiniteNumber(value);
  return runtime !== null && Number.isInteger(runtime) && runtime > 0 ? runtime : null;
}

function letterboxdUrlFromSlug(slug: string | null) {
  return slug ? `https://letterboxd.com/film/${encodeURIComponent(slug)}/` : null;
}

export function decodeWatchboxdListUser(value: unknown): WatchboxdListUser | null {
  const record = asRecord(value);
  const username = optionalString(record?.username);
  if (!username) return null;

  return {
    username,
    displayName: optionalString(record?.displayName),
    avatarUrl: optionalHttpsUrl(record?.avatarUrl),
  };
}

export function decodeWatchboxdEnrichment(value: unknown): WatchboxdEnrichment | null {
  const record = asRecord(value);
  const enrichment = asRecord(record?.enrichment) ?? record;
  if (!enrichment) return null;

  const pendingSlugs = stringList(enrichment.pendingSlugs);
  const failedSlugs = stringList(enrichment.failedSlugs);
  if (
    enrichment.complete === undefined
    && pendingSlugs.length === 0
    && failedSlugs.length === 0
  ) {
    return null;
  }

  return {
    complete: enrichment.complete === true,
    pendingSlugs,
    failedSlugs,
  };
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const slug = optionalString(item);
        return slug ? [slug] : [];
      })
    : [];
}

function envelopeMeta(value: unknown): Record<string, unknown> | null {
  const body = asRecord(value);
  return asRecord(body?.meta);
}

export function decodeWatchboxdMovie(value: unknown): WatchboxdMovie | null {
  const data = envelopeData(value) ?? asRecord(value);
  const movie = asRecord(data?.movie) ?? asRecord(data?.film) ?? data;
  if (!movie) return null;

  const title = optionalString(movie.title) ?? optionalString(movie.sourceTitle);
  const letterboxdSlug =
    optionalString(movie.letterboxdSlug)
    ?? optionalString(movie.sourceSlug)
    ?? optionalString(movie.slug);
  const letterboxdUrl =
    optionalHttpsUrl(movie.letterboxdUrl) ?? letterboxdUrlFromSlug(letterboxdSlug);
  if (!title && !letterboxdSlug && !letterboxdUrl) return null;
  const metadata = asRecord(movie.metadata);

  return {
    tmdbId: optionalTmdbId(movie.tmdbId),
    title: title ?? letterboxdSlug ?? "Untitled",
    year: optionalYear(movie.year) ?? optionalYear(movie.sourceYear),
    letterboxdRating: optionalRating(movie.letterboxdRating),
    letterboxdSlug,
    letterboxdUrl,
    posterUrl:
      optionalHttpsUrl(movie.posterUrl)
      ?? optionalHttpsUrl(movie.letterboxdPoster)
      ?? optionalHttpsUrl(movie.sourcePosterUrl),
    resolutionStatus: optionalString(movie.resolutionStatus),
    runtimeMinutes:
      optionalRuntime(movie.runtimeMinutes)
      ?? optionalRuntime(metadata?.runtimeMinutes),
  };
}

export function decodeWatchboxdWatchedItem(value: unknown): WatchboxdWatchedItem | null {
  const record = asRecord(value);
  const nested = decodeWatchboxdMovie(record?.movie);
  const flat = decodeWatchboxdMovie(record);
  const tmdbId = nested?.tmdbId ?? flat?.tmdbId ?? optionalTmdbId(record?.tmdbId);
  const letterboxdSlug =
    nested?.letterboxdSlug
    ?? flat?.letterboxdSlug
    ?? optionalString(record?.sourceSlug)
    ?? optionalString(record?.letterboxdSlug);
  const title =
    nested?.title
    ?? flat?.title
    ?? optionalString(record?.sourceTitle)
    ?? optionalString(record?.title);
  const year =
    nested?.year
    ?? flat?.year
    ?? optionalYear(record?.sourceYear)
    ?? optionalYear(record?.year);

  if (!letterboxdSlug && tmdbId === null && !title) return null;

  return {
    tmdbId,
    letterboxdSlug,
    title,
    year,
  };
}

function decodePagination(value: unknown, itemCount: number) {
  const record = asRecord(value);
  const page = optionalFiniteNumber(record?.page);
  const pageSize = optionalFiniteNumber(record?.pageSize);
  const total = optionalFiniteNumber(record?.total);
  const totalPages = optionalFiniteNumber(record?.totalPages);

  return {
    page: page !== null && Number.isInteger(page) && page >= 1 ? page : 1,
    pageSize: pageSize !== null && Number.isInteger(pageSize) && pageSize >= 1
      ? pageSize
      : Math.max(itemCount, 1),
    total: total !== null && Number.isInteger(total) && total >= 0 ? total : itemCount,
    totalPages: totalPages !== null && Number.isInteger(totalPages) && totalPages >= 0
      ? totalPages
      : itemCount > 0 ? 1 : 0,
  };
}

export function decodeWatchboxdWatchedPage(
  value: unknown,
): WatchboxdCollectionPage<WatchboxdWatchedItem> | null {
  const data = envelopeData(value);
  if (!data || !Array.isArray(data.items)) return null;

  return {
    user: decodeWatchboxdListUser(data.user),
    items: data.items.flatMap((item) => {
      const decoded = decodeWatchboxdWatchedItem(item);
      return decoded ? [decoded] : [];
    }),
    pagination: decodePagination(data.pagination, data.items.length),
    enrichment: decodeWatchboxdEnrichment(envelopeMeta(value)),
  };
}

export function decodeWatchboxdWatchlistPage(
  value: unknown,
): WatchboxdCollectionPage<WatchboxdWatchedItem> | null {
  return decodeWatchboxdWatchedPage(value);
}

export function decodeWatchboxdOverlapFilm(value: unknown): WatchboxdOverlapFilm | null {
  const record = asRecord(value);
  const movie = decodeWatchboxdMovie(record) ?? decodeWatchboxdMovie(record?.movie);
  if (!movie) return null;

  const overlapCount = optionalFiniteNumber(record?.overlapCount);
  const presentFor = Array.isArray(record?.presentFor)
    ? record.presentFor.flatMap((user: unknown) => {
        const decoded = decodeWatchboxdListUser(user);
        return decoded ? [decoded] : [];
      })
    : [];

  return {
    ...movie,
    overlapCount:
      overlapCount !== null && Number.isInteger(overlapCount) && overlapCount >= 0
        ? overlapCount
        : null,
    presentFor,
  };
}

export function decodeWatchboxdOverlapPage(value: unknown): WatchboxdOverlapPage | null {
  const data = envelopeData(value);
  if (!data || !Array.isArray(data.films)) return null;

  const users = Array.isArray(data.users)
    ? data.users.flatMap((user) => {
        const decoded = decodeWatchboxdListUser(user);
        return decoded ? [decoded] : [];
      })
    : [];

  return {
    users,
    films: data.films.flatMap((film) => {
      const decoded = decodeWatchboxdOverlapFilm(film);
      return decoded ? [decoded] : [];
    }),
    pagination: decodePagination(data.pagination, data.films.length),
    enrichment: decodeWatchboxdEnrichment(envelopeMeta(value)),
  };
}

export function decodeWatchboxdWatchedOverlapFilm(
  value: unknown,
): WatchboxdWatchedOverlapFilm | null {
  const record = asRecord(value);
  const movie = decodeWatchboxdMovie(record) ?? decodeWatchboxdMovie(record?.movie);
  if (!record || !movie || !Array.isArray(record.watchedBy)) return null;

  const watchedBy = record.watchedBy.flatMap((watcher: unknown) => {
    const user = decodeWatchboxdListUser(watcher);
    if (!user) return [];
    return [{
      ...user,
      userRating: optionalRating(asRecord(watcher)?.userRating),
    }];
  });
  const watchedCount = optionalFiniteNumber(record.watchedCount);
  const partySize = optionalFiniteNumber(record.partySize);

  return {
    ...movie,
    watchedBy,
    watchedCount:
      watchedCount !== null && Number.isInteger(watchedCount) && watchedCount >= 0
        ? watchedCount
        : watchedBy.length,
    partySize:
      partySize !== null && Number.isInteger(partySize) && partySize >= watchedBy.length
        ? partySize
        : watchedBy.length,
  };
}

export function decodeWatchboxdWatchedOverlapPage(
  value: unknown,
): WatchboxdWatchedOverlapPage | null {
  const data = envelopeData(value);
  if (!data || !Array.isArray(data.films)) return null;

  const users = Array.isArray(data.users)
    ? data.users.flatMap((user) => {
        const decoded = decodeWatchboxdListUser(user);
        return decoded ? [decoded] : [];
      })
    : [];

  return {
    users,
    films: data.films.flatMap((film) => {
      const decoded = decodeWatchboxdWatchedOverlapFilm(film);
      return decoded ? [decoded] : [];
    }),
    pagination: decodePagination(data.pagination, data.films.length),
    enrichment: decodeWatchboxdEnrichment(envelopeMeta(value)),
  };
}

export function decodeWatchboxdJob(value: unknown): WatchboxdJob | null {
  const data = envelopeData(value) ?? asRecord(value);
  const id = optionalString(data?.id);
  const status = optionalString(data?.status);
  if (!data || !id || !status) return null;

  const errorValue = data.error;
  const error =
    optionalString(errorValue)
    ?? (errorValue && typeof errorValue === "object"
      ? optionalString((errorValue as { message?: unknown }).message)
      : null);

  return {
    id,
    type: optionalString(data.type),
    status,
    error,
  };
}
