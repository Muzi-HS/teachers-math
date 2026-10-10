-- Supabase SQL Editor: run this entire block.
-- Adds 6 to the recorded 100-point score; does not change answers or correct counts.
-- No 100-point cap is applied. Run once; repeated runs do not add points again.
-- A later grading correction/recalculation can replace this manual adjustment.
CREATE TABLE IF NOT EXISTS public.test_manual_score_adjustments (
  adjustment_key text NOT NULL,
  test_id bigint NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  student_id bigint NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  original_score integer NOT NULL,
  adjusted_score integer NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (adjustment_key, test_id, student_id)
);
ALTER TABLE public.test_manual_score_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.test_manual_score_adjustments FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_test bigint; v_count integer; v_name text; v_student bigint;
  v_score integer; v_adjusted integer; v_applied integer;
BEGIN
  SELECT count(*), min(id) INTO v_count, v_test FROM public.tests
  WHERE name = '공통수학2 2학기 1차 테스트(유신고 기출)' AND auto_grading;
  IF v_count <> 1 THEN
    RAISE EXCEPTION '해당 이름의 자동채점 테스트가 정확히 1개여야 합니다.';
  END IF;
  PERFORM 1 FROM public.tests WHERE id = v_test FOR UPDATE;
  PERFORM id FROM public.test_attempts WHERE test_id = v_test ORDER BY id FOR UPDATE;

  FOREACH v_name IN ARRAY ARRAY['백지희', '이지안', '박해윤'] LOOP
    -- Resolve names only among students with a submitted result in this test.
    SELECT count(*), min(s.id) INTO v_count, v_student
    FROM public.students s JOIN public.test_attempts a ON a.student_id = s.id
    WHERE s.name = v_name AND a.test_id = v_test AND a.submitted_at IS NOT NULL;
    IF v_count <> 1 THEN
      RAISE EXCEPTION '% 학생의 제출 결과가 정확히 1개여야 합니다. 동명이인 또는 미제출 여부를 확인하세요.', v_name;
    END IF;
    SELECT score INTO v_score FROM public.test_scores
    WHERE test_id = v_test AND student_id = v_student FOR UPDATE;
    IF NOT FOUND OR v_score IS NULL THEN
      RAISE EXCEPTION '% 학생의 성적을 찾을 수 없습니다.', v_name;
    END IF;
    IF v_score IS DISTINCT FROM (SELECT score FROM public.test_attempts WHERE test_id = v_test AND student_id = v_student) THEN
      RAISE EXCEPTION '% 학생의 응시 결과와 성적이 다릅니다. 기존 점수를 확인하세요.', v_name;
    END IF;
    v_adjusted := v_score + 6;
    INSERT INTO public.test_manual_score_adjustments
      (adjustment_key, test_id, student_id, original_score, adjusted_score)
    VALUES ('yushin_three_students_plus_6', v_test, v_student, v_score, v_adjusted)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_applied = ROW_COUNT;
    IF v_applied = 0 THEN
      RAISE NOTICE '%: 이미 6점 가산을 적용한 학생입니다. 추가 가산하지 않습니다.', v_name;
      CONTINUE;
    END IF;
    UPDATE public.test_attempts SET score = v_adjusted
    WHERE test_id = v_test AND student_id = v_student;
    UPDATE public.test_scores SET score = v_adjusted
    WHERE test_id = v_test AND student_id = v_student;
    UPDATE public.record_test_items i SET t_score = v_adjusted
    FROM public.records r
    WHERE i.record_id = r.id AND r.student_id = v_student AND i.test_id = v_test;
    RAISE NOTICE '%: %점 → %점 (6점 가산)', v_name, v_score, v_adjusted;
  END LOOP;
END $$;

SELECT s.name, a.original_score, a.adjusted_score, sc.score AS current_score
FROM public.test_manual_score_adjustments a
JOIN public.students s ON s.id = a.student_id
JOIN public.test_scores sc ON sc.test_id = a.test_id AND sc.student_id = a.student_id
JOIN public.tests t ON t.id = a.test_id
WHERE a.adjustment_key = 'yushin_three_students_plus_6'
  AND t.name = '공통수학2 2학기 1차 테스트(유신고 기출)'
ORDER BY s.name;
