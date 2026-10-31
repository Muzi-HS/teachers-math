-- Run before deploying the session renewal client. Safe to re-run.
-- Existing valid tokens remain valid; expired/revoked tokens cannot be revived.
BEGIN;
CREATE OR REPLACE FUNCTION public.client_refresh_session(p_token uuid, p_extend boolean DEFAULT false)
RETURNS TABLE(subject_type text, subject_id int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_extend THEN
    RETURN QUERY UPDATE public.client_sessions s
      SET expires_at = now() + interval '30 days'
      WHERE s.token = p_token AND s.expires_at > now()
      RETURNING s.subject_type, s.subject_id;
  ELSE
    RETURN QUERY SELECT s.subject_type, s.subject_id FROM public.client_sessions s
      WHERE s.token = p_token AND s.expires_at > now();
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.client_refresh_session(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_refresh_session(uuid,boolean) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
