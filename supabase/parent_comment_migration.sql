-- 학부모 의견(parent_comment) 기능 추가
-- 학부모는 Supabase Auth 세션이 아니라 anon 키로 접속하므로(전화번호+PIN 로그인),
-- records 테이블에 anon UPDATE를 허용하는 정책이 새로 필요합니다. 다만 anon 롤은
-- records 테이블에 테이블 단위 UPDATE 권한이 이미 부여되어 있어(다른 컬럼도 select('*')로
-- 노출되는 구조), 정책만 열어주면 학부모가 성적/피드백 등 다른 컬럼까지 고칠 수 있게 됩니다.
-- 이를 막기 위해 트리거로 anon 롤은 parent_comment/parent_comment_at 외의 컬럼을
-- 바꿀 수 없도록 이중으로 막아둡니다.
-- Supabase 대시보드 > SQL Editor에서 실행하세요

ALTER TABLE records ADD COLUMN IF NOT EXISTS parent_comment text;
ALTER TABLE records ADD COLUMN IF NOT EXISTS parent_comment_at timestamptz;

DROP POLICY IF EXISTS records_update_anon ON records;
CREATE POLICY records_update_anon ON records
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.restrict_anon_record_update()
RETURNS trigger AS $$
BEGIN
  IF auth.role() = 'anon' THEN
    IF NEW.student_id  IS DISTINCT FROM OLD.student_id
      OR NEW.class_id  IS DISTINCT FROM OLD.class_id
      OR NEW.date      IS DISTINCT FROM OLD.date
      OR NEW.content   IS DISTINCT FROM OLD.content
      OR NEW.homework  IS DISTINCT FROM OLD.homework
      OR NEW.hw_rate   IS DISTINCT FROM OLD.hw_rate
      OR NEW.hw_cor    IS DISTINCT FROM OLD.hw_cor
      OR NEW.attitude  IS DISTINCT FROM OLD.attitude
      OR NEW.late      IS DISTINCT FROM OLD.late
      OR NEW.has_test  IS DISTINCT FROM OLD.has_test
      OR NEW.feedback  IS DISTINCT FROM OLD.feedback
      OR NEW.is_draft  IS DISTINCT FROM OLD.is_draft
      OR NEW.push_sent IS DISTINCT FROM OLD.push_sent
      OR NEW.sms_sent  IS DISTINCT FROM OLD.sms_sent
    THEN
      RAISE EXCEPTION '학부모 계정은 의견(parent_comment) 외의 항목은 수정할 수 없습니다.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_restrict_anon_record_update ON records;
CREATE TRIGGER trg_restrict_anon_record_update
  BEFORE UPDATE ON records
  FOR EACH ROW EXECUTE FUNCTION public.restrict_anon_record_update();
