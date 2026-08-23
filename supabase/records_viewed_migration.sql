-- 수업기록 '읽음' 확인 기능 추가
-- 학부모가 /parent/records에서 기록을 실제로 열람하면 viewed_at을 기록해 관리자 쪽에서
-- 푸시 발송 후 학부모가 읽었는지 확인할 수 있게 합니다.
-- 별도 RLS 정책 추가는 필요 없습니다 — records_update_anon 정책(anon 전체 UPDATE 허용)과
-- restrict_anon_record_update 트리거(학부모가 바꿀 수 없는 컬럼 목록)에 viewed_at이
-- 포함되어 있지 않으므로 이미 학부모가 자유롭게 갱신할 수 있습니다.
-- Supabase 대시보드 > SQL Editor에서 실행하세요

ALTER TABLE records ADD COLUMN IF NOT EXISTS viewed_at timestamptz;
