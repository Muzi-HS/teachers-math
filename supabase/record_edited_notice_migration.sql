-- 발송(released_to_parent)된 수업기록을 나중에 수정하면, 학부모 계정 수업기록
-- 화면 맨 위에 "수정되었습니다" 안내가 뜨도록 하기 위한 컬럼.
-- 학부모가 그 안내를 확인하면(페이지 진입 시 자동) null로 되돌려 다음 방문부터는
-- 다시 뜨지 않게 한다.
ALTER TABLE records ADD COLUMN IF NOT EXISTS edited_at timestamptz;
