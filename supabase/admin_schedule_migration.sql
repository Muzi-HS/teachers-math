-- Run in Supabase SQL Editor. Safe to run again.
CREATE TABLE IF NOT EXISTS public.admin_schedule_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  start_date date NOT NULL,
  end_date date NOT NULL,
  start_time time,
  end_time time,
  category text NOT NULL DEFAULT '업무' CHECK (category IN ('업무','회의','상담','준비','기타')),
  owner text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  memo text NOT NULL DEFAULT '',
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  CHECK ((start_time IS NULL AND end_time IS NULL) OR
    (start_time IS NOT NULL AND (end_time IS NULL OR end_date > start_date OR end_time > start_time)))
);
CREATE INDEX IF NOT EXISTS admin_schedule_events_dates ON public.admin_schedule_events(start_date, end_date);
ALTER TABLE public.admin_schedule_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_schedule_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_schedule_events TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.admin_schedule_events_id_seq TO authenticated;
DROP POLICY IF EXISTS admin_schedule_only ON public.admin_schedule_events;
CREATE POLICY admin_schedule_only ON public.admin_schedule_events
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teachers WHERE user_id = auth.uid() AND role = 'admin' AND approved = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.teachers WHERE user_id = auth.uid() AND role = 'admin' AND approved = true));
