-- A Letterboxd username is optional on profiles, so its room-time snapshot
-- must also permit users who have not claimed a Letterboxd profile.
ALTER TABLE "cineclub"."room_participants"
    ALTER COLUMN "letterboxd_username_snapshot" DROP NOT NULL;
