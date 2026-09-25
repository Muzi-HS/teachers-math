-- SQL Editor에서 실행 후 결과 JSON을 전달하세요. 개인정보/키/PIN 해시를 조회하지 않습니다.
-- 읽기 전용: 정책, 컬럼 이름/자료형, FK, 인덱스, 함수 권한과 PIN 패치 여부만 확인합니다.
BEGIN TRANSACTION READ ONLY;
SELECT jsonb_build_object(
  'tables', (
    SELECT jsonb_agg(jsonb_build_object('table', c.relname, 'rls', c.relrowsecurity,
      'force_rls', c.relforcerowsecurity))
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
  ),
  'columns', (
    SELECT jsonb_agg(jsonb_build_object('table', table_name, 'column', column_name,
      'type', data_type, 'nullable', is_nullable))
    FROM information_schema.columns WHERE table_schema = 'public'
  ),
  'policies', (
    SELECT jsonb_agg(jsonb_build_object('table', tablename, 'name', policyname,
      'roles', roles, 'command', cmd, 'mode', permissive, 'using', qual, 'check', with_check))
    FROM pg_policies WHERE schemaname = 'public'
  ),
  'grants', (
    SELECT jsonb_agg(jsonb_build_object('table', table_name, 'role', grantee, 'privilege', privilege_type))
    FROM information_schema.table_privileges WHERE table_schema = 'public'
      AND grantee IN ('anon','authenticated','PUBLIC')
  ),
  'column_grants', (
    SELECT jsonb_agg(jsonb_build_object('table', table_name, 'column', column_name,
      'role', grantee, 'privilege', privilege_type))
    FROM information_schema.column_privileges WHERE table_schema = 'public'
      AND grantee IN ('anon','authenticated','PUBLIC')
  ),
  'foreign_keys', (
    SELECT jsonb_agg(jsonb_build_object('table', c.conrelid::regclass::text,
      'name', c.conname, 'definition', pg_get_constraintdef(c.oid)))
    FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public' AND c.contype = 'f'
  ),
  'indexes', (
    SELECT jsonb_agg(jsonb_build_object('table', tablename, 'definition', indexdef))
    FROM pg_indexes WHERE schemaname = 'public'
  ),
  'pin_and_auth_functions', (
    SELECT jsonb_agg(jsonb_build_object('signature', p.oid::regprocedure::text,
      'security_definer', p.prosecdef,
      'anon_execute', has_function_privilege('anon',p.oid,'EXECUTE'),
      'authenticated_execute', has_function_privilege('authenticated',p.oid,'EXECUTE'),
      'null_guard', position('IS DISTINCT FROM v_hash' IN p.prosrc) > 0,
      'checks_approved', position('approved' IN p.prosrc) > 0))
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'verify_parent_pin','verify_student_pin','update_parent_pin','update_student_pin',
      'is_teacher_or_admin','is_admin','admin_reset_parent_pin','admin_reset_student_pin',
      'save_notice_with_targets','admin_analytics_summary')
  )
) AS security_audit;
COMMIT;
