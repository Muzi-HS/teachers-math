-- 수업 시작 전 자동 알림("다음 수업 알림") — 5분마다 class-reminder-check 엣지 함수를 호출해
-- 30분 이내에 시작하는 수업이 있으면 그 반 소속 학생·학부모에게 한 번씩만 푸시를 보낸다.

-- 반/날짜당 한 번만 보냈는지 기록하는 표 (엣지 함수가 이 표로 중복 발송을 막는다)
CREATE TABLE IF NOT EXISTS class_reminder_log (
  class_id bigint NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  date date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, date)
);
ALTER TABLE class_reminder_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS class_reminder_log_staff ON class_reminder_log;
CREATE POLICY class_reminder_log_staff ON class_reminder_log
  FOR ALL TO authenticated USING (is_teacher_or_admin()) WITH CHECK (is_teacher_or_admin());

-- pg_cron으로 5분마다 class-reminder-check 엣지 함수를 호출 (pg_net으로 HTTP 요청)
-- 실행 후 대시보드 > Database > Extensions에서 pg_cron / pg_net이 활성화됐는지 확인해 주세요.
-- "permission denied to create extension" 오류가 나면 대시보드 UI에서 먼저 토글로 켠 뒤
-- 아래 CREATE EXTENSION 두 줄만 건너뛰고 나머지를 실행하시면 됩니다.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-class-reminders') THEN
    PERFORM cron.unschedule('send-class-reminders');
  END IF;
END $$;

SELECT cron.schedule(
  'send-class-reminders',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qroeybkvaqlssbpbxhyq.supabase.co/functions/v1/class-reminder-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_FNCqfNfl41a46yhF7flo3Q_D2Jvmssk'
    ),
    body := '{}'::jsonb
  );
  $$
);
