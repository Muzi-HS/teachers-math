-- 반 정보(반 이름, 오늘 수업 시간 배너 등)가 학부모/학생 화면에 안 보이던 원인.
-- classes/class_students 테이블에는 anon(비로그인 키)이 읽을 수 있는 정책이 없고,
-- 실제 Supabase Auth 세션 없이 커스텀 전화번호+PIN으로만 로그인하는 학부모/학생
-- 계정은 JWT의 parent_phone 클레임이 비어 있어 기존 classes_parent/class_students_parent
-- 정책도 통과하지 못한다 — 그래서 조회 자체가 조용히 빈 결과로 걸러졌다.
-- students/records/tests 등 다른 테이블처럼 anon 전체 SELECT를 허용해 클라이언트가
-- 알고 있는 id로 걸러서 쓰는 기존 방식과 동일하게 맞춘다.
DROP POLICY IF EXISTS classes_select_anon ON classes;
CREATE POLICY classes_select_anon ON classes FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS class_students_select_anon ON class_students;
CREATE POLICY class_students_select_anon ON class_students FOR SELECT TO anon USING (true);
