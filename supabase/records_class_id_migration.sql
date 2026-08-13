-- 수업기록(records)에 class_id 컬럼 추가 — 기록이 "어느 반 소속으로 작성됐는지"를 저장 시점에 고정
-- Supabase 대시보드 > SQL Editor에서 실행하세요
--
-- 배경: 기존에는 records 테이블에 class_id가 없어서, 수업기록 메뉴에서 반별로 묶어 보여줄 때
-- 학생의 "현재" class_students 소속을 기준으로 반을 추정했습니다. 학생이 여러 반에 속해 있으면
-- (예: TS B반 + 도형특강반) 어느 반에서 작성한 기록이든 마지막으로 조회된 반 하나로만 뭉뚱그려
-- 표시되는 문제가 있었습니다. 이제 기록 저장 시 class_id를 함께 저장하여 항상 정확한 반에 귀속됩니다.

ALTER TABLE records ADD COLUMN IF NOT EXISTS class_id bigint REFERENCES classes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_records_class_id ON records(class_id);

-- 기존 기록 중 학생이 정확히 하나의 반에만 소속된 경우(모호하지 않은 경우)만 class_id를 보정합니다.
-- 여러 반에 소속된 학생의 과거 기록은 어느 반에서 작성됐는지 알 수 없으므로 NULL로 남겨두며,
-- 화면에는 기존 방식(현재 소속 반 추정)으로 계속 표시됩니다.
WITH single_class_students AS (
  SELECT student_id, MIN(class_id) AS class_id
  FROM class_students
  GROUP BY student_id
  HAVING COUNT(*) = 1
)
UPDATE records r
SET class_id = scs.class_id
FROM single_class_students scs
WHERE r.student_id = scs.student_id AND r.class_id IS NULL;
