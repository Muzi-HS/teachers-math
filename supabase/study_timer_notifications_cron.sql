-- Requires pg_cron >= 1.6, pg_net, and study_timer_notifications_migration.sql.
-- Uses the existing send-push Edge Function, with server-derived student IDs only.
BEGIN;
CREATE OR REPLACE FUNCTION public.dispatch_study_push_events() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e record; r record; v_request bigint; v_body text; v_title text; v_success boolean;
BEGIN
 IF NOT pg_try_advisory_xact_lock(7262,1) THEN RETURN; END IF;
 FOR e IN SELECT * FROM public.study_push_events WHERE state='queued' LOOP
  SELECT * INTO r FROM net._http_response WHERE id=e.request_id;
  IF r.id IS NULL AND e.queued_at>clock_timestamp()-interval '90 seconds' THEN CONTINUE; END IF;
  v_success:=false;
  IF r.id IS NOT NULL AND r.status_code BETWEEN 200 AND 299 THEN
   BEGIN
    v_success:=COALESCE((r.content::jsonb->>'sent')::int,0)>0 OR (r.content::jsonb ? 'message');
   EXCEPTION WHEN OTHERS THEN v_success:=false; END;
  END IF;
  UPDATE public.study_push_events SET state=CASE WHEN v_success THEN 'sent' WHEN attempts>=3 THEN 'failed' ELSE 'pending' END WHERE id=e.id;
 END LOOP;
 -- Do not flood students with stale notifications after an extended service outage.
 UPDATE public.study_push_events SET state='cancelled' WHERE state='pending' AND due_at<clock_timestamp()-interval '5 minutes';
 FOR e IN SELECT * FROM public.study_push_events WHERE state='pending' AND due_at<=clock_timestamp() ORDER BY due_at,id LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
  v_title:=CASE WHEN e.phase='focus' THEN '집중 시간이 끝났어요' ELSE '휴식 시간이 끝났어요' END;
  IF e.phase='focus' THEN
   SELECT CASE WHEN s.round=e.round AND s.rounds=e.round THEN '오늘의 집중을 모두 마쳤어요. 수고했어요!'
    WHEN s.break_minutes>0 THEN '잠시 쉬어가세요. 휴식이 끝나면 다시 알려드릴게요.'
    ELSE '한 회차를 마쳤어요. 준비되면 다음 집중을 시작해주세요.' END INTO v_body FROM public.study_sessions s WHERE s.id=e.session_id;
  ELSE v_body:='준비되면 다음 집중을 시작해주세요.'; END IF;
  SELECT net.http_post(
   url:='https://qroeybkvaqlssbpbxhyq.supabase.co/functions/v1/send-push',
   headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer sb_publishable_FNCqfNfl41a46yhF7flo3Q_D2Jvmssk'),
   body:=jsonb_build_object('student_id',e.student_id,'title',v_title,'body',v_body,'link','/student/study','tag','study-'||e.id),
   timeout_milliseconds:=10000
  ) INTO v_request;
  UPDATE public.study_push_events SET state='queued',request_id=v_request,queued_at=clock_timestamp(),attempts=attempts+1 WHERE id=e.id;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.dispatch_study_push_events() FROM PUBLIC,anon,authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='send-class-reminders') THEN PERFORM cron.unschedule('send-class-reminders'); END IF;
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='study-timer-push') THEN PERFORM cron.unschedule('study-timer-push'); END IF;
END $$;
SELECT cron.schedule('study-timer-push','10 seconds','SELECT public.dispatch_study_push_events()');
COMMIT;
