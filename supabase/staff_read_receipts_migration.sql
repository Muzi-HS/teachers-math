-- Apply in Supabase SQL Editor before deploying the updated client.
-- Shared legacy flags cannot identify who read a message; existing messages start unread per account.
BEGIN;

CREATE TABLE IF NOT EXISTS public.inquiry_messages_staff_reads (
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id bigint NOT NULL REFERENCES public.inquiry_messages(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);
ALTER TABLE public.inquiry_messages_staff_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_staff_reads ON public.inquiry_messages_staff_reads;
CREATE POLICY own_staff_reads ON public.inquiry_messages_staff_reads FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_teacher_or_admin())
  WITH CHECK (user_id = auth.uid() AND public.is_teacher_or_admin()
    AND EXISTS (SELECT 1 FROM public.inquiry_messages source WHERE source.id = message_id));
GRANT SELECT, INSERT, UPDATE ON public.inquiry_messages_staff_reads TO authenticated;

-- Preserve the source shape and RLS, replacing only the shared read flag.
DO $$
DECLARE columns_sql text;
BEGIN
  SELECT string_agg(CASE WHEN attname = 'is_read'
    THEN '(receipt.user_id IS NOT NULL) AS is_read' ELSE format('source.%I', attname) END, ', ' ORDER BY attnum)
  INTO columns_sql FROM pg_attribute
  WHERE attrelid = 'public.inquiry_messages'::regclass AND attnum > 0 AND NOT attisdropped;
  EXECUTE format('CREATE OR REPLACE VIEW public.staff_inquiry_messages WITH (security_invoker = true) AS SELECT %s FROM public.inquiry_messages source LEFT JOIN public.inquiry_messages_staff_reads receipt ON receipt.message_id = source.id AND receipt.user_id = auth.uid()', columns_sql);
END $$;
REVOKE ALL ON public.staff_inquiry_messages FROM PUBLIC, anon;
GRANT SELECT ON public.staff_inquiry_messages TO authenticated;

CREATE TABLE IF NOT EXISTS public.records_staff_reads (
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  record_id bigint NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, record_id)
);
ALTER TABLE public.records_staff_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_staff_reads ON public.records_staff_reads;
CREATE POLICY own_staff_reads ON public.records_staff_reads FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_teacher_or_admin())
  WITH CHECK (user_id = auth.uid() AND public.is_teacher_or_admin()
    AND EXISTS (SELECT 1 FROM public.records source WHERE source.id = record_id));
GRANT SELECT, INSERT, UPDATE ON public.records_staff_reads TO authenticated;

-- Preserve the source shape and RLS, replacing only the shared read flag.
DO $$
DECLARE columns_sql text;
BEGIN
  SELECT string_agg(CASE WHEN attname = 'parent_comment_read_at'
    THEN 'receipt.read_at AS parent_comment_read_at' ELSE format('source.%I', attname) END, ', ' ORDER BY attnum)
  INTO columns_sql FROM pg_attribute
  WHERE attrelid = 'public.records'::regclass AND attnum > 0 AND NOT attisdropped;
  EXECUTE format('CREATE OR REPLACE VIEW public.staff_records WITH (security_invoker = true) AS SELECT %s FROM public.records source LEFT JOIN public.records_staff_reads receipt ON receipt.record_id = source.id AND receipt.user_id = auth.uid()', columns_sql);
END $$;
REVOKE ALL ON public.staff_records FROM PUBLIC, anon;
GRANT SELECT ON public.staff_records TO authenticated;

CREATE TABLE IF NOT EXISTS public.record_comments_staff_reads (
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_id bigint NOT NULL REFERENCES public.record_comments(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, comment_id)
);
ALTER TABLE public.record_comments_staff_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_staff_reads ON public.record_comments_staff_reads;
CREATE POLICY own_staff_reads ON public.record_comments_staff_reads FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_teacher_or_admin())
  WITH CHECK (user_id = auth.uid() AND public.is_teacher_or_admin()
    AND EXISTS (SELECT 1 FROM public.record_comments source WHERE source.id = comment_id));
GRANT SELECT, INSERT, UPDATE ON public.record_comments_staff_reads TO authenticated;

-- Preserve the source shape and RLS, replacing only the shared read flag.
DO $$
DECLARE columns_sql text;
BEGIN
  SELECT string_agg(CASE WHEN attname = 'is_read'
    THEN '(receipt.user_id IS NOT NULL) AS is_read' ELSE format('source.%I', attname) END, ', ' ORDER BY attnum)
  INTO columns_sql FROM pg_attribute
  WHERE attrelid = 'public.record_comments'::regclass AND attnum > 0 AND NOT attisdropped;
  EXECUTE format('CREATE OR REPLACE VIEW public.staff_record_comments WITH (security_invoker = true) AS SELECT %s FROM public.record_comments source LEFT JOIN public.record_comments_staff_reads receipt ON receipt.comment_id = source.id AND receipt.user_id = auth.uid()', columns_sql);
END $$;
REVOKE ALL ON public.staff_record_comments FROM PUBLIC, anon;
GRANT SELECT ON public.staff_record_comments TO authenticated;

DO $$
DECLARE definition text;
BEGIN
  IF to_regprocedure('public.admin_analytics_summary(timestamp with time zone)') IS NOT NULL THEN
    SELECT pg_get_functiondef('public.admin_analytics_summary(timestamp with time zone)'::regprocedure) INTO definition;
    EXECUTE replace(definition, 'FROM public.inquiry_messages WHERE', 'FROM public.staff_inquiry_messages WHERE');
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
