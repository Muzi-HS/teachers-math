-- 학생 학교 이력(여러 학교) 테이블 추가
-- Supabase 대시보드 > SQL Editor에서 실행하세요

CREATE TABLE IF NOT EXISTS student_schools (
  id bigint generated always as identity primary key,
  student_id bigint NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_type text NOT NULL,   -- '초등' | '중학' | '고등'
  school_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_schools_student_id ON student_schools(student_id);

-- 기존 students.school / school_elementary / school_middle 값을 이력 테이블로 이전
INSERT INTO student_schools (student_id, school_type, school_name)
SELECT id, school_type, school
FROM students
WHERE school_type IN ('초등', '중학', '고등') AND school IS NOT NULL AND school <> '';

INSERT INTO student_schools (student_id, school_type, school_name)
SELECT id, '초등', school_elementary
FROM students
WHERE school_elementary IS NOT NULL AND school_elementary <> '';

INSERT INTO student_schools (student_id, school_type, school_name)
SELECT id, '중학', school_middle
FROM students
WHERE school_middle IS NOT NULL AND school_middle <> '';

-- 참고: students.school / school_type 컬럼은 계속 "현재(최상위) 학교" 캐시로 사용됩니다.
-- school_elementary / school_middle 컬럼은 더 이상 앱에서 사용하지 않지만, 데이터 보존을 위해 삭제하지 않았습니다.
