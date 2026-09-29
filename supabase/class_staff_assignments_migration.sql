-- Run in Supabase SQL Editor before using class staff assignments.
-- A teacher or assistant may be assigned to several classes, and a class may
-- have several staff members. On first install, preserve existing staff access
-- by assigning every approved teacher and assistant to existing classes. Admins
-- can narrow assignments in the class screen. Re-running does not reassign them.

DO $$
BEGIN
  IF to_regclass('public.class_staff_assignments') IS NULL THEN
    CREATE TABLE public.class_staff_assignments (
      class_id bigint NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
      teacher_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      assigned_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (class_id, teacher_user_id)
    );
    INSERT INTO public.class_staff_assignments (class_id, teacher_user_id)
    SELECT c.id, t.user_id FROM public.classes c CROSS JOIN public.teachers t
    WHERE t.approved = true AND t.role IN ('teacher', 'assistant');
  END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_class_staff_assignments_user
  ON public.class_staff_assignments (teacher_user_id, class_id);

ALTER TABLE public.class_staff_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.class_staff_assignments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.class_staff_assignments TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_can_access_class(p_class_id bigint)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teachers t
    WHERE t.user_id = auth.uid() AND t.approved = true
      AND (
        t.role = 'admin'
        OR (t.role IN ('teacher', 'assistant') AND p_class_id IS NOT NULL
            AND EXISTS (SELECT 1 FROM public.class_staff_assignments a
                        WHERE a.class_id = p_class_id AND a.teacher_user_id = t.user_id))
      )
  );
