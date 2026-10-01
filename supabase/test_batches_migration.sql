-- Run after auto_grading_migration.sql and test_review_and_late_assignees_migration.sql.
-- Existing assignees and attempts become round 1 without changing their results.
CREATE TABLE IF NOT EXISTS public.test_batches (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  test_id bigint NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  round_number integer NOT NULL CHECK (round_number > 0),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  class_id bigint REFERENCES public.classes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (test_id, round_number),
  UNIQUE (test_id, id)
);
ALTER TABLE public.test_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.test_batches FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.test_batches TO authenticated;
GRANT ALL ON public.test_batches TO service_role;
DROP POLICY IF EXISTS test_batches_staff_read ON public.test_batches;
CREATE POLICY test_batches_staff_read ON public.test_batches
  FOR SELECT TO authenticated USING (public.is_exam_staff());

ALTER TABLE public.test_assignees ADD COLUMN IF NOT EXISTS batch_id bigint;
INSERT INTO public.test_batches(test_id, round_number, name)
SELECT DISTINCT a.test_id, 1, '기본 응시'
FROM public.test_assignees a
ON CONFLICT (test_id, round_number) DO NOTHING;
UPDATE public.test_assignees a SET batch_id = b.id
FROM public.test_batches b
WHERE b.test_id = a.test_id AND b.round_number = 1 AND a.batch_id IS NULL;
ALTER TABLE public.test_assignees ALTER COLUMN batch_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_test_assignees_batch ON public.test_assignees(batch_id);

CREATE OR REPLACE FUNCTION public.set_initial_test_batch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.batch_id IS NULL THEN
    INSERT INTO public.test_batches(test_id, round_number, name)
    VALUES (NEW.test_id, 1, '기본 응시')
    ON CONFLICT (test_id, round_number) DO NOTHING;
    SELECT id INTO NEW.batch_id FROM public.test_batches
    WHERE test_id = NEW.test_id AND round_number = 1;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS set_initial_test_batch ON public.test_assignees;
CREATE TRIGGER set_initial_test_batch BEFORE INSERT ON public.test_assignees
  FOR EACH ROW EXECUTE FUNCTION public.set_initial_test_batch();

ALTER TABLE public.test_assignees DROP CONSTRAINT IF EXISTS test_assignees_batch_same_test;
ALTER TABLE public.test_assignees ADD CONSTRAINT test_assignees_batch_same_test
  FOREIGN KEY (test_id, batch_id) REFERENCES public.test_batches(test_id, id);

CREATE OR REPLACE FUNCTION public.add_auto_test_batch(
  p_test_id bigint, p_name text, p_class_id bigint, p_student_ids bigint[]
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE new_batch_id bigint;
DECLARE next_round integer;
DECLARE added integer;
BEGIN
  IF NOT public.is_exam_staff() THEN
    RAISE EXCEPTION '시험 관리 권한이 없습니다.';
  END IF;
  PERFORM 1 FROM public.tests WHERE id = p_test_id AND auto_grading FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '자동채점 시험을 찾을 수 없습니다.'; END IF;
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION '회차 이름을 1~100자로 입력하세요.';
  END IF;
  IF p_student_ids IS NULL OR cardinality(p_student_ids) = 0
     OR array_position(p_student_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION '추가할 학생을 선택하세요.';
  END IF;
  IF p_class_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.classes WHERE id = p_class_id) THEN
    RAISE EXCEPTION '반을 찾을 수 없습니다.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_student_ids) AS requested(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id = requested.id)
      OR (p_class_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.class_students cs
        WHERE cs.class_id = p_class_id AND cs.student_id = requested.id
      ))
  ) THEN RAISE EXCEPTION '선택한 반에 속하지 않거나 존재하지 않는 학생이 포함되어 있습니다.'; END IF;

  SELECT COALESCE(max(round_number), 0) + 1 INTO next_round
  FROM public.test_batches WHERE test_id = p_test_id;
  INSERT INTO public.test_batches(test_id, round_number, name, class_id)
  VALUES (p_test_id, next_round, btrim(p_name), p_class_id)
  RETURNING id INTO new_batch_id;
  INSERT INTO public.test_assignees(test_id, student_id, batch_id)
  SELECT p_test_id, requested.id, new_batch_id
  FROM (SELECT DISTINCT id FROM unnest(p_student_ids) AS ids(id)) requested
  ON CONFLICT (test_id, student_id) DO NOTHING;
  GET DIAGNOSTICS added = ROW_COUNT;
  IF added = 0 THEN RAISE EXCEPTION '새로 추가할 학생이 없습니다.'; END IF;
  RETURN new_batch_id;
END;
$$;
REVOKE ALL ON FUNCTION public.add_auto_test_batch(bigint, text, bigint, bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_auto_test_batch(bigint, text, bigint, bigint[]) TO authenticated;
