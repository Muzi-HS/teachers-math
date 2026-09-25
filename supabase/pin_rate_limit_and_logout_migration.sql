-- 적용 순서: notices_inquiries_gateway_migration.sql 다음, 앱의 전환 배포 전에 전체
-- 실행하세요. 반복 실행 가능합니다. 기존 PIN 해시·세션·데이터는 변경하지 않습니다.
--
-- 목적:
-- 1) PIN이 4자리 숫자라 이론상 10,000번 시도하면 뚫린다. 지금까지는 NULL/형식 우회만
--    막았지, 틀린 시도 자체를 반복하는 것은 막지 않았다. 5회 연속 실패 시 15분 잠금.
-- 2) 로그아웃해도 서버에 발급된 세션 토큰(client_sessions)은 만료 전까지(30일) 계속
--    유효했다. 로그아웃 시 그 토큰 자체를 서버에서 지운다.
BEGIN;

-- ── 1. PIN 시도 횟수 추적 테이블 — 직접 접근 전면 차단 ──
CREATE TABLE IF NOT EXISTS public.pin_attempts (
  subject_type text NOT NULL CHECK (subject_type IN ('parent','student')),
  subject_id int NOT NULL,
  failed_count int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  PRIMARY KEY (subject_type, subject_id)
);
ALTER TABLE public.pin_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pin_attempts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._pin_check_lock(p_subject_type text, p_subject_id int) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_locked_until timestamptz;
BEGIN
  SELECT locked_until INTO v_locked_until FROM public.pin_attempts
    WHERE subject_type = p_subject_type AND subject_id = p_subject_id;
  IF v_locked_until IS NOT NULL AND v_locked_until > now() THEN
    RAISE EXCEPTION '너무 많이 시도했습니다. 15분 후 다시 시도해주세요.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._pin_record_failure(p_subject_type text, p_subject_id int) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.pin_attempts(subject_type, subject_id, failed_count, locked_until)
    VALUES (p_subject_type, p_subject_id, 1, NULL)
    ON CONFLICT (subject_type, subject_id) DO UPDATE SET
      failed_count = public.pin_attempts.failed_count + 1,
      locked_until = CASE
        WHEN public.pin_attempts.failed_count + 1 >= 5 THEN now() + interval '15 minutes'
        ELSE public.pin_attempts.locked_until
      END;
END;
$$;

CREATE OR REPLACE FUNCTION public._pin_record_success(p_subject_type text, p_subject_id int) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM public.pin_attempts WHERE subject_type = p_subject_type AND subject_id = p_subject_id;
$$;

-- ── 2. 로그인 함수에 잠금 검사 + 실패 기록을 끼워 넣는다 ──
-- 주의: "틀린 PIN"을 RAISE EXCEPTION으로 알리면, 그 예외 때문에 방금 PERFORM으로 남긴
-- 실패 기록(_pin_record_failure)까지 같은 트랜잭션이라 함께 롤백되어 카운터가 전혀 쌓이지
-- 않는다. 그래서 "틀린 PIN"은 예외 대신 빈 결과(0행)로 반환해 실패 기록이 커밋되게 하고,
-- "이미 잠긴 상태"(아직 아무것도 기록 안 한 시점)만 예외로 알린다. 반환 타입은 그대로라
-- CREATE OR REPLACE로 충분하다.
CREATE OR REPLACE FUNCTION public.verify_parent_pin(p_phone text, p_pin text)
RETURNS TABLE(parent_id int, phone text, is_default_pin boolean, children jsonb, session_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_phone text := regexp_replace(p_phone, '[-\s]', '', 'g');
  v_id int;
  v_hash text;
  v_token uuid;
BEGIN
  PERFORM public._gc_client_sessions();
  SELECT p.id, p.pin_hash INTO v_id, v_hash FROM parents p WHERE p.phone = v_phone;
  IF v_id IS NULL THEN
    RAISE EXCEPTION '등록되지 않은 전화번호입니다. 담당 선생님에게 문의하세요.';
  END IF;
  PERFORM public._pin_check_lock('parent', v_id);
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' OR crypt(p_pin, v_hash) IS DISTINCT FROM v_hash THEN
    PERFORM public._pin_record_failure('parent', v_id);
    RETURN;
  END IF;
  PERFORM public._pin_record_success('parent', v_id);
  INSERT INTO public.client_sessions(subject_type, subject_id) VALUES ('parent', v_id) RETURNING token INTO v_token;
  RETURN QUERY
    SELECT v_id, v_phone, (crypt('0000', v_hash) = v_hash),
      COALESCE(
        jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'birth_year', s.birth_year, 'school', s.school))
          FILTER (WHERE s.id IS NOT NULL),
        '[]'::jsonb
      ),
      v_token
    FROM parent_students ps JOIN students s ON s.id = ps.student_id
    WHERE ps.parent_id = v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_student_pin(p_phone text, p_pin text)
