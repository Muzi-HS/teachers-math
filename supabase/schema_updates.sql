-- classes 테이블: 활성화/비활성화 컬럼 추가
-- Supabase 대시보드 > SQL Editor에서 실행하세요
ALTER TABLE classes ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;

-- students 테이블: 학교 구분 컬럼 추가 (초등 | 중학 | 고등 | none | NULL)
ALTER TABLE students ADD COLUMN IF NOT EXISTS school_type text;
