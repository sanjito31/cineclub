-- Lets the sign-in page ask "does this email use a password?" without
-- giving app_runtime read access to auth.users (and its password hashes).
-- Returns 'password', 'link', or NULL when no account has that email.
--
-- SECURITY DEFINER runs as the function's owner, so apply this migration
-- as `postgres`, which can read auth.users. Applied as app_runtime it fails
-- with "permission denied for schema auth" instead of creating a function
-- that can never work.
--
-- Guarded for the shadow DB, which has no auth schema. pg_namespace (unlike
-- information_schema.schemata) lists schemas regardless of privileges.

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
      WHEN u.encrypted_password IS NOT NULL AND u.encrypted_password <> '' THEN 'password'
      ELSE 'link'
    END
    FROM auth.users u
    WHERE u.email = lower(p_email)
    LIMIT 1
  $fn$;

  REVOKE ALL ON FUNCTION cineclub.email_sign_in_method(text) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION cineclub.email_sign_in_method(text) TO app_runtime;
END $$;
