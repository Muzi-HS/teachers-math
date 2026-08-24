-- 공지사항 댓글: 학부모도 이미 있는 댓글 스레드에 계속 답글을 남길 수 있도록 허용
-- (기존 정책은 parent_comment_id가 항상 null인 최상위 댓글만 허용해서 학부모가
-- 대댓글 스레드에는 참여할 수 없었음)
-- - 새 최상위 댓글(parent_comment_id 없음) 작성은 그대로 허용
-- - 이미 있는 "최상위" 댓글에 대한 답글도 허용(2단계까지만 — 답글에 대한 답글은 불가,
--   parent_comment_id가 가리키는 대상이 반드시 최상위 댓글이어야 함)
-- notice_targeting_and_comments_migration.sql을 먼저 실행한 뒤 이 파일을 실행하세요

DROP POLICY IF EXISTS notice_comments_insert_anon ON notice_comments;

CREATE POLICY notice_comments_insert_anon ON notice_comments
  FOR INSERT TO anon WITH CHECK (
    sender_type = 'parent'
    AND (
      parent_comment_id IS NULL
      OR EXISTS (
        SELECT 1 FROM notice_comments pc
        WHERE pc.id = notice_comments.parent_comment_id
          AND pc.parent_comment_id IS NULL
      )
    )
  );
