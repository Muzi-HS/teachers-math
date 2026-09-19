-- Supabase SQL Editor에서 실행하세요.
-- 실제 푸시 성공 여부와 별도로 날짜·반별 일괄 발송 버튼 실행을 저장합니다.
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
