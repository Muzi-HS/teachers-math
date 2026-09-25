-- 접속 분석 앱 변경 배포 전에 실행. 원본 데이터는 변경하지 않습니다.
-- 전제: site_visits / consultation_requests / inquiry_messages / teachers 테이블.
BEGIN;
CREATE OR REPLACE FUNCTION public.admin_analytics_summary(p_as_of timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_today date; v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.teachers t
    WHERE t.user_id = auth.uid() AND t.role = 'admin' AND t.approved = true) THEN
    RAISE EXCEPTION '승인된 관리자만 접속 분석을 조회할 수 있습니다.' USING ERRCODE = '42501';
  END IF;
  IF p_as_of IS NULL OR NOT isfinite(p_as_of) THEN RAISE EXCEPTION '조회 기준 시각을 확인하세요.'; END IF;
  v_today := (p_as_of AT TIME ZONE 'Asia/Seoul')::date;
  WITH visits AS MATERIALIZED (
    SELECT (visited_at AT TIME ZONE 'Asia/Seoul')::date AS day, is_mobile
    FROM public.site_visits WHERE visited_at >= p_as_of - interval '8784 hours' AND visited_at <= p_as_of
  ), consults AS MATERIALIZED (
    SELECT (created_at AT TIME ZONE 'Asia/Seoul')::date AS day
    FROM public.consultation_requests WHERE created_at >= p_as_of - interval '8784 hours' AND created_at <= p_as_of
  ), visit_days AS (
    SELECT day, count(*) AS n FROM visits GROUP BY day
  ), visit_months AS (
    SELECT date_trunc('month',day)::date AS month, count(*) AS n FROM visits GROUP BY 1
  ), consult_months AS (
    SELECT date_trunc('month',day)::date AS month, count(*) AS n FROM consults GROUP BY 1
  ), days AS (
    SELECT v_today - i AS day FROM generate_series(0,13) AS s(i)
  ), months AS (
    SELECT (date_trunc('month',v_today) - make_interval(months => i))::date AS month
    FROM generate_series(0,11) AS s(i)
  )
  SELECT jsonb_build_object(
    'totalVisits', (SELECT count(*) FROM visits),
    'todayCount', (SELECT count(*) FROM visits WHERE day = v_today),
    'monthCount', (SELECT count(*) FROM visits WHERE day >= date_trunc('month',v_today)::date),
    'consultThisMonth', (SELECT count(*) FROM consults WHERE day >= date_trunc('month',v_today)::date),
    'consultTotal', (SELECT count(*) FROM consults),
    'mobilePct', (SELECT coalesce(round(100.0 * count(*) FILTER (WHERE is_mobile) / nullif(count(*),0)),0) FROM visits),
    'unreadInquiries', (SELECT count(*) FROM public.inquiry_messages WHERE sender_type = 'parent' AND is_read = false),
    'pendingTeachers', (SELECT count(*) FROM public.teachers WHERE approved = false),
    'dailyChartData', (SELECT jsonb_agg(jsonb_build_object('date',to_char(d.day,'MM-DD'),'count',coalesce(v.n,0)) ORDER BY d.day)
      FROM days d LEFT JOIN visit_days v USING(day)),
    'monthlyChartData', (SELECT jsonb_agg(jsonb_build_object('month',to_char(m.month,'YY.MM'),'visits',coalesce(v.n,0),'consults',coalesce(c.n,0)) ORDER BY m.month)
      FROM months m LEFT JOIN visit_months v USING(month) LEFT JOIN consult_months c USING(month))
  ) INTO v_result;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.admin_analytics_summary(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_analytics_summary(timestamptz) TO authenticated;
COMMIT;
