-- is_teacher_or_admin() 함수에 'assistant'(조교) 역할 반영
-- 원인: 이 함수가 role IN ('admin', 'teacher')로 하드코딩되어 있어서, 조교 역할을
-- 추가한 뒤 어떤 선생님 계정을 '조교'로 변경하면 이 함수가 그 계정에 대해 false를
-- 반환하게 됩니다. 이 함수는 teachers 테이블 자체의 SELECT 정책을 포함해
-- students/parents/classes/records/tests/notices/events/attendance 등 거의
-- 모든 스태프용 RLS 정책에서 쓰이고 있어서, 조교로 바뀐 계정은 로그인 시 자기 자신의
-- teachers 행조차 조회하지 못해 "계정 정보를 찾을 수 없습니다" 오류로 로그인이
-- 실패했던 것입니다.
-- Supabase 대시보드 > SQL Editor에서 실행하세요

CREATE OR REPLACE FUNCTION public.is_teacher_or_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM teachers
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'teacher', 'assistant')
  );
$function$;
