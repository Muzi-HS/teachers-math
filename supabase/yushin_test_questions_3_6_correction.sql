-- First run test_grading_correction_migration.sql, then run this entire block.
-- No temporary tables: safe when the SQL Editor separates statements/sessions.
DO $$
DECLARE v_test bigint; v_count integer; before_q jsonb; after_q jsonb;
BEGIN
 SELECT count(*), min(id) INTO v_count,v_test FROM public.tests
 WHERE name='공통수학2 2학기 1차 테스트(유신고 기출)' AND auto_grading;
 IF v_count<>1 THEN RAISE EXCEPTION '해당 이름의 자동채점 테스트가 정확히 1개여야 합니다.'; END IF;
 PERFORM 1 FROM public.tests WHERE id=v_test FOR UPDATE;
 PERFORM id FROM public.test_attempts WHERE test_id=v_test ORDER BY id FOR UPDATE;
 IF (SELECT count(*) FROM public.test_questions WHERE test_id=v_test AND number IN (3,6))<>2 THEN
  RAISE EXCEPTION '3번과 6번 문항을 확인하세요.';
 END IF;
 before_q:=public.test_grading_snapshot(v_test);
 UPDATE public.test_questions SET award_all=true WHERE test_id=v_test AND number IN (3,6);
 after_q:=public.test_grading_snapshot(v_test);
 IF before_q<>after_q THEN
  INSERT INTO public.test_grading_corrections(test_id,actor,reason,previous_questions,next_questions)
  VALUES(v_test,auth.uid(),'3번·6번 문항 모두 정답 처리',before_q,after_q);
 END IF;
 PERFORM public.recalculate_test_results(v_test);
 RAISE NOTICE '3번·6번 모두 정답 처리 완료. 기존 성적·수업기록·정오표와 이후 제출에도 반영됩니다.';
END $$;
