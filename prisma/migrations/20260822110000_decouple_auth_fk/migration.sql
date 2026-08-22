-- Decouple cineclub.profiles from auth.users so Prisma never sees a
-- cross-schema FK.  Two triggers on auth.users keep the data in sync:
--   INSERT → mirror the user id into cineclub.profiles
--   DELETE → cascade-delete the matching profile row
--
-- The trigger/function bodies reference auth.users which only exists on
-- Supabase, so the entire migration is guarded for the shadow DB.

-- 1. Drop the direct FK (safe even when it doesn't exist)
ALTER TABLE "cineclub"."profiles"
  DROP CONSTRAINT IF EXISTS "profiles_id_fkey";

-- 2-3. Triggers (Supabase only — shadow DB has no auth schema)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
    RETURN;
  END IF;

  -- Mirror new auth users into cineclub.profiles
  CREATE OR REPLACE FUNCTION cineclub.handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $fn$
  BEGIN
    INSERT INTO cineclub.profiles (id, display_name)
    VALUES (
      NEW.id,
      COALESCE(
        NEW.raw_user_meta_data ->> 'display_name',
        NEW.raw_user_meta_data ->> 'full_name',
        NEW.raw_user_meta_data ->> 'name',
        split_part(NEW.email, '@', 1),
        'New user'
      )
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END;
  $fn$;

  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION cineclub.handle_new_user();

  -- Cascade auth user deletion to cineclub.profiles
  CREATE OR REPLACE FUNCTION cineclub.handle_user_deleted()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $fn$
  BEGIN
    DELETE FROM cineclub.profiles WHERE id = OLD.id;
    RETURN OLD;
  END;
  $fn$;

  DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
  CREATE TRIGGER on_auth_user_deleted
    AFTER DELETE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION cineclub.handle_user_deleted();
END $$;
