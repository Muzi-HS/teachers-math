-- 학생 시험 메뉴의 목록 조회는 학생 ID로 응시 대상과 진행 중인 응시를 찾는다.
-- 기존 PK/UNIQUE 인덱스는 시험 ID가 첫 컬럼이라 학생 ID 단독 조건에 적합하지 않다.
-- Supabase SQL Editor에서 실행. 기존 데이터와 시험 권한은 변경하지 않는다.

CREATE INDEX IF NOT EXISTS idx_test_assignees_student_test
  ON public.test_assignees (student_id, test_id);

CREATE INDEX IF NOT EXISTS idx_test_attempts_student_pending
  ON public.test_attempts (student_id, deadline_at)
  WHERE submitted_at IS NULL;
