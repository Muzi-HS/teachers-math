-- Run after auto_grading_migration.sql, test_batches_migration.sql and
-- test_archive_migration.sql. Safe to run again.
-- Opening a round is a one-way action. Each student still has a two-minute
-- attempt after pressing Start, and submitted results remain available.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'test_batches' AND column_name = 'answer_entry_open'
  ) THEN
    ALTER TABLE public.test_batches ADD COLUMN answer_entry_open boolean NOT NULL DEFAULT false;
    -- Preserve rounds that were visible under the old test-wide switch once.
    UPDATE public.test_batches b SET answer_entry_open = true
    FROM public.tests t WHERE t.id = b.test_id AND t.is_published = true;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_test_batch_entry(p_test_id bigint, p_batch_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT COALESCE(public.is_exam_staff(), false) THEN
    RAISE EXCEPTION '시험 관리 권한이 없습니다.';
  END IF;
  PERFORM 1 FROM public.tests WHERE id = p_test_id AND auto_grading FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '자동채점 시험을 찾을 수 없습니다.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.test_batches WHERE id = p_batch_id AND test_id = p_test_id) THEN
    RAISE EXCEPTION '회차를 찾을 수 없습니다.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.test_assignees WHERE test_id = p_test_id AND batch_id = p_batch_id)
     OR (SELECT count(*) FROM public.test_questions WHERE test_id = p_test_id)
        <> (SELECT total FROM public.tests WHERE id = p_test_id) THEN
    RAISE EXCEPTION '문항과 응시 대상을 먼저 설정하세요.';
  END IF;
  UPDATE public.test_batches SET answer_entry_open = true WHERE id = p_batch_id;
  -- The legacy test-wide flag is still checked by student_test_action.
  UPDATE public.tests SET is_published = true WHERE id = p_test_id;
END;
$$;
REVOKE ALL ON FUNCTION public.open_test_batch_entry(bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_test_batch_entry(bigint, bigint) TO authenticated;

-- A published test alone must never make a newly added round available.
CREATE OR REPLACE FUNCTION public.guard_test_batch_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.test_assignees a
    JOIN public.test_batches b ON b.id = a.batch_id AND b.test_id = a.test_id
    WHERE a.test_id = NEW.test_id AND a.student_id = NEW.student_id
      AND b.answer_entry_open
  ) THEN
    RAISE EXCEPTION '선생님이 이 회차의 답안 입력을 열면 응시할 수 있습니다.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_test_batch_entry ON public.test_attempts;
CREATE TRIGGER guard_test_batch_entry BEFORE INSERT ON public.test_attempts
  FOR EACH ROW EXECUTE FUNCTION public.guard_test_batch_entry();

CREATE OR REPLACE FUNCTION public.student_test_list(p_student_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE pending record; result jsonb;
BEGIN
  FOR pending IN SELECT id FROM public.test_attempts
    WHERE student_id = p_student_id AND submitted_at IS NULL AND deadline_at <= clock_timestamp() LOOP
    PERFORM public.finalize_test_attempt(pending.id);
  END LOOP;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id, 'name', t.name, 'date', t.date, 'total', t.total,
    'is_published', t.is_published,
    'answer_entry_open', b.answer_entry_open,
    'batch_name', b.name,
    'attempt', CASE WHEN a.id IS NULL THEN NULL ELSE to_jsonb(a) END
  ) ORDER BY t.date DESC, t.id DESC), '[]'::jsonb)
  INTO result
  FROM public.tests t
  JOIN public.test_assignees s ON s.test_id = t.id AND s.student_id = p_student_id
  JOIN public.test_batches b ON b.id = s.batch_id AND b.test_id = t.id
  LEFT JOIN public.test_attempts a ON a.test_id = t.id AND a.student_id = p_student_id
  WHERE t.auto_grading;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.student_test_list(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.student_test_list(bigint) TO service_role;

-- The old test-wide publishing RPC must not override round access.
REVOKE EXECUTE ON FUNCTION public.publish_auto_test(bigint, boolean) FROM authenticated;

-- Archive only changes staff-facing organization, even for databases where
-- the earlier archive migration already installed the old function.
CREATE OR REPLACE FUNCTION public.set_test_archived(p_test_id bigint, p_archived boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT COALESCE(public.is_exam_staff(), false) THEN RAISE EXCEPTION '시험 관리 권한이 없습니다.'; END IF;
  IF p_archived IS NULL THEN RAISE EXCEPTION '보관 상태를 지정하세요.'; END IF;
  UPDATE public.tests SET is_archived = p_archived WHERE id = p_test_id;
  IF NOT FOUND THEN RAISE EXCEPTION '시험을 찾을 수 없습니다.'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_test_archived(bigint, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_test_archived(bigint, boolean) TO authenticated;
