-- admin_reset_parent_pin / admin_reset_student_pin은 함수 안에서 is_teacher_or_admin()으로
-- 호출자를 확인하긴 하지만, PostgreSQL은 새로 만든 함수의 EXECUTE 권한을 기본적으로 PUBLIC
-- (즉 anon 포함 모든 역할)에게 자동으로 준다. GRANT ... TO authenticated만 추가했을 뿐 PUBLIC
-- 권한을 걷어내지 않아서, anon도 이 함수를 "호출"할 수는 있는 상태였다(내부 검사 때문에
-- 실제로는 거부되지만, 방어를 함수 내부 로직 하나에만 의존하는 건 위험하다). 기존
-- verify_test_student와 동일하게 PUBLIC/anon 권한을 명시적으로 회수한다.
-- Supabase 대시보드 > SQL Editor에서 실행하세요

REVOKE ALL ON FUNCTION public.admin_reset_parent_pin(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_reset_student_pin(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_parent_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_student_pin(int) TO authenticated;
