-- Persist TMDB overviews on nominated room movies so voting nomination cards
-- can show a film description without a live TMDB fetch.
ALTER TABLE "cineclub"."room_movies"
    ADD COLUMN "overview" TEXT;
