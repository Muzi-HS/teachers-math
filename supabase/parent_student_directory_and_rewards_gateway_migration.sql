-- 적용 순서: parent_student_session_gateway_migration.sql 다음, 앱의 전환 배포 전에 전체 실행하세요.
-- 반복 실행 가능합니다. 기존 데이터(학생/학부모/쿠폰/스트릭 기록)는 변경하지 않습니다.
--
-- 목적: records 슬라이스와 같은 이유로 parents/students/parent_students/class_students/
-- student_coupons/student_streak_state/fcm_tokens도 anon에게 "누구나 조회·수정 가능" 정책이
-- 걸려 있었다. 특히 student_coupons는 임의의 학생 앞으로 쿠폰을 무제한 발급할 수 있었고
-- (코드도 클라이언트가 직접 만들어 보냄), student_coupons_select_anon으로 모든 학생의
-- 미사용 쿠폰 코드를 그대로 읽어갈 수 있었다 — 코드만 알면 학원에서 부정 사용이 가능했다.
--
-- 공지사항(notices/notice_comments/class_notices) 계열은 이번 슬라이스에 포함하지 않았다 —
-- 별도로 검토가 필요한 독립적인 기능 영역이라 다음 슬라이스로 남겨둔다.
BEGIN;

-- ── 1. 세션 소유자 조회 헬퍼 — Edge Function(register-fcm-token)이 소유권을 검증할 때 쓴다 ──
CREATE OR REPLACE FUNCTION public.session_subject(p_token uuid)
RETURNS TABLE(subject_type text, subject_id int)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT subject_type, subject_id FROM public.client_sessions WHERE token = p_token AND expires_at > now();
$$;
REVOKE ALL ON FUNCTION public.session_subject(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.session_subject(uuid) TO anon, authenticated;

-- ── 2. 로그인 1단계(전화번호 확인) — 전체 테이블이 아니라 정확히 일치하는 1건만 ──
CREATE OR REPLACE FUNCTION public.lookup_parent_by_phone(p_phone text) RETURNS TABLE(id int, phone text)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.id, p.phone FROM public.parents p WHERE p.phone = regexp_replace(p_phone, '[-\s]', '', 'g');
$$;
CREATE OR REPLACE FUNCTION public.lookup_student_by_phone(p_phone text) RETURNS TABLE(id int, name text, phone text)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.id, s.name, s.phone FROM public.students s WHERE s.phone = regexp_replace(p_phone, '[-\s]', '', 'g');
$$;
REVOKE ALL ON FUNCTION public.lookup_parent_by_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_parent_by_phone(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.lookup_student_by_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_student_by_phone(text) TO anon, authenticated;

-- ── 3. NFC 태그 체크인(로그인 없이, 전화번호 뒷 4자리로 본인 확인) ──
-- 여러 가족이 뒷 4자리가 같을 수 있어 여러 건이 나올 수 있는 건 기존과 동일한 설계다.
-- 다만 이 필터를 서버 함수 안에 고정해서, 클라이언트가 필터 없이 테이블 전체를
-- 가져가는 것 자체를 막는다. 일치한 각 학부모 앞으로 세션 토큰도 함께 발급한다 —
-- 이 화면은 PIN 없이 "부모 번호 뒷 4자리 확인"과 동일한 신뢰 수준만 요구하도록 이미
-- 설계돼 있어서, 그 신뢰 수준 그대로 알림 등록(register-fcm-token)에 쓸 토큰을 준다.
CREATE OR REPLACE FUNCTION public.lookup_family_by_phone_suffix(p_last4 text)
RETURNS TABLE(parent_id int, parent_phone text, parent_session_token uuid, student_id int, student_name text, student_school text)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH matched_parents AS (
    SELECT DISTINCT p.id, p.phone FROM public.parents p
    WHERE p_last4 ~ '^[0-9]{4}$' AND p.phone LIKE ('%' || p_last4)
  ), issued AS (
    INSERT INTO public.client_sessions(subject_type, subject_id)
    SELECT 'parent', mp.id FROM matched_parents mp
    RETURNING subject_id, token
  )
  SELECT mp.id, mp.phone, i.token, s.id, s.name, s.school
  FROM matched_parents mp
  JOIN issued i ON i.subject_id = mp.id
  JOIN public.parent_students ps ON ps.parent_id = mp.id
  JOIN public.students s ON s.id = ps.student_id;
$$;
REVOKE ALL ON FUNCTION public.lookup_family_by_phone_suffix(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_family_by_phone_suffix(text) TO anon, authenticated;

-- ── 4. 반 정보 (TodayClassBanner, 학생 "반 공지사항" 화면) ──
CREATE OR REPLACE FUNCTION public.client_class_students(p_token uuid, p_student_id int)
RETURNS SETOF public.class_students
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT cs.* FROM public.class_students cs
  WHERE cs.student_id = p_student_id AND public.session_owns_student(p_token, p_student_id);
$$;
REVOKE ALL ON FUNCTION public.client_class_students(uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_class_students(uuid,int) TO anon, authenticated;

-- ── 5. 공지 댓글 작성자 표시용 자녀 이름 — "전체 학부모"가 아니라 "이 공지에 실제로
--       댓글을 남긴 학부모"만 좁혀서 노출한다. notice_comments 자체의 anon 정책은
--       다음 슬라이스(공지사항)에서 다룬다.
CREATE OR REPLACE FUNCTION public.notice_comment_authors(p_notice_id int)
RETURNS TABLE(parent_id int, child_names text[])
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT nc.parent_id, array_agg(DISTINCT s.name)
  FROM public.notice_comments nc
  JOIN public.parent_students ps ON ps.parent_id = nc.parent_id
  JOIN public.students s ON s.id = ps.student_id
  WHERE nc.notice_id = p_notice_id AND nc.parent_id IS NOT NULL
  GROUP BY nc.parent_id;
$$;
REVOKE ALL ON FUNCTION public.notice_comment_authors(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notice_comment_authors(int) TO anon, authenticated;

-- ── 6. 숙제 스트릭/쿠폰 — 마일스톤·연속일수를 클라이언트가 아니라 서버가 기록에서
--       직접 다시 계산한다. 예전에는 클라이언트가 "30일 연속 달성했다"고 주장하는
--       값을 그대로 믿고 쿠폰을 만들어줬다.
CREATE OR REPLACE FUNCTION public._compute_current_streak(p_student_id bigint, p_since date) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH recs AS (
    SELECT date, hw_rate FROM public.records
    WHERE student_id = p_student_id AND is_draft = false AND released_to_parent = true
      AND (p_since IS NULL OR date > p_since) AND hw_rate <> -1
  ), numbered AS (
    SELECT hw_rate, row_number() OVER (ORDER BY date DESC) AS rn FROM recs
  ), broken AS (
    SELECT MIN(rn) - 1 AS len FROM numbered WHERE hw_rate <> 100
  )
  SELECT COALESCE((SELECT len FROM broken), (SELECT count(*)::int FROM numbered));
$$;

CREATE OR REPLACE FUNCTION public.client_streak_status(p_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_type text; v_student_id int;
  v_last_claimed date; v_last_seen int; v_last_prompted int;
  v_current int; v_target int; v_next int;
  v_milestones int[] := ARRAY[5,10,15,20,25,30];
  m int;
BEGIN
  SELECT subject_type, subject_id INTO v_type, v_student_id
    FROM public.client_sessions WHERE token = p_token AND expires_at > now();
  IF v_type IS DISTINCT FROM 'student' THEN RETURN NULL; END IF;

  SELECT last_claimed_date, last_seen_streak, last_prompted_milestone
    INTO v_last_claimed, v_last_seen, v_last_prompted
    FROM public.student_streak_state WHERE student_id = v_student_id;
  v_last_seen := COALESCE(v_last_seen, 0);
  v_last_prompted := COALESCE(v_last_prompted, 0);

  v_current := public._compute_current_streak(v_student_id, v_last_claimed);
  IF v_current = 0 THEN RETURN NULL; END IF;
  IF v_current < v_last_seen THEN v_last_prompted := 0; END IF;

  v_target := NULL;
  FOREACH m IN ARRAY v_milestones LOOP
    IF v_current >= m AND m > v_last_prompted THEN v_target := m; END IF;
  END LOOP;

  INSERT INTO public.student_streak_state(student_id, last_seen_streak, last_prompted_milestone, last_claimed_date, updated_at)
    VALUES (v_student_id, v_current, v_last_prompted, v_last_claimed, now())
    ON CONFLICT (student_id) DO UPDATE SET
      last_seen_streak = EXCLUDED.last_seen_streak,
      last_prompted_milestone = EXCLUDED.last_prompted_milestone,
      updated_at = now();

  IF v_target IS NULL THEN RETURN NULL; END IF;
  SELECT MIN(x) INTO v_next FROM unnest(v_milestones) x WHERE x > v_target;
  RETURN jsonb_build_object('milestone', v_target, 'nextMilestone', v_next, 'streakValue', v_current);
END;
$$;

CREATE OR REPLACE FUNCTION public.client_claim_streak_coupon(p_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_type text; v_student_id int;
  v_last_claimed date; v_last_prompted int;
  v_current int; v_target int;
  v_code text; v_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_milestones int[] := ARRAY[5,10,15,20,25,30];
  m int; i int; attempt int; v_inserted boolean := false;
BEGIN
  SELECT subject_type, subject_id INTO v_type, v_student_id
    FROM public.client_sessions WHERE token = p_token AND expires_at > now();
  IF v_type IS DISTINCT FROM 'student' THEN
    RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
  END IF;

  SELECT last_claimed_date, last_prompted_milestone INTO v_last_claimed, v_last_prompted
    FROM public.student_streak_state WHERE student_id = v_student_id;
  v_last_prompted := COALESCE(v_last_prompted, 0);

  v_current := public._compute_current_streak(v_student_id, v_last_claimed);
  v_target := NULL;
  FOREACH m IN ARRAY v_milestones LOOP
    IF v_current >= m AND m > v_last_prompted THEN v_target := m; END IF;
  END LOOP;
  IF v_target IS NULL THEN
    RAISE EXCEPTION '아직 받을 수 있는 쿠폰이 없습니다.';
  END IF;

  FOR attempt IN 1..5 LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;
    v_code := substr(v_code,1,3) || '-' || substr(v_code,4,3);
    BEGIN
      INSERT INTO public.student_coupons(student_id, milestone, streak_value, code)
        VALUES (v_student_id, v_target, v_current, v_code);
      v_inserted := true;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;
  IF NOT v_inserted THEN
    RAISE EXCEPTION '쿠폰 코드 생성에 실패했습니다. 다시 시도해주세요.';
  END IF;

  UPDATE public.student_streak_state
    SET last_prompted_milestone = 0, last_seen_streak = 0,
      last_claimed_date = (now() AT TIME ZONE 'Asia/Seoul')::date, updated_at = now()
    WHERE student_id = v_student_id;

  RETURN jsonb_build_object('code', v_code, 'milestone', v_target);
END;
$$;

CREATE OR REPLACE FUNCTION public.client_decline_streak_milestone(p_token uuid, p_milestone int) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_type text; v_student_id int;
BEGIN
  SELECT subject_type, subject_id INTO v_type, v_student_id
    FROM public.client_sessions WHERE token = p_token AND expires_at > now();
  IF v_type IS DISTINCT FROM 'student' THEN RETURN; END IF;
  UPDATE public.student_streak_state
    SET last_prompted_milestone = GREATEST(last_prompted_milestone, p_milestone), updated_at = now()
    WHERE student_id = v_student_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.client_coupons(p_token uuid) RETURNS SETOF public.student_coupons
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT sc.* FROM public.student_coupons sc
  WHERE public.session_owns_student(p_token, sc.student_id)
  ORDER BY sc.claimed_at DESC;
$$;

REVOKE ALL ON FUNCTION public.client_streak_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_streak_status(uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.client_claim_streak_coupon(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_claim_streak_coupon(uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.client_decline_streak_milestone(uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_decline_streak_milestone(uuid,int) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.client_coupons(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_coupons(uuid) TO anon, authenticated;

-- ── 7. 기존 anon 직접 접근 정책 제거 ──
-- (관리자/선생님 쪽 *_staff 정책은 이미 진짜 Supabase Auth로 보호되고 있어 그대로 둔다)
DROP POLICY IF EXISTS parents_select_anon ON public.parents;
DROP POLICY IF EXISTS students_select_anon ON public.students;
DROP POLICY IF EXISTS parent_students_select_anon ON public.parent_students;
DROP POLICY IF EXISTS class_students_select_anon ON public.class_students;
DROP POLICY IF EXISTS class_students_parent ON public.class_students; -- 쓰이지 않는 옛 jwt claim 방식
DROP POLICY IF EXISTS student_coupons_select_anon ON public.student_coupons;
DROP POLICY IF EXISTS student_coupons_insert_anon ON public.student_coupons;
DROP POLICY IF EXISTS student_streak_state_anon ON public.student_streak_state;
DROP POLICY IF EXISTS fcm_tokens_insert_anon ON public.fcm_tokens;
DROP POLICY IF EXISTS fcm_tokens_update_anon ON public.fcm_tokens;

COMMIT;
