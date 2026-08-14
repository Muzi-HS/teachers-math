-- student_schools RLS 정책 추가
-- 원인: student_schools 테이블에 Row Level Security는 켜져 있는데(또는 프로젝트 기본값으로 자동
-- 활성화됨) INSERT/UPDATE/DELETE를 허용하는 정책이 하나도 없어서, 학생 등록/수정 시
-- "new row violates row-level security policy for table student_schools" 오류가 발생하고
-- 학교 이력 저장이 실패했습니다. (이 실패로 인해 신규 학생 등록도 함께 실패한 것처럼 보였습니다.)
-- Supabase 대시보드 > SQL Editor에서 실행하세요

ALTER TABLE student_schools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "student_schools_select" ON student_schools;
DROP POLICY IF EXISTS "student_schools_insert" ON student_schools;
DROP POLICY IF EXISTS "student_schools_update" ON student_schools;
DROP POLICY IF EXISTS "student_schools_delete" ON student_schools;

-- 이 앱은 로그인한 선생님/관리자가 별도 행 단위 제한 없이 학생 데이터를 관리하는
-- 내부 도구이므로, students/classes 테이블과 동일하게 인증된 사용자에게 전체 권한을 허용합니다.
CREATE POLICY "student_schools_select" ON student_schools
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "student_schools_insert" ON student_schools
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "student_schools_update" ON student_schools
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "student_schools_delete" ON student_schools
  FOR DELETE TO authenticated USING (true);
