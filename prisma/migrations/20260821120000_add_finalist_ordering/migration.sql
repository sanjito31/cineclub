-- Host-controlled finalist reveal ordering. New strategies can be added to this
-- enum later without changing the finalization write path.
CREATE TYPE "cineclub"."finalist_ordering" AS ENUM ('RANKED_CHOICE', 'RANDOM');

ALTER TABLE "cineclub"."rooms"
    ADD COLUMN "finalist_ordering" "cineclub"."finalist_ordering" NOT NULL DEFAULT 'RANKED_CHOICE';
