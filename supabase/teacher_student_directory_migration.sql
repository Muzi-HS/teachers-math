-- 선생님 학생관리 메뉴 배포 전 실행.
-- 전제: class_staff_assignments_migration.sql, student_schools_migration.sql.
BEGIN;
CREATE OR REPLACE FUNCTION public.teacher_student_directory()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.teachers
    WHERE user_id = auth.uid() AND approved = true AND role = 'teacher') THEN
    RAISE EXCEPTION '승인된 선생님만 담당 학생을 조회할 수 있습니다.' USING ERRCODE = '42501';
  END IF;
  WITH assigned_classes AS MATERIALIZED (
    SELECT c.id,c.name,c.active FROM public.classes c
    WHERE EXISTS (SELECT 1 FROM public.class_staff_assignments a
      WHERE a.class_id = c.id AND a.teacher_user_id = auth.uid())
  ), memberships AS MATERIALIZED (
    SELECT cs.student_id,cs.class_id FROM public.class_students cs
    JOIN assigned_classes c ON c.id = cs.class_id
  ), scoped_students AS MATERIALIZED (
    SELECT s.id,s.name,s.birth_year,s.school,s.school_type,s.reg_date
    FROM public.students s WHERE EXISTS (
      SELECT 1 FROM memberships m WHERE m.student_id = s.id)
  )
  SELECT jsonb_build_object(
    'students',coalesce((SELECT jsonb_agg(s ORDER BY s.name,s.id) FROM scoped_students s),'[]'::jsonb),
    'classes',coalesce((SELECT jsonb_agg(c ORDER BY c.name,c.id) FROM assigned_classes c),'[]'::jsonb),
    'memberships',coalesce((SELECT jsonb_agg(m ORDER BY m.class_id,m.student_id) FROM memberships m),'[]'::jsonb),
    'schools',coalesce((SELECT jsonb_agg(jsonb_build_object('student_id',ss.student_id,'school_type',ss.school_type,'school_name',ss.school_name) ORDER BY ss.student_id,ss.school_type)
      FROM public.student_schools ss JOIN scoped_students s ON s.id = ss.student_id),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.teacher_student_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_student_directory() TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
