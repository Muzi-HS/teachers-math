-- 학생 개인 로그인 계정을 위한 준비.
-- 학생관리에 전화번호(students.phone)가 입력되어 있으면 그 번호로 로그인할 수 있고,
-- 학부모 로그인과 동일하게 PIN(기본값 0000)으로 본인 확인을 한다.
ALTER TABLE students ADD COLUMN IF NOT EXISTS pin text DEFAULT '0000';

-- 학부모의 parents_update_pin_anon 정책과 동일한 역할 — 최초 로그인 시 PIN을 설정/변경할 수 있어야 한다.
DROP POLICY IF EXISTS students_update_pin_anon ON students;
CREATE POLICY students_update_pin_anon ON students FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- FCM 푸시 토큰을 학생 계정에도 등록할 수 있도록 확장.
-- 기존에는 parent_id가 NOT NULL이었는데, 학생 전용 토큰 행은 parent_id가 없으므로 nullable로 바꾸고,
-- 정확히 parent_id/student_id 둘 중 하나만 채워지도록 제약한다.
ALTER TABLE fcm_tokens ADD COLUMN IF NOT EXISTS student_id bigint REFERENCES students(id) ON DELETE CASCADE;
ALTER TABLE fcm_tokens ALTER COLUMN parent_id DROP NOT NULL;
ALTER TABLE fcm_tokens ADD CONSTRAINT fcm_tokens_owner_check
  CHECK ((parent_id IS NOT NULL) <> (student_id IS NOT NULL));
