-- Run after pin_hash_migration.sql. Safe to run again.
-- Registration omits pin_hash; give each new student/parent a fresh bcrypt hash
-- of the existing initial PIN (0000), rather than storing a shared fixed hash.
CREATE OR REPLACE FUNCTION public.default_account_pin_hash()
RETURNS text
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT extensions.crypt('0000', extensions.gen_salt('bf'));
$$;

ALTER TABLE public.students ALTER COLUMN pin_hash SET DEFAULT public.default_account_pin_hash();
ALTER TABLE public.parents ALTER COLUMN pin_hash SET DEFAULT public.default_account_pin_hash();
