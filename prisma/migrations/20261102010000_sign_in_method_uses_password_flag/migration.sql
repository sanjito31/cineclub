-- Supabase gives users created by a magic link a random password, so a
-- non-empty encrypted_password does not mean the user chose a password.
-- Password sign-ups now set raw_user_meta_data.has_password = true; use that.
--
-- Like the previous migration, apply this as `postgres` so the function
-- keeps an owner that can read auth.users. CREATE OR REPLACE keeps the
-- existing grants.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    RETURN;
  END IF;

  CREATE OR REPLACE FUNCTION cineclub.email_sign_in_method(p_email text)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
  AS $fn$
    SELECT CASE
      WHEN u.raw_user_meta_data ->> 'has_password' = 'true' THEN 'password'
      ELSE 'link'
    END
    FROM auth.users u
    WHERE u.email = lower(p_email)
    LIMIT 1
  $fn$;
END $$;
