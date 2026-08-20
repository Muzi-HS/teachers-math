-- '조교'(assistant) 역할 추가
-- 원인: teachers.role 컬럼에 CHECK 제약(teachers_role_check)이 'admin'/'teacher' 두 값만
-- 허용하고 있어, 조교 역할을 추가하려면 이 제약을 넓혀야 합니다.
-- 조교(assistant) 권한은 기존 선생님(teacher) 권한과 동일하게 설정했고, 선생님(teacher)
-- 권한에는 수업기록 메뉴 열람 권한을 새로 추가했습니다 (앱 코드 lib/permissions.ts 참고).
-- Supabase 대시보드 > SQL Editor에서 실행하세요

ALTER TABLE teachers DROP CONSTRAINT teachers_role_check;
ALTER TABLE teachers ADD CONSTRAINT teachers_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'teacher'::text, 'assistant'::text]));
