-- attendance_log 테이블에 추가할 컬럼
-- Supabase 대시보드 > SQL Editor에서 실행하세요

ALTER TABLE attendance_log ADD COLUMN IF NOT EXISTS slots jsonb DEFAULT '[]'::jsonb;
ALTER TABLE attendance_log ADD COLUMN IF NOT EXISTS approved boolean DEFAULT false;
ALTER TABLE attendance_log ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE attendance_log ADD COLUMN IF NOT EXISTS approved_at timestamptz;
