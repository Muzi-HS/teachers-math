-- Run after auto_grading_migration.sql. Safe to run again.
-- Archived tests remain linked to existing records and scores.
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.set_test_archived(p_test_id bigint, p_archived boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT COALESCE(public.is_exam_staff(), false) THEN
    RAISE EXCEPTION '시험 관리 권한이 없습니다.';
  END IF;
  IF p_archived IS NULL THEN
    RAISE EXCEPTION '보관 상태를 지정하세요.';
  END IF;
  UPDATE public.tests SET is_archived = p_archived,
    is_published = CASE WHEN p_archived AND auto_grading THEN false ELSE is_published END
  WHERE id = p_test_id;
  IF NOT FOUND THEN RAISE EXCEPTION '시험을 찾을 수 없습니다.'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_test_archived(bigint, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_test_archived(bigint, boolean) TO authenticated;
