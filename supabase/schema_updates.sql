-- classes 테이블: 활성화/비활성화 컬럼 추가
-- Supabase 대시보드 > SQL Editor에서 실행하세요
ALTER TABLE classes ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;

-- students 테이블: 학교 구분 + 학교별 이름 컬럼 추가
ALTER TABLE students ADD COLUMN IF NOT EXISTS school_type text;        -- '초등' | '중학' | '고등' | 'none' | NULL
ALTER TABLE students ADD COLUMN IF NOT EXISTS school_elementary text;  -- 초등학교 이름
ALTER TABLE students ADD COLUMN IF NOT EXISTS school_middle text;      -- 중학교 이름
-- 기존 school 컬럼 = 현재 다니는 학교 이름 (고등학교명 or 중학교명 등)
