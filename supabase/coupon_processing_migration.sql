-- Run after parent_student_directory_and_rewards_gateway_migration.sql.
-- Preserve earlier coupon history while adding pre-claim snapshots.
ALTER TABLE public.student_streak_state ADD COLUMN IF NOT EXISTS latest_coupon_id bigint;
ALTER TABLE public.student_coupons ADD COLUMN IF NOT EXISTS previous_claimed_date date;
ALTER TABLE public.student_coupons ADD COLUMN IF NOT EXISTS previous_coupon_id bigint;
ALTER TABLE public.student_coupons ADD COLUMN IF NOT EXISTS restore_available boolean NOT NULL DEFAULT false;

-- Before this migration, used coupons were retained; reconstruct their claim boundaries.
WITH history AS (
  SELECT id, lag((claimed_at AT TIME ZONE 'Asia/Seoul')::date) OVER w previous_date,
    lag(id) OVER w previous_id
  FROM public.student_coupons WINDOW w AS (PARTITION BY student_id ORDER BY claimed_at, id)
)
UPDATE public.student_coupons c SET previous_claimed_date = h.previous_date,
  previous_coupon_id = h.previous_id, restore_available = true
FROM history h WHERE c.id = h.id AND c.restore_available = false;
WITH latest AS (
  SELECT DISTINCT ON (student_id) student_id, id, claimed_at
  FROM public.student_coupons ORDER BY student_id, claimed_at DESC, id DESC
)
UPDATE public.student_streak_state s SET latest_coupon_id = c.id FROM latest c
WHERE s.student_id = c.student_id AND s.latest_coupon_id IS NULL
  AND s.last_claimed_date = (c.claimed_at AT TIME ZONE 'Asia/Seoul')::date;

CREATE OR REPLACE FUNCTION public.capture_coupon_streak_state() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.student_streak_state(student_id) VALUES (NEW.student_id) ON CONFLICT DO NOTHING;
  SELECT last_claimed_date, latest_coupon_id INTO NEW.previous_claimed_date, NEW.previous_coupon_id
    FROM public.student_streak_state WHERE student_id = NEW.student_id FOR UPDATE;
  NEW.restore_available := true;
  UPDATE public.student_streak_state SET latest_coupon_id = NEW.id WHERE student_id = NEW.student_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS capture_coupon_streak_state ON public.student_coupons;
CREATE TRIGGER capture_coupon_streak_state BEFORE INSERT ON public.student_coupons
  FOR EACH ROW EXECUTE FUNCTION public.capture_coupon_streak_state();

CREATE OR REPLACE FUNCTION public.admin_process_coupon(p_coupon_id bigint, p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c public.student_coupons; v_student bigint; v_latest bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.teachers WHERE user_id = auth.uid() AND role = 'admin' AND approved = true) THEN
    RAISE EXCEPTION '관리자만 쿠폰을 처리할 수 있습니다.' USING ERRCODE = '42501';
  END IF;
  SELECT student_id INTO v_student FROM public.student_coupons WHERE id = p_coupon_id;
  SELECT latest_coupon_id INTO v_latest FROM public.student_streak_state WHERE student_id = v_student FOR UPDATE;
  SELECT * INTO c FROM public.student_coupons WHERE id = p_coupon_id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION '쿠폰을 찾을 수 없습니다.'; END IF;
  IF c.used AND c.used_at <= now() - interval '24 hours' THEN
    RAISE EXCEPTION '사용 처리 후 24시간이 지나 취소할 수 없습니다.';
  END IF;
  IF p_action = 'use' THEN
    IF NOT c.used THEN UPDATE public.student_coupons SET used = true, used_at = now() WHERE id = c.id; END IF;
  ELSIF p_action = 'cancel' THEN
    UPDATE public.student_coupons SET used = false, used_at = NULL WHERE id = c.id;
  ELSIF p_action = 'restore' THEN
    IF c.used THEN RAISE EXCEPTION '먼저 쿠폰 사용을 취소해 주세요.'; END IF;
    IF NOT c.restore_available THEN RAISE EXCEPTION '이전 발급 쿠폰에는 복원 자료가 없습니다.'; END IF;
    IF v_latest IS DISTINCT FROM c.id THEN RAISE EXCEPTION '이후 발급된 쿠폰이 있어 이전 도전을 복원할 수 없습니다.'; END IF;
    UPDATE public.student_streak_state SET last_claimed_date = c.previous_claimed_date,
      latest_coupon_id = c.previous_coupon_id,
      last_seen_streak = c.streak_value,
      last_prompted_milestone = c.milestone, updated_at = now()
      WHERE student_id = c.student_id;
    DELETE FROM public.student_coupons WHERE id = c.id;
  ELSE RAISE EXCEPTION '올바르지 않은 처리입니다.';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_process_coupon(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_process_coupon(bigint, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.client_streak_progress(p_token uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('current', public._compute_current_streak(s.subject_id, st.last_claimed_date),
    'lastClaimedDate', st.last_claimed_date)
  FROM public.client_sessions s LEFT JOIN public.student_streak_state st ON st.student_id = s.subject_id
  WHERE s.token = p_token AND s.subject_type = 'student' AND s.expires_at > now();
$$;
REVOKE ALL ON FUNCTION public.client_streak_progress(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_streak_progress(uuid) TO anon, authenticated;

-- Timestamp rules also cover the existing student-management coupon buttons.
CREATE OR REPLACE FUNCTION public.enforce_coupon_use_time() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.used AND OLD.used_at <= now() - interval '24 hours' THEN
    RAISE EXCEPTION '사용 처리 후 24시간이 지나 변경할 수 없습니다.';
  END IF;
  NEW.used_at := CASE WHEN NEW.used THEN CASE WHEN OLD.used THEN OLD.used_at ELSE now() END ELSE NULL END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_coupon_use_time ON public.student_coupons;
CREATE TRIGGER enforce_coupon_use_time BEFORE UPDATE OF used, used_at ON public.student_coupons
  FOR EACH ROW EXECUTE FUNCTION public.enforce_coupon_use_time();
CREATE INDEX IF NOT EXISTS student_coupons_cleanup_dates ON public.student_coupons(used_at) WHERE used;

-- Serialize claims and ensure the reset state exists even on direct claims.
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

  INSERT INTO public.student_streak_state(student_id) VALUES (v_student_id) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM public.student_streak_state WHERE student_id = v_student_id FOR UPDATE;

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

