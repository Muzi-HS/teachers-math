-- records 테이블에 푸시 알림 발송 추적 컬럼 추가
-- Supabase 대시보드 > SQL Editor에서 실행하세요

ALTER TABLE records ADD COLUMN IF NOT EXISTS push_sent boolean DEFAULT false;
ALTER TABLE records ADD COLUMN IF NOT EXISTS push_sent_at timestamptz;
