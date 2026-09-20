-- Supabase SQL Editor에서 실행하세요.
-- 일괄 발송은 학부모에게 수업기록을 공개하는 것입니다. 푸시 수신 여부는 무관합니다.
-- 이미 이 파일을 실행했어도, 아래 release_class_records 함수 추가를 위해 다시 실행하세요.
-- 과거 push_sent/released_to_parent로는 일괄/개별 발송을 구분할 수 없어 소급하지 않습니다.
CREATE TABLE IF NOT EXISTS public.class_bulk_sends (
  date date NOT NULL,
  class_id bigint REFERENCES public.classes(id) ON DELETE CASCADE,
  class_key bigint GENERATED ALWAYS AS (COALESCE(class_id, 0)) STORED,
  clicked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (date, class_key)
);
ALTER TABLE public.class_bulk_sends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS class_bulk_sends_read ON public.class_bulk_sends;
CREATE POLICY class_bulk_sends_read ON public.class_bulk_sends
  FOR SELECT TO authenticated USING (public.is_teacher_or_admin());
DROP POLICY IF EXISTS class_bulk_sends_insert ON public.class_bulk_sends;
CREATE POLICY class_bulk_sends_insert ON public.class_bulk_sends
  FOR INSERT TO authenticated WITH CHECK (public.is_teacher_or_admin());
GRANT SELECT, INSERT ON public.class_bulk_sends TO authenticated;

-- 공개와 이력을 함께 저장하므로 오류가 나면 둘 다 롤백됩니다.
CREATE OR REPLACE FUNCTION public.release_class_records(p_date date, p_class_id bigint)
RETURNS bigint[]
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  target_ids bigint[];
  released_ids bigint[];
BEGIN
  IF NOT COALESCE(public.is_teacher_or_admin(), false) THEN
    RAISE EXCEPTION 'Only teachers and admins can release class records';
  END IF;

  SELECT array_agg(r.id) INTO target_ids
  FROM public.records r
  LEFT JOIN (
    SELECT student_id, MAX(class_id) AS class_id FROM public.class_students GROUP BY student_id
  ) membership ON membership.student_id = r.student_id
  WHERE r.date = p_date AND r.is_draft = false
    AND COALESCE(r.class_id, membership.class_id) IS NOT DISTINCT FROM p_class_id;

  IF COALESCE(cardinality(target_ids), 0) = 0 THEN
    RAISE EXCEPTION 'No class records to release';
  END IF;

  WITH released AS (
    UPDATE public.records SET released_to_parent = true
    WHERE id = ANY(target_ids) AND is_draft = false
    RETURNING id
  )
  SELECT array_agg(id) INTO released_ids FROM released;

  IF COALESCE(cardinality(released_ids), 0) <> cardinality(target_ids) THEN
    RAISE EXCEPTION 'Could not release all class records';
  END IF;

  INSERT INTO public.class_bulk_sends (date, class_id)
  VALUES (p_date, p_class_id)
  ON CONFLICT (date, class_key) DO NOTHING;

  RETURN released_ids;
END;
$$;
REVOKE ALL ON FUNCTION public.release_class_records(date, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_class_records(date, bigint) TO authenticated;

-- 이전 기록의 class_id가 없으면 수업기록 화면과 동일하게 현재 소속 반으로 묶습니다.
CREATE OR REPLACE VIEW public.class_bulk_send_status WITH (security_invoker = true) AS
WITH grouped AS (
  SELECT r.date, COALESCE(r.class_id, membership.class_id) AS class_id, COUNT(*) AS record_count
  FROM public.records r
  LEFT JOIN (
    SELECT student_id, MAX(class_id) AS class_id FROM public.class_students GROUP BY student_id
  ) membership ON membership.student_id = r.student_id
  WHERE r.is_draft = false
  GROUP BY r.date, COALESCE(r.class_id, membership.class_id)
)
SELECT g.date, g.class_id, g.record_count, b.clicked_at
FROM grouped g
LEFT JOIN public.class_bulk_sends b
  ON b.date = g.date AND b.class_key = COALESCE(g.class_id, 0);
REVOKE ALL ON public.class_bulk_send_status FROM anon;
GRANT SELECT ON public.class_bulk_send_status TO authenticated;
