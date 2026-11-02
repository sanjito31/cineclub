import {
  applyWatchedIndexToMovie,
  toSelectionMovie,
  type SelectionMovie,
} from "@/app/rooms/[code]/selection-contracts";
import { listRoomMovieNominationSummaries } from "@/lib/data/nominations";
import {
  lookupRoomWatchedIndex,
  lookupWatchboxdMovies,
} from "@/lib/data/watchboxd-room";
import type { TmdbMovieSearchResult } from "@/lib/tmdb/client";

// Turns TMDB movies into selection cards for this room: Letterboxd rating,
// whether another member already nominated it, and who in the room has watched it.
// Shared by manual search and the movie search agent so both show the same cards.
export async function toRoomSelectionMovies(input: {
  roomId: string;
  participants: Parameters<typeof lookupRoomWatchedIndex>[0]["participants"];
  currentUserId: string;
  movies: readonly TmdbMovieSearchResult[];
  signal?: AbortSignal;
}): Promise<SelectionMovie[]> {
  const tmdbIds = input.movies.map((movie) => movie.tmdbId);
  const [summaries, ratings, watched] = await Promise.all([
    listRoomMovieNominationSummaries(input.roomId, tmdbIds),
    lookupWatchboxdMovies(tmdbIds, input.signal),
    lookupRoomWatchedIndex({
      participants: input.participants,
      currentUserId: input.currentUserId,
      tmdbIds,
      signal: input.signal,
    }),
  ]);
  const extrasByTmdbId = new Map(
    summaries.map((summary) => [summary.tmdbId, summary]),
  );
  const ratingsByTmdbId = new Map(
    ratings.map((rating) => [rating.tmdbId, rating]),
  );

  return input.movies.map((movie) => {
    const extras = extrasByTmdbId.get(movie.tmdbId);
    const rating = ratingsByTmdbId.get(movie.tmdbId);
    return applyWatchedIndexToMovie(toSelectionMovie({
      tmdbId: movie.tmdbId,
      title: movie.title,
      releaseYear: movie.releaseYear,
      overview: movie.overview,
      posterPath: movie.posterPath,
      tmdbRating: movie.voteAverage,
      letterboxdRating: rating?.letterboxdRating ?? extras?.letterboxdRating ?? null,
      letterboxdRatingJobId: rating?.letterboxdRatingJobId ?? null,
      letterboxdUrl: rating?.letterboxdUrl ?? null,
      letterboxdSlug: rating?.letterboxdSlug ?? null,
      posterUrl: rating?.posterUrl ?? null,
      alreadyNominatedBy: extras && extras.nominatedBy.length > 0 ? ["other"] : [],
    }), watched);
  });
}
