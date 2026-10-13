BEGIN;
-- Run after parent_student_session_gateway_migration.sql and class_staff_assignments_migration.sql.
CREATE TABLE IF NOT EXISTS public.study_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id int NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
 goal text NOT NULL CHECK (length(goal) BETWEEN 1 AND 120), focus_minutes int NOT NULL CHECK (focus_minutes BETWEEN 1 AND 180),
 break_minutes int NOT NULL CHECK (break_minutes BETWEEN 0 AND 60), rounds int NOT NULL CHECK (rounds BETWEEN 1 AND 12),
 round int NOT NULL DEFAULT 1, phase text NOT NULL DEFAULT 'focus' CHECK (phase IN ('focus','break','ready','done')),
 paused boolean NOT NULL DEFAULT false, remaining_seconds int NOT NULL, running_since timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), ended_at timestamptz
);
ALTER TABLE public.study_sessions ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'timer' CHECK (mode IN ('timer','stopwatch'));
ALTER TABLE public.study_sessions ADD COLUMN IF NOT EXISTS elapsed_seconds int NOT NULL DEFAULT 0 CHECK (elapsed_seconds >= 0);
CREATE UNIQUE INDEX IF NOT EXISTS study_one_active ON public.study_sessions(student_id) WHERE ended_at IS NULL;
CREATE TABLE IF NOT EXISTS public.study_segments (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, session_id uuid NOT NULL REFERENCES public.study_sessions(id) ON DELETE CASCADE,
 started_at timestamptz NOT NULL, ended_at timestamptz NOT NULL CHECK (ended_at >= started_at)
);
CREATE INDEX IF NOT EXISTS study_sessions_student ON public.study_sessions(student_id,created_at DESC);
CREATE INDEX IF NOT EXISTS study_segments_session ON public.study_segments(session_id);
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_segments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.study_sessions, public.study_segments FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.study_timer(uuid,text,text,int,int,int);
CREATE OR REPLACE FUNCTION public.study_timer(p_token uuid, p_action text DEFAULT 'sync', p_goal text DEFAULT NULL, p_focus int DEFAULT 25, p_break int DEFAULT 5, p_rounds int DEFAULT 4, p_mode text DEFAULT 'timer')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_student int; s public.study_sessions; v_now timestamptz := clock_timestamp(); v_end timestamptz; v_elapsed int;
BEGIN
 SELECT subject_id INTO v_student FROM public.client_sessions WHERE token=p_token AND subject_type='student' AND expires_at>now();
 IF v_student IS NULL THEN RAISE EXCEPTION 'Student session expired'; END IF;
 IF p_action NOT IN ('sync','start','pause','resume','next','finish') THEN RAISE EXCEPTION 'Invalid action'; END IF;
 IF p_mode IS NULL OR p_mode NOT IN ('timer','stopwatch') THEN RAISE EXCEPTION 'Invalid mode'; END IF;
 -- Serialize all actions for a student, including first start across tabs.
 PERFORM pg_advisory_xact_lock(7261, v_student);
 SELECT * INTO s FROM public.study_sessions WHERE student_id=v_student AND ended_at IS NULL FOR UPDATE;
 IF s.id IS NOT NULL AND s.running_since IS NOT NULL THEN
   v_end := LEAST(v_now, s.running_since + make_interval(secs=>s.remaining_seconds));
   v_elapsed := GREATEST(0, floor(extract(epoch FROM v_end-s.running_since))::int);
   IF v_elapsed > 0 AND s.phase='focus' THEN INSERT INTO public.study_segments(session_id,started_at,ended_at) VALUES(s.id,s.running_since,s.running_since+make_interval(secs=>v_elapsed)); END IF;
   IF s.phase='focus' THEN s.elapsed_seconds:=s.elapsed_seconds+v_elapsed; END IF;
   s.remaining_seconds := s.remaining_seconds-v_elapsed;
   s.running_since := s.running_since+make_interval(secs=>v_elapsed);
   IF s.remaining_seconds=0 THEN
     s.running_since := NULL; s.paused := false;
     IF s.phase='focus' THEN
       IF s.round=s.rounds THEN s.phase:='done'; s.ended_at:=v_end;
       ELSIF s.break_minutes>0 THEN s.remaining_seconds:=GREATEST(0,s.break_minutes*60-floor(extract(epoch FROM v_now-v_end))::int);
         IF s.remaining_seconds=0 THEN s.phase:='ready'; ELSE s.phase:='break'; s.running_since:=v_now; END IF;
       ELSE s.phase:='ready'; END IF;
     ELSE s.phase:='ready'; END IF;
   END IF;
 END IF;
 IF p_action='start' THEN
   IF s.id IS NOT NULL AND s.ended_at IS NULL THEN RAISE EXCEPTION 'A timer is already running'; END IF;
   INSERT INTO public.study_sessions(student_id,goal,focus_minutes,break_minutes,rounds,remaining_seconds,running_since,mode)
   VALUES(v_student,trim(p_goal),CASE WHEN p_mode='stopwatch' THEN 1 ELSE p_focus END,CASE WHEN p_mode='stopwatch' THEN 0 ELSE p_break END,CASE WHEN p_mode='stopwatch' THEN 1 ELSE p_rounds END,CASE WHEN p_mode='stopwatch' THEN 86400 ELSE p_focus*60 END,v_now,p_mode) RETURNING * INTO s;
 ELSIF s.id IS NOT NULL AND s.ended_at IS NULL THEN
   IF p_action='pause' AND s.running_since IS NOT NULL THEN s.paused:=true; s.running_since:=NULL;
   ELSIF p_action='resume' AND s.paused THEN s.paused:=false; s.running_since:=v_now;
   ELSIF p_action='next' AND s.phase='ready' THEN s.phase:='focus'; s.round:=s.round+1; s.remaining_seconds:=s.focus_minutes*60; s.running_since:=v_now;
   ELSIF p_action='finish' THEN s.phase:='done'; s.ended_at:=v_now; s.running_since:=NULL; s.paused:=false;
   END IF;
 END IF;
 IF s.id IS NOT NULL THEN
 UPDATE public.study_sessions SET phase=s.phase, round=s.round, paused=s.paused, remaining_seconds=s.remaining_seconds, running_since=s.running_since, ended_at=s.ended_at, elapsed_seconds=s.elapsed_seconds WHERE id=s.id;
 END IF;
 RETURN jsonb_build_object('session',CASE WHEN s.id IS NOT NULL AND s.ended_at IS NULL THEN to_jsonb(s) ELSE NULL END,'server_now',v_now,'completed',s.ended_at IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION public.study_timer(uuid,text,text,int,int,int,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.study_timer(uuid,text,text,int,int,int,text) TO anon,authenticated;

-- Shared server-side totals. Overlap calculation splits midnight/week/month boundaries in KST.
CREATE OR REPLACE FUNCTION public.study_report(p_token uuid DEFAULT NULL, p_student_id int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_student int; v_today timestamptz := date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul'; v_week timestamptz := date_trunc('week', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul'; v_month timestamptz := date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul'; result jsonb;
BEGIN
 IF p_token IS NOT NULL THEN
 SELECT subject_id INTO v_student FROM public.client_sessions WHERE token=p_token AND subject_type='student' AND expires_at>now();
 IF v_student IS NULL OR (p_student_id IS NOT NULL AND p_student_id<>v_student) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 ELSE
 IF NOT EXISTS(SELECT 1 FROM public.teachers WHERE user_id=auth.uid() AND approved AND role IN ('admin','teacher')) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 v_student:=p_student_id;
 END IF;
 WITH visible AS (
 SELECT s.* FROM public.study_sessions s WHERE (v_student IS NULL OR s.student_id=v_student)
 AND (p_token IS NOT NULL OR public.staff_can_access_class(NULL) OR EXISTS(SELECT 1 FROM public.class_students cs WHERE cs.student_id=s.student_id AND public.staff_can_access_class(cs.class_id)))
 ), spans AS (
 SELECT s.student_id, g.session_id, g.started_at, g.ended_at FROM public.study_segments g JOIN visible s ON s.id=g.session_id
 UNION ALL
 SELECT student_id,id,running_since,LEAST(now(),running_since+make_interval(secs=>remaining_seconds)) FROM visible WHERE phase='focus' AND running_since IS NOT NULL
 ), totals AS (
 SELECT student_id, floor(sum(GREATEST(0,extract(epoch FROM ended_at-GREATEST(started_at,v_today)))))::int AS today,
 floor(sum(GREATEST(0,extract(epoch FROM ended_at-GREATEST(started_at,v_week)))))::int AS week,
 floor(sum(GREATEST(0,extract(epoch FROM ended_at-GREATEST(started_at,v_month)))))::int AS month FROM spans GROUP BY student_id
 ), history AS (
 SELECT s.*, COALESCE((SELECT floor(sum(extract(epoch FROM g.ended_at-g.started_at)))::int FROM spans g WHERE g.session_id=s.id),0) AS focus_seconds,
 COALESCE((SELECT floor(sum(GREATEST(0,extract(epoch FROM g.ended_at-GREATEST(g.started_at,v_today)))))::int FROM spans g WHERE g.session_id=s.id),0) AS today_seconds,
 COALESCE((SELECT floor(sum(GREATEST(0,extract(epoch FROM g.ended_at-GREATEST(g.started_at,v_week)))))::int FROM spans g WHERE g.session_id=s.id),0) AS week_seconds,
 COALESCE((SELECT floor(sum(GREATEST(0,extract(epoch FROM g.ended_at-GREATEST(g.started_at,v_month)))))::int FROM spans g WHERE g.session_id=s.id),0) AS month_seconds FROM visible s WHERE v_student IS NOT NULL ORDER BY created_at DESC
 ) SELECT jsonb_build_object('totals',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM totals t),'[]'::jsonb),'history',COALESCE((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.created_at DESC) FROM history h),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.study_report(uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.study_report(uuid,int) TO anon,authenticated;
COMMIT;
