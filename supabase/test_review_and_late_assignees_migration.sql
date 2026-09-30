-- Run after auto_grading_migration.sql. Safe to run again.
-- Existing attempts and scores remain untouched when another class is added.

CREATE OR REPLACE FUNCTION public.add_auto_test_assignees(p_test_id bigint, p_student_ids bigint[])
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE added integer;
BEGIN
  IF NOT public.is_exam_staff() THEN
    RAISE EXCEPTION '시험 관리 권한이 없습니다.';
  END IF;
  PERFORM 1 FROM public.tests WHERE id = p_test_id AND auto_grading FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '자동채점 시험을 찾을 수 없습니다.';
  END IF;
  IF p_student_ids IS NULL OR cardinality(p_student_ids) = 0
     OR array_position(p_student_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION '추가할 학생을 선택하세요.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_student_ids) AS requested(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id = requested.id)
  ) THEN
    RAISE EXCEPTION '존재하지 않는 학생이 포함되어 있습니다.';
  END IF;

  INSERT INTO public.test_assignees(test_id, student_id)
  SELECT p_test_id, requested.id FROM unnest(p_student_ids) AS requested(id)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS added = ROW_COUNT;
  RETURN added;
END;
$$;
REVOKE ALL ON FUNCTION public.add_auto_test_assignees(bigint, bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_auto_test_assignees(bigint, bigint[]) TO authenticated;

-- Answer keys and aggregate rates are released only for this student's
-- submitted attempt. Unsubmitted students continue to receive safe questions.
CREATE OR REPLACE FUNCTION public.student_test_review(p_student_id bigint, p_test_id bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE review jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.test_attempts a
    JOIN public.test_assignees s ON s.test_id = a.test_id AND s.student_id = a.student_id
    WHERE a.test_id = p_test_id AND a.student_id = p_student_id AND a.submitted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION '제출한 시험만 정오표를 볼 수 있습니다.';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'number', q.number,
    'correct_answer', q.correct_answer,
    'correct_count', stats.correct_count,
    'submitted_count', stats.submitted_count,
    'correct_rate', CASE WHEN stats.submitted_count = 0 THEN 0
      ELSE round(stats.correct_count::numeric * 100 / stats.submitted_count)::integer END
  ) ORDER BY q.number), '[]'::jsonb)
  INTO review
  FROM public.test_questions q
  CROSS JOIN LATERAL (
    SELECT count(*)::integer AS submitted_count,
      count(*) FILTER (WHERE
        CASE
          WHEN q.kind = 'choice' AND jsonb_typeof(a.answers->q.number::text) = 'array' THEN
            COALESCE((SELECT jsonb_agg(choice.value ORDER BY choice.value)
              FROM (SELECT DISTINCT value FROM jsonb_array_elements(a.answers->q.number::text)) AS choice), '[]'::jsonb)
              = q.correct_answer
          WHEN q.kind = 'text' AND jsonb_typeof(a.answers->q.number::text) = 'string' THEN
            btrim(a.answers->>q.number::text) = q.correct_answer #>> '{}'
          ELSE false
        END
      )::integer AS correct_count
    FROM public.test_attempts a
    WHERE a.test_id = p_test_id AND a.submitted_at IS NOT NULL
  ) stats
  WHERE q.test_id = p_test_id;
  RETURN review;
END;
$$;
REVOKE ALL ON FUNCTION public.student_test_review(bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.student_test_review(bigint, bigint) TO service_role;
