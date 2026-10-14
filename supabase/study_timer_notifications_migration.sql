-- Run after study_timer_migration.sql. No changes to time accounting or timer RPCs.
BEGIN;
CREATE TABLE IF NOT EXISTS public.study_push_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 session_id uuid NOT NULL REFERENCES public.study_sessions(id) ON DELETE CASCADE,
 student_id int NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
 round int NOT NULL, phase text NOT NULL CHECK (phase IN ('focus','break')),
 due_at timestamptz NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','queued','sent','cancelled','failed')),
 request_id bigint, queued_at timestamptz, attempts int NOT NULL DEFAULT 0,
 UNIQUE(session_id,round,phase)
);
ALTER TABLE public.study_push_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.study_push_events FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS study_push_events_due ON public.study_push_events(due_at) WHERE state IN ('pending','queued');

CREATE OR REPLACE FUNCTION public.schedule_study_push_events() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_deadline timestamptz;
BEGIN
 -- Stop future notifications on pause/finish. Already due completions remain deliverable.
 UPDATE public.study_push_events SET state='cancelled'
 WHERE session_id=NEW.id AND state='pending' AND due_at>clock_timestamp();
 IF NEW.mode<>'timer' OR NEW.ended_at IS NOT NULL OR NEW.paused OR NEW.running_since IS NULL OR NEW.phase NOT IN ('focus','break') THEN RETURN NEW; END IF;
 v_deadline:=NEW.running_since+make_interval(secs=>NEW.remaining_seconds);
 INSERT INTO public.study_push_events(session_id,student_id,round,phase,due_at)
 VALUES(NEW.id,NEW.student_id,NEW.round,NEW.phase,v_deadline)
 ON CONFLICT(session_id,round,phase) DO UPDATE SET due_at=excluded.due_at,state='pending'
 WHERE study_push_events.state IN ('pending','cancelled');
 -- The break deadline is scheduled now as well, so a closed browser is not needed
 -- to advance the focus phase before its break-end notification can be delivered.
 IF NEW.phase='focus' AND NEW.round<NEW.rounds AND NEW.break_minutes>0 THEN
  INSERT INTO public.study_push_events(session_id,student_id,round,phase,due_at)
  VALUES(NEW.id,NEW.student_id,NEW.round,'break',v_deadline+make_interval(mins=>NEW.break_minutes))
  ON CONFLICT(session_id,round,phase) DO UPDATE SET due_at=excluded.due_at,state='pending'
  WHERE study_push_events.state IN ('pending','cancelled');
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.schedule_study_push_events() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS study_push_schedule ON public.study_sessions;
CREATE TRIGGER study_push_schedule AFTER INSERT OR UPDATE ON public.study_sessions
FOR EACH ROW EXECUTE FUNCTION public.schedule_study_push_events();
COMMIT;