$$;
REVOKE ALL ON FUNCTION public.staff_can_access_class(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_can_access_class(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_can_access_record(p_class_id bigint, p_student_id bigint)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.staff_can_access_class(p_class_id);
$$;
REVOKE ALL ON FUNCTION public.staff_can_access_record(bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_can_access_record(bigint, bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_can_create_record(p_class_id bigint, p_student_id bigint)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.staff_can_access_class(p_class_id)
    AND (p_class_id IS NULL OR EXISTS (
      SELECT 1 FROM public.class_students cs
      WHERE cs.class_id = p_class_id AND cs.student_id = p_student_id
    ));
$$;
REVOKE ALL ON FUNCTION public.staff_can_create_record(bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_can_create_record(bigint, bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.restrict_record_identity_for_staff()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.staff_can_access_class(NULL)
     AND (NEW.class_id IS DISTINCT FROM OLD.class_id
          OR NEW.student_id IS DISTINCT FROM OLD.student_id) THEN
    RAISE EXCEPTION 'Only an administrator may move a lesson record to another class or student';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS restrict_record_identity_for_staff ON public.records;
CREATE TRIGGER restrict_record_identity_for_staff
  BEFORE UPDATE ON public.records FOR EACH ROW
  EXECUTE FUNCTION public.restrict_record_identity_for_staff();

DROP POLICY IF EXISTS class_staff_assignments_read ON public.class_staff_assignments;
CREATE POLICY class_staff_assignments_read ON public.class_staff_assignments
  FOR SELECT TO authenticated
  USING (teacher_user_id = auth.uid() OR public.staff_can_access_class(NULL));

CREATE OR REPLACE FUNCTION public.set_class_staff_assignments(p_class_id bigint, p_user_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  requested uuid[];
BEGIN
  IF NOT public.staff_can_access_class(NULL) THEN
    RAISE EXCEPTION 'Only an approved administrator may assign class staff';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.classes WHERE id = p_class_id) THEN
    RAISE EXCEPTION 'Class not found';
  END IF;
  IF array_position(p_user_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid staff member';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT id), ARRAY[]::uuid[])
    INTO requested FROM unnest(COALESCE(p_user_ids, ARRAY[]::uuid[])) AS ids(id);
  IF EXISTS (
    SELECT 1 FROM unnest(requested) AS ids(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.teachers t
      WHERE t.user_id = ids.id AND t.approved = true
        AND t.role IN ('teacher', 'assistant')
    )
  ) THEN
    RAISE EXCEPTION 'Assignments require approved teachers or assistants';
  END IF;

  DELETE FROM public.class_staff_assignments
  WHERE class_id = p_class_id AND NOT (teacher_user_id = ANY(requested));
  INSERT INTO public.class_staff_assignments (class_id, teacher_user_id)
  SELECT p_class_id, id FROM unnest(requested) AS ids(id)
  ON CONFLICT (class_id, teacher_user_id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.set_class_staff_assignments(bigint, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_class_staff_assignments(bigint, uuid[]) TO authenticated;

-- Restrictive policies are combined with the existing staff policies. Parent
-- and student session RPCs use anon and are unaffected by these policies.
DROP POLICY IF EXISTS class_scope_read ON public.classes;
CREATE POLICY class_scope_read ON public.classes AS RESTRICTIVE
  FOR SELECT TO authenticated USING (public.staff_can_access_class(id));
DROP POLICY IF EXISTS class_scope_insert ON public.classes;
CREATE POLICY class_scope_insert ON public.classes AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.staff_can_access_class(NULL));
DROP POLICY IF EXISTS class_scope_update ON public.classes;
CREATE POLICY class_scope_update ON public.classes AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (public.staff_can_access_class(NULL)) WITH CHECK (public.staff_can_access_class(NULL));
DROP POLICY IF EXISTS class_scope_delete ON public.classes;
CREATE POLICY class_scope_delete ON public.classes AS RESTRICTIVE
  FOR DELETE TO authenticated USING (public.staff_can_access_class(NULL));
DROP POLICY IF EXISTS class_students_scope_read ON public.class_students;
CREATE POLICY class_students_scope_read ON public.class_students AS RESTRICTIVE
  FOR SELECT TO authenticated USING (public.staff_can_access_class(class_id));
DROP POLICY IF EXISTS class_students_scope_insert ON public.class_students;
CREATE POLICY class_students_scope_insert ON public.class_students AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.staff_can_access_class(NULL));
DROP POLICY IF EXISTS class_students_scope_update ON public.class_students;
CREATE POLICY class_students_scope_update ON public.class_students AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (public.staff_can_access_class(NULL)) WITH CHECK (public.staff_can_access_class(NULL));
DROP POLICY IF EXISTS class_students_scope_delete ON public.class_students;
CREATE POLICY class_students_scope_delete ON public.class_students AS RESTRICTIVE
  FOR DELETE TO authenticated USING (public.staff_can_access_class(NULL));
DROP POLICY IF EXISTS students_class_scope_read ON public.students;
CREATE POLICY students_class_scope_read ON public.students AS RESTRICTIVE
  FOR SELECT TO authenticated USING (
    public.staff_can_access_class(NULL) OR EXISTS (
      SELECT 1 FROM public.class_students cs
      WHERE cs.student_id = students.id AND public.staff_can_access_class(cs.class_id)
    )
  );
DROP POLICY IF EXISTS students_class_scope_insert ON public.students;
CREATE POLICY students_class_scope_insert ON public.students AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.staff_can_access_class(NULL));
DROP POLICY IF EXISTS students_class_scope_update ON public.students;
CREATE POLICY students_class_scope_update ON public.students AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (public.staff_can_access_class(NULL)) WITH CHECK (public.staff_can_access_class(NULL));
DROP POLICY IF EXISTS students_class_scope_delete ON public.students;
CREATE POLICY students_class_scope_delete ON public.students AS RESTRICTIVE
  FOR DELETE TO authenticated USING (public.staff_can_access_class(NULL));

DROP POLICY IF EXISTS records_class_scope_read ON public.records;
CREATE POLICY records_class_scope_read ON public.records AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (public.staff_can_access_record(class_id, student_id));
DROP POLICY IF EXISTS records_class_scope_insert ON public.records;
CREATE POLICY records_class_scope_insert ON public.records AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (public.staff_can_create_record(class_id, student_id));
DROP POLICY IF EXISTS records_class_scope_update ON public.records;
CREATE POLICY records_class_scope_update ON public.records AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (public.staff_can_access_record(class_id, student_id))
  WITH CHECK (public.staff_can_access_record(class_id, student_id));
DROP POLICY IF EXISTS records_class_scope_delete ON public.records;
CREATE POLICY records_class_scope_delete ON public.records AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (public.staff_can_access_record(class_id, student_id));

DROP POLICY IF EXISTS record_test_items_class_scope ON public.record_test_items;
CREATE POLICY record_test_items_class_scope ON public.record_test_items AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.records r WHERE r.id = record_id
                AND public.staff_can_access_record(r.class_id, r.student_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.records r WHERE r.id = record_id
                     AND public.staff_can_access_record(r.class_id, r.student_id)));
DROP POLICY IF EXISTS record_comments_class_scope ON public.record_comments;
CREATE POLICY record_comments_class_scope ON public.record_comments AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.records r WHERE r.id = record_id
                AND public.staff_can_access_record(r.class_id, r.student_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.records r WHERE r.id = record_id
                     AND public.staff_can_access_record(r.class_id, r.student_id)));

DROP POLICY IF EXISTS class_bulk_sends_staff_scope ON public.class_bulk_sends;
CREATE POLICY class_bulk_sends_staff_scope ON public.class_bulk_sends AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (public.staff_can_access_class(class_id))
  WITH CHECK (public.staff_can_access_class(class_id));
DROP POLICY IF EXISTS class_notices_staff_scope ON public.class_notices;
CREATE POLICY class_notices_staff_scope ON public.class_notices AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (public.staff_can_access_class(class_id))
  WITH CHECK (public.staff_can_access_class(class_id));

DROP POLICY IF EXISTS class_prep_progress_staff_scope ON public.class_prep_progress;
CREATE POLICY class_prep_progress_staff_scope ON public.class_prep_progress AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (public.staff_can_access_class(NULL) OR EXISTS (
    SELECT 1 FROM public.class_students cs WHERE cs.student_id = class_prep_progress.student_id
      AND public.staff_can_access_class(cs.class_id)
  ))
  WITH CHECK (public.staff_can_access_class(NULL) OR EXISTS (
    SELECT 1 FROM public.class_students cs WHERE cs.student_id = class_prep_progress.student_id
      AND public.staff_can_access_class(cs.class_id)
  ));
DROP POLICY IF EXISTS student_checkins_staff_scope ON public.student_checkins;
CREATE POLICY student_checkins_staff_scope ON public.student_checkins AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (public.staff_can_access_class(NULL) OR EXISTS (
    SELECT 1 FROM public.class_students cs WHERE cs.student_id = student_checkins.student_id
      AND public.staff_can_access_class(cs.class_id)
  ));
DROP POLICY IF EXISTS attendance_notices_staff_scope ON public.attendance_notices;
CREATE POLICY attendance_notices_staff_scope ON public.attendance_notices AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (public.staff_can_access_class(NULL) OR EXISTS (
    SELECT 1 FROM public.class_students cs WHERE cs.student_id = attendance_notices.student_id
      AND public.staff_can_access_class(cs.class_id)
  ));
