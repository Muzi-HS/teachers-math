-- 학부모가 본인이 등록한 결석/지각을 수정·삭제할 수 있도록 허용
-- (기존에는 등록만 가능하고 수정/삭제는 관리자만 가능했음)
-- 다른 학부모 테이블과 동일하게 anon 전체 허용 + 클라이언트에서 parent_id로 제한하는
-- 방식을 그대로 따릅니다 (학부모는 Supabase Auth 세션이 없어 RLS로 본인 행만
-- 제한할 방법이 없음)
-- attendance_notices_migration.sql을 먼저 실행한 뒤 이 파일을 실행하세요

DROP POLICY IF EXISTS attendance_notices_update_anon ON attendance_notices;
DROP POLICY IF EXISTS attendance_notices_delete_anon ON attendance_notices;

CREATE POLICY attendance_notices_update_anon ON attendance_notices
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY attendance_notices_delete_anon ON attendance_notices
  FOR DELETE TO anon USING (true);
