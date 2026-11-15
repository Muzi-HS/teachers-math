-- student_enrollment_stats_migration.sql 및 teacher_student_directory_migration.sql 적용 후 실행.
BEGIN;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS enrollment_status text NOT NULL DEFAULT 'enrolled'
  CHECK (enrollment_status IN ('enrolled','withdrawn','prospective'));
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS withdrawn_on date;

CREATE OR REPLACE FUNCTION public.set_student_withdrawal_date()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.enrollment_status = 'withdrawn' THEN
    NEW.withdrawn_on := coalesce(NEW.withdrawn_on,(now() AT TIME ZONE 'Asia/Seoul')::date);
  ELSE
    NEW.withdrawn_on := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS set_student_withdrawal_date ON public.students;
CREATE TRIGGER set_student_withdrawal_date BEFORE INSERT OR UPDATE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.set_student_withdrawal_date();

CREATE OR REPLACE FUNCTION public.track_student_enrollment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.student_enrollment_history
    SET withdrawn_on=coalesce(OLD.withdrawn_on,(now() AT TIME ZONE 'Asia/Seoul')::date),
      registered_on=OLD.reg_date::date,is_test=OLD.is_test OR OLD.enrollment_status='prospective'
    WHERE student_id=OLD.id;
    RETURN OLD;
  END IF;
  INSERT INTO public.student_enrollment_history(student_id,registered_on,withdrawn_on,is_test)
  VALUES(NEW.id,NEW.reg_date::date,NEW.withdrawn_on,NEW.is_test OR NEW.enrollment_status='prospective')
  ON CONFLICT(student_id) DO UPDATE SET registered_on=EXCLUDED.registered_on,
    withdrawn_on=EXCLUDED.withdrawn_on,is_test=EXCLUDED.is_test;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.track_student_enrollment() FROM PUBLIC, anon, authenticated;
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
    SELECT s.id,s.name,s.birth_year,s.school,s.school_type,s.reg_date,s.phone,s.parent_phone,s.enrollment_status
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
