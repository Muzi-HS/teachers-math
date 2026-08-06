-- work_minutes 컬럼을 Generated Column에서 일반 컬럼으로 변환
-- Supabase 대시보드 > SQL Editor에서 실행하세요
-- (PostgreSQL 15 기준)

ALTER TABLE attendance_log ALTER COLUMN work_minutes DROP EXPRESSION;
