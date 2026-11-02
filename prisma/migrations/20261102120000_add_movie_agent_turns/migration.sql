-- Movie bot conversations, stored server-side one turn per row, and the token
-- usage behind each user's movie bot limits.

-- CreateTable
CREATE TABLE "cineclub"."movie_agent_turns" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movie_agent_turns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "movie_agent_turns_conversation_id_created_at_idx" ON "cineclub"."movie_agent_turns"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "movie_agent_turns_user_id_created_at_idx" ON "cineclub"."movie_agent_turns"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "movie_agent_turns_room_id_idx" ON "cineclub"."movie_agent_turns"("room_id");

-- AddForeignKey
ALTER TABLE "cineclub"."movie_agent_turns" ADD CONSTRAINT "movie_agent_turns_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "cineclub"."rooms"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cineclub"."movie_agent_turns" ADD CONSTRAINT "movie_agent_turns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "cineclub"."profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Same defense in depth as the other tables: RLS on, no Data API grants.
ALTER TABLE "cineclub"."movie_agent_turns" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "cineclub"."movie_agent_turns" FROM PUBLIC;

-- app_runtime is NOBYPASSRLS, so it needs the full-access policy the other tables
-- got from the manual role setup, or every query on this table is denied. The
-- grant matches the default privileges for tables postgres creates. Guarded for
-- databases without the role, like the shadow DB.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    RETURN;
  END IF;

  GRANT SELECT, INSERT, UPDATE, DELETE ON "cineclub"."movie_agent_turns" TO app_runtime;
  CREATE POLICY "app_runtime_full_access" ON "cineclub"."movie_agent_turns"
    FOR ALL TO app_runtime USING (true) WITH CHECK (true);
END $$;
