-- Run after test_batches_migration.sql. Safe to run again.
CREATE OR REPLACE FUNCTION public.rename_auto_test_batch(
  p_test_id bigint, p_batch_id bigint, p_name text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_exam_staff() THEN
    RAISE EXCEPTION '시험 관리 권한이 없습니다.';
  END IF;
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION '회차 이름을 1~100자로 입력하세요.';
  END IF;
  UPDATE public.test_batches SET name = btrim(p_name)
  WHERE id = p_batch_id AND test_id = p_test_id;
  IF NOT FOUND THEN RAISE EXCEPTION '회차를 찾을 수 없습니다.'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.rename_auto_test_batch(bigint, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_auto_test_batch(bigint, bigint, text) TO authenticated;