RETURNS TABLE(student_id int, name text, phone text, is_default_pin boolean, session_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_phone text := regexp_replace(p_phone, '[-\s]', '', 'g');
  v_id int;
  v_name text;
  v_hash text;
  v_token uuid;
BEGIN
  PERFORM public._gc_client_sessions();
  SELECT st.id, st.name, st.pin_hash INTO v_id, v_name, v_hash FROM students st WHERE st.phone = v_phone;
  IF v_id IS NULL THEN
    RAISE EXCEPTION '등록되지 않은 전화번호입니다. 담당 선생님에게 문의하세요.';
  END IF;
  PERFORM public._pin_check_lock('student', v_id);
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' OR crypt(p_pin, v_hash) IS DISTINCT FROM v_hash THEN
    PERFORM public._pin_record_failure('student', v_id);
    RETURN;
  END IF;
  PERFORM public._pin_record_success('student', v_id);
  INSERT INTO public.client_sessions(subject_type, subject_id) VALUES ('student', v_id) RETURNING token INTO v_token;
  RETURN QUERY SELECT v_id, v_name, v_phone, (crypt('0000', v_hash) = v_hash), v_token;
END;
$function$;

-- PIN 변경(update_*_pin)은 그대로 둔다 — 기존 PIN이 맞아야 통과하므로 잠긴 상태에서는
-- 여기서도 거부되도록 잠금 여부만 확인하고(읽기 전용이라 롤백 문제 없음), 실패 횟수를
-- 이 함수 자체에서 새로 늘리지는 않는다(그러려면 반환 타입을 바꿔야 해서 별도로 처리).
CREATE OR REPLACE FUNCTION public.update_parent_pin(p_parent_id int, p_old_pin text, p_new_pin text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_hash text;
BEGIN
  IF p_new_pin IS NULL OR p_new_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'PIN은 4자리 숫자여야 합니다.';
  END IF;
  SELECT pin_hash INTO v_hash FROM parents WHERE id = p_parent_id;
  IF v_hash IS NULL THEN
    RAISE EXCEPTION '계정을 찾을 수 없습니다.';
  END IF;
  PERFORM public._pin_check_lock('parent', p_parent_id);
  IF p_old_pin IS NULL OR p_old_pin !~ '^[0-9]{4}$' OR crypt(p_old_pin, v_hash) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION '현재 PIN이 올바르지 않습니다.';
  END IF;
  PERFORM public._pin_record_success('parent', p_parent_id);
  UPDATE parents SET pin_hash = crypt(p_new_pin, gen_salt('bf')) WHERE id = p_parent_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_student_pin(p_student_id int, p_old_pin text, p_new_pin text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_hash text;
BEGIN
  IF p_new_pin IS NULL OR p_new_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'PIN은 4자리 숫자여야 합니다.';
  END IF;
  SELECT pin_hash INTO v_hash FROM students WHERE id = p_student_id;
  IF v_hash IS NULL THEN
    RAISE EXCEPTION '계정을 찾을 수 없습니다.';
  END IF;
  PERFORM public._pin_check_lock('student', p_student_id);
  IF p_old_pin IS NULL OR p_old_pin !~ '^[0-9]{4}$' OR crypt(p_old_pin, v_hash) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION '현재 PIN이 올바르지 않습니다.';
  END IF;
  PERFORM public._pin_record_success('student', p_student_id);
  UPDATE students SET pin_hash = crypt(p_new_pin, gen_salt('bf')) WHERE id = p_student_id;
END;
$function$;

-- ── 3. 로그아웃 시 서버에 발급된 세션 토큰 자체를 무효화한다 ──
CREATE OR REPLACE FUNCTION public.client_logout(p_token uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM public.client_sessions WHERE token = p_token;
$$;
REVOKE ALL ON FUNCTION public.client_logout(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_logout(uuid) TO anon, authenticated;

COMMIT;
