-- class_bulk_sends_migration.sql 실행 후 Supabase SQL Editor에서 실행하세요.
-- 목록 초기화는 수업기록 공개/발송 상태를 변경하지 않습니다.
BEGIN;
CREATE TABLE IF NOT EXISTS public.dashboard_pending_dismissals (
  record_id bigint PRIMARY KEY REFERENCES public.records(id) ON DELETE CASCADE
);
ALTER TABLE public.dashboard_pending_dismissals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dashboard_pending_dismissals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.dashboard_pending_dismissals TO authenticated;
DROP POLICY IF EXISTS dashboard_pending_dismissals_read ON public.dashboard_pending_dismissals;
CREATE POLICY dashboard_pending_dismissals_read ON public.dashboard_pending_dismissals
  FOR SELECT TO authenticated USING (public.is_teacher_or_admin());
DROP POLICY IF EXISTS dashboard_pending_dismissals_insert ON public.dashboard_pending_dismissals;
CREATE POLICY dashboard_pending_dismissals_insert ON public.dashboard_pending_dismissals
  FOR INSERT TO authenticated WITH CHECK (public.is_teacher_or_admin());

CREATE OR REPLACE VIEW public.dashboard_pending_class_sends WITH (security_invoker = true) AS
SELECT s.* FROM public.class_bulk_send_status s
WHERE s.clicked_at IS NULL AND EXISTS (
  SELECT 1 FROM public.records r
  LEFT JOIN (
    SELECT student_id, MAX(class_id) AS class_id FROM public.class_students GROUP BY student_id
  ) membership ON membership.student_id = r.student_id
  WHERE r.date = s.date AND r.is_draft = false
    AND COALESCE(r.class_id, membership.class_id) IS NOT DISTINCT FROM s.class_id
    AND NOT EXISTS (SELECT 1 FROM public.dashboard_pending_dismissals d WHERE d.record_id = r.id)
);
REVOKE ALL ON public.dashboard_pending_class_sends FROM PUBLIC, anon;
GRANT SELECT ON public.dashboard_pending_class_sends TO authenticated;

CREATE OR REPLACE FUNCTION public.reset_dashboard_pending_sends()
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NOT COALESCE(public.is_teacher_or_admin(), false) THEN
    RAISE EXCEPTION 'Only teachers and admins can reset pending sends';
  END IF;
  INSERT INTO public.dashboard_pending_dismissals(record_id)
  SELECT r.id FROM public.records r
  LEFT JOIN (
    SELECT student_id, MAX(class_id) AS class_id FROM public.class_students GROUP BY student_id
  ) membership ON membership.student_id = r.student_id
  JOIN public.class_bulk_send_status s ON s.date = r.date
    AND s.class_id IS NOT DISTINCT FROM COALESCE(r.class_id, membership.class_id)
  WHERE r.is_draft = false AND s.clicked_at IS NULL
  ON CONFLICT DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.reset_dashboard_pending_sends() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_dashboard_pending_sends() TO authenticated;
COMMIT;
