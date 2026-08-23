-- 문의하기(inquiries) 기능 추가
-- - inquiry_messages: 학부모 1명당 하나의 연속된 채팅 스레드(parent_id 기준)로 문의/답변을 저장
-- - admin_fcm_tokens: 관리자용 푸시 토큰 저장 (기존 fcm_tokens는 parent_id 전용이라 관리자용으로 별도 분리)
-- 관리자는 Supabase Auth로 로그인하므로 get_my_role()이 정상 동작하지만, 학부모는 전화번호+PIN
-- 방식(anon 롤)이라 다른 학부모 관련 테이블과 동일하게 anon에 열린 정책을 둡니다.
-- Supabase 대시보드 > SQL Editor에서 실행하세요

CREATE TABLE IF NOT EXISTS inquiry_messages (
  id bigint generated always as identity primary key,
  parent_id integer NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('parent', 'admin')),
  sender_teacher_id uuid,           -- sender_type='admin'일 때 작성한 관리자(teachers.user_id)
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz,           -- 관리자가 답변을 수정한 경우 설정
  is_read boolean DEFAULT false     -- 학부모 메시지를 관리자가 읽었는지 (관리자 목록 안읽음 표시용)
);
CREATE INDEX IF NOT EXISTS idx_inquiry_messages_parent_id ON inquiry_messages(parent_id);
CREATE INDEX IF NOT EXISTS idx_inquiry_messages_created_at ON inquiry_messages(created_at);

ALTER TABLE inquiry_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inquiry_messages_staff ON inquiry_messages;
DROP POLICY IF EXISTS inquiry_messages_select_anon ON inquiry_messages;
DROP POLICY IF EXISTS inquiry_messages_insert_anon ON inquiry_messages;

-- 관리자: 전체 조회/작성/수정(답변 수정)/삭제(답변 삭제)
CREATE POLICY inquiry_messages_staff ON inquiry_messages
  FOR ALL TO public USING (get_my_role() = 'admin');

-- 학부모(anon): 조회는 전체 허용(다른 학부모 테이블과 동일하게 클라이언트에서 parent_id로 제한),
-- 작성은 sender_type='parent'인 자기 메시지만 허용. 학부모는 수정/삭제 불가.
CREATE POLICY inquiry_messages_select_anon ON inquiry_messages
  FOR SELECT TO anon USING (true);
CREATE POLICY inquiry_messages_insert_anon ON inquiry_messages
  FOR INSERT TO anon WITH CHECK (sender_type = 'parent');


-- 관리자용 FCM 토큰 (한 관리자 계정당 최신 토큰 1개 유지 — parents용 fcm_tokens와 동일한 방식)
CREATE TABLE IF NOT EXISTS admin_fcm_tokens (
  id bigint generated always as identity primary key,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_fcm_tokens_user_id ON admin_fcm_tokens(user_id);

ALTER TABLE admin_fcm_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_fcm_tokens_staff ON admin_fcm_tokens;
CREATE POLICY admin_fcm_tokens_staff ON admin_fcm_tokens
  FOR ALL TO public USING (get_my_role() = 'admin' AND user_id = auth.uid())
  WITH CHECK (get_my_role() = 'admin' AND user_id = auth.uid());
