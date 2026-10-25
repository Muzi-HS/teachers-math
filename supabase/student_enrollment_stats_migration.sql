-- 학생 추이 클라이언트 배포 전에 실행. 기존 삭제 흐름을 유지하며 익명 통계 이력을 보존합니다.
BEGIN;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS public.student_enrollment_history (
  student_id bigint PRIMARY KEY,
  registered_on date,
  withdrawn_on date,
  is_test boolean NOT NULL DEFAULT false
);
-- 의도적으로 students 외래 키를 두지 않습니다. 학생 삭제 후에도 통계를 유지합니다.
ALTER TABLE public.student_enrollment_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_enrollment_history FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS public.student_enrollment_tracking (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  started_on date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Seoul')::date
);
ALTER TABLE public.student_enrollment_tracking ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_enrollment_tracking FROM PUBLIC, anon, authenticated;
INSERT INTO public.student_enrollment_tracking(id) VALUES(true) ON CONFLICT DO NOTHING;
INSERT INTO public.student_enrollment_history(student_id,registered_on,is_test)
SELECT id,reg_date::date,is_test FROM public.students ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.track_student_enrollment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.student_enrollment_history
    SET withdrawn_on = (now() AT TIME ZONE 'Asia/Seoul')::date,
        registered_on = OLD.reg_date::date, is_test = OLD.is_test
    WHERE student_id = OLD.id;
    RETURN OLD;
  END IF;
  INSERT INTO public.student_enrollment_history(student_id,registered_on,is_test)
  VALUES(NEW.id,NEW.reg_date::date,NEW.is_test)
  ON CONFLICT(student_id) DO UPDATE SET registered_on=EXCLUDED.registered_on,is_test=EXCLUDED.is_test;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.track_student_enrollment() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS track_student_enrollment ON public.students;
CREATE TRIGGER track_student_enrollment AFTER INSERT OR UPDATE OR DELETE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.track_student_enrollment();

-- 월수는 30일 단위가 아니라 등록일의 달력상 기념일 기준입니다.
-- 내부 집계 함수: authenticated에서 직접 실행할 수 없습니다.
CREATE OR REPLACE FUNCTION public.student_enrollment_tenure(p_on date)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  WITH active AS MATERIALIZED (
    SELECT registered_on FROM public.student_enrollment_history
    WHERE NOT is_test AND (registered_on IS NULL OR registered_on <= p_on)
      AND (withdrawn_on IS NULL OR withdrawn_on > p_on)
  ), totals AS (
    SELECT count(*) AS total,count(registered_on) AS eligible,
      count(*) FILTER (WHERE registered_on IS NULL) AS unknown FROM active
  ), milestones AS (
    SELECT months,count(a.registered_on) FILTER (
      WHERE a.registered_on + make_interval(months => months) <= p_on) AS students
    FROM unnest(ARRAY[1,3,6,12]) months LEFT JOIN active a ON true GROUP BY months
  )
  SELECT jsonb_build_object('asOf',p_on,'total',t.total,'eligible',t.eligible,'unknownDates',t.unknown,
    'milestones',(SELECT jsonb_agg(jsonb_build_object('months',m.months,'count',m.students,
      'percent',round(100.0*m.students/nullif(t.eligible,0),1)) ORDER BY m.months) FROM milestones m))
  FROM totals t;
$$;
REVOKE ALL ON FUNCTION public.student_enrollment_tenure(date) FROM PUBLIC, anon, authenticated;

