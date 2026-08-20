-- REVIEW ONLY: generated locally and not applied to any database.
-- Apply only after explicit approval.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "cineclub";

-- Keep Cineclub private to its owner unless access is explicitly granted later.
-- This does not change privileges on the public schema.
REVOKE ALL ON SCHEMA "cineclub" FROM PUBLIC;

-- CreateEnum
CREATE TYPE "cineclub"."room_phase" AS ENUM ('SELECTION', 'VOTING', 'FINALIZING', 'REVEAL', 'COMPLETE');

-- CreateTable
CREATE TABLE "cineclub"."profiles" (
    "id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "letterboxd_username" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cineclub"."rooms" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phase" "cineclub"."room_phase" NOT NULL DEFAULT 'SELECTION',
    "max_participants" SMALLINT NOT NULL,
    "selections_per_user" SMALLINT NOT NULL,
    "require_participant_coverage" BOOLEAN NOT NULL DEFAULT true,
    "roster_locked_at" TIMESTAMPTZ(6),
    "join_deadline" TIMESTAMPTZ(6),
    "selection_deadline" TIMESTAMPTZ(6),
    "voting_deadline" TIMESTAMPTZ(6),
    "finalized_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cineclub"."room_participants" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "selection_submitted_at" TIMESTAMPTZ(6),
    "voting_submitted_at" TIMESTAMPTZ(6),
    "letterboxd_username_snapshot" TEXT NOT NULL,

    CONSTRAINT "room_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cineclub"."room_movies" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "tmdb_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "release_year" SMALLINT,
    "poster_path" TEXT,
    "letterboxd_slug" TEXT,
    "letterboxd_rating" DECIMAL(3,2),
    "rating_fetched_at" TIMESTAMPTZ(6),
    "letterboxd_job_id" TEXT,

    CONSTRAINT "room_movies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cineclub"."nominations" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "room_movie_id" UUID NOT NULL,
    "slot_index" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nominations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cineclub"."ballots" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ballots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cineclub"."ballot_ranks" (
    "room_id" UUID NOT NULL,
    "ballot_id" UUID NOT NULL,
    "room_movie_id" UUID NOT NULL,
    "rank" SMALLINT NOT NULL,

    CONSTRAINT "ballot_ranks_pkey" PRIMARY KEY ("ballot_id","room_movie_id")
);

-- CreateTable
CREATE TABLE "cineclub"."room_movie_results" (
    "room_id" UUID NOT NULL,
    "room_movie_id" UUID NOT NULL,
    "aggregate_score" INTEGER NOT NULL,
    "aggregate_rank" SMALLINT NOT NULL,
    "tie_break_rating" DECIMAL(3,2),
    "tie_break_random" DOUBLE PRECISION NOT NULL,
    "is_finalist" BOOLEAN NOT NULL DEFAULT false,
    "final_order" SMALLINT,
    "scheduled_reveal_at" TIMESTAMPTZ(6),
    "revealed_at" TIMESTAMPTZ(6),

    CONSTRAINT "room_movie_results_pkey" PRIMARY KEY ("room_id","room_movie_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rooms_code_key" ON "cineclub"."rooms"("code");

-- CreateIndex
CREATE INDEX "rooms_owner_id_idx" ON "cineclub"."rooms"("owner_id");

-- CreateIndex
CREATE INDEX "room_participants_user_id_idx" ON "cineclub"."room_participants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "room_participants_room_id_user_id_key" ON "cineclub"."room_participants"("room_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "room_participants_room_id_id_key" ON "cineclub"."room_participants"("room_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "room_movies_room_id_tmdb_id_key" ON "cineclub"."room_movies"("room_id", "tmdb_id");

-- CreateIndex
CREATE UNIQUE INDEX "room_movies_room_id_id_key" ON "cineclub"."room_movies"("room_id", "id");

-- CreateIndex
CREATE INDEX "nominations_room_id_participant_id_idx" ON "cineclub"."nominations"("room_id", "participant_id");

-- CreateIndex
CREATE INDEX "nominations_room_id_room_movie_id_idx" ON "cineclub"."nominations"("room_id", "room_movie_id");

-- CreateIndex
CREATE UNIQUE INDEX "nominations_participant_id_slot_index_key" ON "cineclub"."nominations"("participant_id", "slot_index");

-- CreateIndex
CREATE UNIQUE INDEX "nominations_participant_id_room_movie_id_key" ON "cineclub"."nominations"("participant_id", "room_movie_id");

-- CreateIndex
CREATE UNIQUE INDEX "ballots_room_id_participant_id_key" ON "cineclub"."ballots"("room_id", "participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "ballots_room_id_id_key" ON "cineclub"."ballots"("room_id", "id");

-- CreateIndex
CREATE INDEX "ballot_ranks_room_id_ballot_id_idx" ON "cineclub"."ballot_ranks"("room_id", "ballot_id");

-- CreateIndex
CREATE INDEX "ballot_ranks_room_id_room_movie_id_idx" ON "cineclub"."ballot_ranks"("room_id", "room_movie_id");

-- CreateIndex
CREATE UNIQUE INDEX "ballot_ranks_ballot_id_rank_key" ON "cineclub"."ballot_ranks"("ballot_id", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "room_movie_results_room_id_aggregate_rank_key" ON "cineclub"."room_movie_results"("room_id", "aggregate_rank");

-- CreateIndex
CREATE UNIQUE INDEX "room_movie_results_room_id_final_order_key" ON "cineclub"."room_movie_results"("room_id", "final_order");

-- AddForeignKey
ALTER TABLE "cineclub"."profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cineclub"."rooms" ADD CONSTRAINT "rooms_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "cineclub"."profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cineclub"."room_participants" ADD CONSTRAINT "room_participants_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "cineclub"."rooms"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cineclub"."room_participants" ADD CONSTRAINT "room_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "cineclub"."profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cineclub"."room_movies" ADD CONSTRAINT "room_movies_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "cineclub"."rooms"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cineclub"."nominations" ADD CONSTRAINT "nominations_room_id_participant_id_fkey" FOREIGN KEY ("room_id", "participant_id") REFERENCES "cineclub"."room_participants"("room_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cineclub"."nominations" ADD CONSTRAINT "nominations_room_id_room_movie_id_fkey" FOREIGN KEY ("room_id", "room_movie_id") REFERENCES "cineclub"."room_movies"("room_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cineclub"."ballots" ADD CONSTRAINT "ballots_room_id_participant_id_fkey" FOREIGN KEY ("room_id", "participant_id") REFERENCES "cineclub"."room_participants"("room_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cineclub"."ballot_ranks" ADD CONSTRAINT "ballot_ranks_room_id_ballot_id_fkey" FOREIGN KEY ("room_id", "ballot_id") REFERENCES "cineclub"."ballots"("room_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cineclub"."ballot_ranks" ADD CONSTRAINT "ballot_ranks_room_id_room_movie_id_fkey" FOREIGN KEY ("room_id", "room_movie_id") REFERENCES "cineclub"."room_movies"("room_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cineclub"."room_movie_results" ADD CONSTRAINT "room_movie_results_room_id_room_movie_id_fkey" FOREIGN KEY ("room_id", "room_movie_id") REFERENCES "cineclub"."room_movies"("room_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddCheckConstraints
ALTER TABLE "cineclub"."profiles"
    ADD CONSTRAINT "profiles_display_name_check"
    CHECK (char_length(btrim("display_name")) > 0);

ALTER TABLE "cineclub"."rooms"
    ADD CONSTRAINT "rooms_code_check"
    CHECK (char_length(btrim("code")) > 0),
    ADD CONSTRAINT "rooms_name_check"
    CHECK (char_length(btrim("name")) > 0),
    ADD CONSTRAINT "rooms_max_participants_check"
    CHECK ("max_participants" > 0),
    ADD CONSTRAINT "rooms_selections_per_user_check"
    CHECK ("selections_per_user" > 0);

ALTER TABLE "cineclub"."room_participants"
    ADD CONSTRAINT "room_participants_letterboxd_username_snapshot_check"
    CHECK (char_length(btrim("letterboxd_username_snapshot")) > 0),
    ADD CONSTRAINT "room_participants_submission_order_check"
    CHECK (
        "voting_submitted_at" IS NULL
        OR (
            "selection_submitted_at" IS NOT NULL
            AND "selection_submitted_at" <= "voting_submitted_at"
        )
    );

ALTER TABLE "cineclub"."room_movies"
    ADD CONSTRAINT "room_movies_tmdb_id_check"
    CHECK ("tmdb_id" > 0),
    ADD CONSTRAINT "room_movies_title_check"
    CHECK (char_length(btrim("title")) > 0),
    ADD CONSTRAINT "room_movies_release_year_check"
    CHECK ("release_year" IS NULL OR "release_year" >= 1888),
    ADD CONSTRAINT "room_movies_letterboxd_rating_check"
    CHECK (
        "letterboxd_rating" IS NULL
        OR "letterboxd_rating" BETWEEN 0 AND 5
    );

ALTER TABLE "cineclub"."nominations"
    ADD CONSTRAINT "nominations_slot_index_check"
    CHECK ("slot_index" >= 1);

ALTER TABLE "cineclub"."ballot_ranks"
    ADD CONSTRAINT "ballot_ranks_rank_check"
    CHECK ("rank" >= 1);

ALTER TABLE "cineclub"."room_movie_results"
    ADD CONSTRAINT "room_movie_results_aggregate_score_check"
    CHECK ("aggregate_score" >= 0),
    ADD CONSTRAINT "room_movie_results_aggregate_rank_check"
    CHECK ("aggregate_rank" >= 1),
    ADD CONSTRAINT "room_movie_results_tie_break_rating_check"
    CHECK (
        "tie_break_rating" IS NULL
        OR "tie_break_rating" BETWEEN 0 AND 5
    ),
    ADD CONSTRAINT "room_movie_results_tie_break_random_check"
    CHECK ("tie_break_random" >= 0 AND "tie_break_random" < 1),
    ADD CONSTRAINT "room_movie_results_final_order_check"
    CHECK ("final_order" IS NULL OR "final_order" >= 1),
    ADD CONSTRAINT "room_movie_results_reveal_time_check"
    CHECK (
        "revealed_at" IS NULL
        OR "scheduled_reveal_at" IS NULL
        OR "revealed_at" >= "scheduled_reveal_at"
    );

-- Enable RLS as defense in depth. No policies or Data API grants are added,
-- so anon/authenticated clients receive no access through this migration.
ALTER TABLE "cineclub"."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cineclub"."rooms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cineclub"."room_participants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cineclub"."room_movies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cineclub"."nominations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cineclub"."ballots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cineclub"."ballot_ranks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cineclub"."room_movie_results" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA "cineclub" FROM PUBLIC;
