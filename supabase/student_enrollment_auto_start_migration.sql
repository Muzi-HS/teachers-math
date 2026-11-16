-- student_enrollment_status_migration.sql 적용 후 실행. Supabase pg_cron 필요.
BEGIN;
CREATE OR REPLACE FUNCTION public.set_student_withdrawal_date()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.enrollment_status = 'withdrawn' THEN
    NEW.withdrawn_on := coalesce(NEW.withdrawn_on,(now() AT TIME ZONE 'Asia/Seoul')::date);
  ELSIF NEW.enrollment_status IN ('enrolled','prospective') THEN
    NEW.enrollment_status := CASE WHEN NEW.reg_date::date > (now() AT TIME ZONE 'Asia/Seoul')::date
      THEN 'prospective' ELSE 'enrolled' END;
    NEW.withdrawn_on := NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.activate_due_students()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.students SET enrollment_status='enrolled'
  WHERE enrollment_status='prospective'
    AND reg_date::date <= (now() AT TIME ZONE 'Asia/Seoul')::date;
$$;
REVOKE ALL ON FUNCTION public.activate_due_students() FROM PUBLIC, anon, authenticated;

-- 기존 자료도 날짜에 맞추되 퇴원생은 유지. 통계 이력 트리거도 함께 갱신됩니다.
UPDATE public.students SET enrollment_status=enrollment_status
WHERE enrollment_status IN ('enrolled','prospective');

-- 매 분 확인하므로 앱 접속 여부와 관계없이 등록일 자정부터 자동 전환됩니다.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('activate-due-students','* * * * *',
  $$SELECT public.activate_due_students()$$);
NOTIFY pgrst, 'reload schema';
COMMIT;
