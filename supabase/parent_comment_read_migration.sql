-- 학부모 의견(parent_comment) '관리자 확인' 추적 기능 추가
-- 문의하기의 안읽음 표시와 동일한 개념을, 수업기록에 남기는 학부모 의견에도 적용합니다.
-- 관리자/선생님이 해당 날짜의 수업기록을 열람하면 parent_comment_read_at을 기록해
-- 사이드바 메뉴/대시보드/달력에서 "아직 확인하지 않은 학부모 의견"을 표시할 수 있게 합니다.
-- (records_staff 정책이 이미 관리자/선생님/조교의 전체 UPDATE를 허용하고 있어
-- 별도 RLS 정책 추가는 필요 없습니다)
-- Supabase 대시보드 > SQL Editor에서 실행하세요

ALTER TABLE records ADD COLUMN IF NOT EXISTS parent_comment_read_at timestamptz;
