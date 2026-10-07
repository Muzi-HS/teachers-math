-- Run after class_staff_assignments_migration.sql. Safe to run again.
ALTER TABLE public.class_staff_assignments
  ADD COLUMN IF NOT EXISTS assignment_role text;
UPDATE public.class_staff_assignments a
SET assignment_role = CASE WHEN t.role = 'assistant' THEN 'assistant' ELSE 'teacher' END
FROM public.teachers t WHERE t.user_id = a.teacher_user_id AND a.assignment_role IS NULL;
ALTER TABLE public.class_staff_assignments ALTER COLUMN assignment_role SET DEFAULT 'teacher';
ALTER TABLE public.class_staff_assignments ALTER COLUMN assignment_role SET NOT NULL;
ALTER TABLE public.class_staff_assignments DROP CONSTRAINT IF EXISTS class_staff_assignment_role_check;
ALTER TABLE public.class_staff_assignments ADD CONSTRAINT class_staff_assignment_role_check
  CHECK (assignment_role IN ('teacher', 'assistant'));

CREATE OR REPLACE FUNCTION public.set_class_staff_roles(
  p_class_id bigint, p_teacher_ids uuid[], p_assistant_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.staff_can_access_class(NULL) THEN
    RAISE EXCEPTION 'Only an approved administrator may assign class staff';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.classes WHERE id = p_class_id) THEN
    RAISE EXCEPTION 'Class not found';
  END IF;
  IF array_position(p_teacher_ids, NULL) IS NOT NULL
    OR array_position(p_assistant_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid staff member';
  END IF;
  IF COALESCE(p_teacher_ids, ARRAY[]::uuid[]) && COALESCE(p_assistant_ids, ARRAY[]::uuid[]) THEN
    RAISE EXCEPTION 'Choose one assignment role per staff member';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_teacher_ids) ids(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.teachers t WHERE t.user_id = ids.id
      AND t.approved = true AND t.role IN ('admin', 'teacher')))
    OR EXISTS (SELECT 1 FROM unnest(p_assistant_ids) ids(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.teachers t WHERE t.user_id = ids.id
      AND t.approved = true AND t.role IN ('teacher', 'assistant'))) THEN
    RAISE EXCEPTION 'Invalid staff role or approval';
  END IF;
  DELETE FROM public.class_staff_assignments WHERE class_id = p_class_id;
  INSERT INTO public.class_staff_assignments(class_id, teacher_user_id, assignment_role)
    SELECT p_class_id, id, 'teacher' FROM (SELECT DISTINCT unnest(p_teacher_ids) id) members
    UNION ALL
    SELECT p_class_id, id, 'assistant' FROM (SELECT DISTINCT unnest(p_assistant_ids) id) members;
END;
$$;
REVOKE ALL ON FUNCTION public.set_class_staff_roles(bigint, uuid[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_class_staff_roles(bigint, uuid[], uuid[]) TO authenticated;
