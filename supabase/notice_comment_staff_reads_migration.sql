-- Apply before deploying the updated client. Read status is tracked per staff account.
BEGIN;
CREATE TABLE IF NOT EXISTS public.notice_comment_staff_reads (
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_id bigint NOT NULL REFERENCES public.notice_comments(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, comment_id)
);
ALTER TABLE public.notice_comment_staff_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_staff_reads ON public.notice_comment_staff_reads;
CREATE POLICY own_staff_reads ON public.notice_comment_staff_reads FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_teacher_or_admin())
  WITH CHECK (user_id = auth.uid() AND public.is_teacher_or_admin()
    AND EXISTS (SELECT 1 FROM public.notice_comments c WHERE c.id = comment_id));
GRANT SELECT, INSERT, UPDATE ON public.notice_comment_staff_reads TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_notice_comment_counts()
RETURNS TABLE (notice_id bigint, total_count bigint, unread_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT c.notice_id::bigint, count(*),
    count(*) FILTER (WHERE c.sender_type = 'parent' AND r.comment_id IS NULL)
  FROM public.notice_comments c
  LEFT JOIN public.notice_comment_staff_reads r ON r.comment_id = c.id AND r.user_id = auth.uid()
  WHERE public.is_teacher_or_admin()
  GROUP BY c.notice_id;
$$;
REVOKE ALL ON FUNCTION public.staff_notice_comment_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_notice_comment_counts() TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