-- 기존 2인자 버전에서 전체 기간 옵션이 있는 버전으로 전환합니다.
DROP FUNCTION IF EXISTS public.admin_student_enrollment_summary(integer,text);
CREATE OR REPLACE FUNCTION public.admin_student_enrollment_summary(p_year integer DEFAULT NULL, p_grain text DEFAULT 'month', p_all boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  result jsonb; today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  step interval; first_day date; last_day date; earliest date; has_data boolean := true;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.teachers WHERE user_id=auth.uid() AND role='admin' AND approved=true) THEN
    RAISE EXCEPTION '승인된 관리자만 조회할 수 있습니다.' USING ERRCODE='42501';
  END IF;
  IF (p_year IS NOT NULL AND (p_year < 1900 OR p_year > extract(year FROM today))) OR p_grain IS NULL OR p_grain NOT IN ('month','quarter','year') OR p_all IS NULL OR (p_all AND p_year IS NOT NULL) THEN
    RAISE EXCEPTION '조회 기간을 확인하세요.';
  END IF;
  step := CASE p_grain WHEN 'month' THEN interval '1 month' WHEN 'quarter' THEN interval '3 months' ELSE interval '1 year' END;
  IF p_year IS NULL THEN
    -- 현재 기간을 포함한 최근 12기간. 중간에 등록·퇴원이 없는 기간도 유지합니다.
    SELECT min(registered_on),count(*) > 0 INTO earliest,has_data
    FROM public.student_enrollment_history
    WHERE NOT is_test AND (registered_on IS NULL OR registered_on <= today);
    earliest := coalesce(earliest,(SELECT started_on FROM public.student_enrollment_tracking WHERE id),today);
    last_day := date_trunc(p_grain,today)::date;
    first_day := CASE WHEN p_all THEN date_trunc(p_grain,earliest)::date ELSE greatest(date_trunc(p_grain,earliest)::date,(last_day - step*11)::date) END;
  ELSE
    first_day := make_date(p_year,1,1);
    last_day := make_date(p_year,12,31);
  END IF;
  WITH periods AS (
    SELECT d::date AS start_on,
      (d + step)::date AS end_on
    FROM generate_series(first_day::timestamp,last_day::timestamp,step) d
    WHERE d::date <= today AND has_data
  ), rows AS (
    SELECT p.start_on,p.end_on,
      count(h.student_id) FILTER (WHERE h.registered_on <= p.start_on AND (h.withdrawn_on IS NULL OR h.withdrawn_on > p.start_on)) AS enrolled,
      count(h.student_id) FILTER (WHERE h.registered_on >= p.start_on AND h.registered_on < p.end_on AND h.registered_on <= today) AS registrations,
      count(h.student_id) FILTER (WHERE h.withdrawn_on >= p.start_on AND h.withdrawn_on < p.end_on AND h.withdrawn_on <= today) AS withdrawals,
      count(h.student_id) FILTER (WHERE h.withdrawn_on >= p.start_on AND h.withdrawn_on < p.end_on AND h.withdrawn_on <= today AND h.withdrawn_on-h.registered_on BETWEEN 0 AND 30) AS early_withdrawals
    FROM periods p LEFT JOIN public.student_enrollment_history h ON NOT h.is_test GROUP BY p.start_on,p.end_on
  )
  SELECT jsonb_build_object(
    'today',today,'trackingStartedOn',(SELECT started_on FROM public.student_enrollment_tracking WHERE id),
    'rangeStart',(SELECT min(start_on) FROM periods),'rangeEnd',today,
    'scope',CASE WHEN p_all THEN 'all' ELSE 'recent' END,
    'currentEnrolled',(SELECT count(*) FROM public.student_enrollment_history WHERE NOT is_test AND withdrawn_on IS NULL AND (registered_on IS NULL OR registered_on <= today)),
    'unknownDates',(SELECT count(*) FROM public.student_enrollment_history WHERE NOT is_test AND registered_on IS NULL),
    'tenure',public.student_enrollment_tenure(today),
    'rows',coalesce((SELECT jsonb_agg(jsonb_build_object('start',start_on,'end',end_on,'enrolled',enrolled,'registrations',registrations,'withdrawals',withdrawals,'earlyWithdrawals',early_withdrawals,'tenure',public.student_enrollment_tenure(start_on)) ORDER BY start_on) FROM rows),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_student_enrollment_summary(integer,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_student_enrollment_summary(integer,text,boolean) TO authenticated;

-- 동일한 DB 스냅샷에서 모든 집계 단위를 계산하며 개인 정보는 반환하지 않습니다.
CREATE OR REPLACE FUNCTION public.admin_student_enrollment_export()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.teachers WHERE user_id=auth.uid() AND role='admin' AND approved=true) THEN
    RAISE EXCEPTION '승인된 관리자만 통계를 다운로드할 수 있습니다.' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object(
    'month',public.admin_student_enrollment_summary(NULL,'month',true),
    'quarter',public.admin_student_enrollment_summary(NULL,'quarter',true),
    'year',public.admin_student_enrollment_summary(NULL,'year',true));
END $$;
REVOKE ALL ON FUNCTION public.admin_student_enrollment_export() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_student_enrollment_export() TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
