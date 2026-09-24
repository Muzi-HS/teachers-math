-- 학부모/학생 PIN 보안 강화
-- 지금까지 parents.pin / students.pin에 4자리 PIN이 평문으로 저장되어 있었고, 두 테이블 모두
-- anon(비로그인) 역할에게 "SELECT true / UPDATE true" 정책이 걸려 있어, 앱을 거치지 않고
-- Supabase REST API를 직접 호출하면 누구나 모든 학부모/학생의 PIN을 그대로 읽거나, 심지어
-- 아무 계정의 PIN을 마음대로 바꿔버릴 수 있는 상태였다(계정 탈취 가능).
--
-- 이 마이그레이션은:
--   1) PIN을 pgcrypto의 bcrypt 해시(pin_hash)로 바꿔 저장하고 평문 pin 컬럼은 삭제한다.
--   2) anon이 더 이상 pin_hash를 직접 읽거나 쓸 수 없도록 컬럼 권한을 회수한다.
--   3) PIN 검증/변경은 오직 아래 SECURITY DEFINER 함수를 통해서만 가능하게 한다.
--      (검증 시 PIN 값 자체가 클라이언트로 돌아오지 않고, 변경 시에는 기존 PIN을 먼저
--      맞혀야만 통과한다 — 지금까지처럼 아무나 다른 사람 PIN을 덮어쓸 수 없다.)
--   4) 시험 응시용 verify_test_student()도 새 pin_hash 기준으로 맞춘다.
-- Supabase 대시보드 > SQL Editor에서 실행하세요

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── parents ──
ALTER TABLE parents ADD COLUMN IF NOT EXISTS pin_hash text;
UPDATE parents SET pin_hash = crypt(COALESCE(pin, '0000'), gen_salt('bf')) WHERE pin_hash IS NULL;
ALTER TABLE parents ALTER COLUMN pin_hash SET NOT NULL;
ALTER TABLE parents DROP COLUMN IF EXISTS pin;

-- ── students ──
ALTER TABLE students ADD COLUMN IF NOT EXISTS pin_hash text;
UPDATE students SET pin_hash = crypt(COALESCE(pin, '0000'), gen_salt('bf')) WHERE pin_hash IS NULL;
ALTER TABLE students ALTER COLUMN pin_hash SET NOT NULL;
ALTER TABLE students DROP COLUMN IF EXISTS pin;

-- 더 이상 anon이 테이블을 직접 UPDATE해서 PIN을 바꿀 수 없다 — 아래 update_*_pin() 함수로만 가능
DROP POLICY IF EXISTS parents_update_pin_anon ON parents;
DROP POLICY IF EXISTS students_update_pin_anon ON students;

-- anon이 pin_hash 컬럼을 SELECT할 수 없게 막는다. 테이블 전체에 대한 테이블 단위 SELECT
-- 권한이 이미 있으면 컬럼 단위 REVOKE만으로는 걷어낼 수 없으므로(PostgreSQL 권한 모델의
-- 특성), 테이블 단위 권한을 전부 회수한 뒤 pin_hash를 뺀 나머지 컬럼만 다시 부여한다.
-- SECURITY DEFINER 함수는 소유자(테이블 소유자) 권한으로 실행되어 이 회수와 무관하게 동작한다.
REVOKE SELECT ON parents FROM anon;
GRANT SELECT (id, phone, name, created_at) ON parents TO anon;
REVOKE SELECT ON students FROM anon;
GRANT SELECT (id, name, birth_year, school, phone, parent_phone, reg_date, created_at, school_type, school_elementary, school_middle, nfc_token) ON students TO anon;

-- ── 학부모 PIN 검증: 성공하면 자녀 목록까지 한 번에 반환(기존 parentLookup+비교 로직을 대체) ──
CREATE OR REPLACE FUNCTION public.verify_parent_pin(p_phone text, p_pin text)
RETURNS TABLE(parent_id int, phone text, is_default_pin boolean, children jsonb)
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_phone text := regexp_replace(p_phone, '[-\s]', '', 'g');
  v_id int;
  v_hash text;
BEGIN
  SELECT p.id, p.pin_hash INTO v_id, v_hash FROM parents p WHERE p.phone = v_phone;
  IF v_id IS NULL THEN
    RAISE EXCEPTION '등록되지 않은 전화번호입니다. 담당 선생님에게 문의하세요.';
  END IF;
  IF crypt(p_pin, v_hash) <> v_hash THEN
    RAISE EXCEPTION 'PIN이 올바르지 않습니다.';
  END IF;
  RETURN QUERY
    SELECT v_id, v_phone, (crypt('0000', v_hash) = v_hash),
      COALESCE(
        jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'birth_year', s.birth_year, 'school', s.school))
          FILTER (WHERE s.id IS NOT NULL),
        '[]'::jsonb
      )
    FROM parent_students ps JOIN students s ON s.id = ps.student_id
    WHERE ps.parent_id = v_id;
END;
$function$;

-- ── 학부모 PIN 변경: 기존 PIN이 맞아야만 새 PIN으로 바꿀 수 있다 ──
CREATE OR REPLACE FUNCTION public.update_parent_pin(p_parent_id int, p_old_pin text, p_new_pin text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_hash text;
BEGIN
  IF p_new_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'PIN은 4자리 숫자여야 합니다.';
  END IF;
  SELECT pin_hash INTO v_hash FROM parents WHERE id = p_parent_id;
  IF v_hash IS NULL THEN
    RAISE EXCEPTION '계정을 찾을 수 없습니다.';
  END IF;
  IF crypt(p_old_pin, v_hash) <> v_hash THEN
    RAISE EXCEPTION '현재 PIN이 올바르지 않습니다.';
  END IF;
  UPDATE parents SET pin_hash = crypt(p_new_pin, gen_salt('bf')) WHERE id = p_parent_id;
END;
$function$;

-- ── 학생 PIN 검증 ──
CREATE OR REPLACE FUNCTION public.verify_student_pin(p_phone text, p_pin text)
RETURNS TABLE(student_id int, name text, phone text, is_default_pin boolean)
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_phone text := regexp_replace(p_phone, '[-\s]', '', 'g');
  v_id int;
  v_name text;
  v_hash text;
BEGIN
  SELECT st.id, st.name, st.pin_hash INTO v_id, v_name, v_hash FROM students st WHERE st.phone = v_phone;
  IF v_id IS NULL THEN
    RAISE EXCEPTION '등록되지 않은 전화번호입니다. 담당 선생님에게 문의하세요.';
  END IF;
  IF crypt(p_pin, v_hash) <> v_hash THEN
    RAISE EXCEPTION 'PIN이 올바르지 않습니다.';
  END IF;
  RETURN QUERY SELECT v_id, v_name, v_phone, (crypt('0000', v_hash) = v_hash);
END;
$function$;

-- ── 학생 PIN 변경 ──
CREATE OR REPLACE FUNCTION public.update_student_pin(p_student_id int, p_old_pin text, p_new_pin text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_hash text;
BEGIN
  IF p_new_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'PIN은 4자리 숫자여야 합니다.';
  END IF;
  SELECT pin_hash INTO v_hash FROM students WHERE id = p_student_id;
  IF v_hash IS NULL THEN
    RAISE EXCEPTION '계정을 찾을 수 없습니다.';
  END IF;
  IF crypt(p_old_pin, v_hash) <> v_hash THEN
    RAISE EXCEPTION '현재 PIN이 올바르지 않습니다.';
  END IF;
  UPDATE students SET pin_hash = crypt(p_new_pin, gen_salt('bf')) WHERE id = p_student_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.verify_parent_pin(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.update_parent_pin(int, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_student_pin(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.update_student_pin(int, text, text) TO anon;

-- ── 관리자용 PIN 초기화 — 학부모/학생이 PIN을 잊었을 때 관리자가 기본값(0000)으로 되돌린다.
--    해시라서 관리자도 "지금 PIN이 뭔지" 알아낼 수는 없고, 초기화만 가능하다(정상적인 동작).
--    is_teacher_or_admin()이 auth.uid() 기준 실제 로그인 세션을 확인하므로 일반 방문자는 호출할 수 없다. ──
CREATE OR REPLACE FUNCTION public.admin_reset_parent_pin(p_phone text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $function$
BEGIN
  IF NOT is_teacher_or_admin() THEN
    RAISE EXCEPTION '권한이 없습니다.';
  END IF;
  UPDATE parents SET pin_hash = crypt('0000', gen_salt('bf'))
    WHERE phone = regexp_replace(p_phone, '[-\s]', '', 'g');
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reset_student_pin(p_student_id int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $function$
BEGIN
  IF NOT is_teacher_or_admin() THEN
    RAISE EXCEPTION '권한이 없습니다.';
  END IF;
  UPDATE students SET pin_hash = crypt('0000', gen_salt('bf')) WHERE id = p_student_id;
END;
$function$;

-- PostgreSQL은 새 함수의 EXECUTE 권한을 기본적으로 PUBLIC(anon 포함)에게 자동으로 주므로,
-- authenticated에게 부여하기 전에 먼저 명시적으로 회수해야 anon이 호출할 수 없다.
REVOKE ALL ON FUNCTION public.admin_reset_parent_pin(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_reset_student_pin(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_parent_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_student_pin(int) TO authenticated;

-- ── 시험 응시 PIN 검증(verify_test_student)도 pin_hash 기준으로 맞춘다.
--    실패 5회 시 5분 잠금 로직은 그대로 유지한다. ──
CREATE OR REPLACE FUNCTION public.verify_test_student(p_student_id bigint, p_pin text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lim public.test_login_limits; expected_hash text;
BEGIN
  SELECT pin_hash INTO expected_hash FROM public.students WHERE id = p_student_id;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.test_login_limits(student_id) VALUES (p_student_id) ON CONFLICT DO NOTHING;
  SELECT * INTO lim FROM public.test_login_limits WHERE student_id = p_student_id FOR UPDATE;
  IF lim.blocked_until > clock_timestamp() THEN RETURN false; END IF;
  IF lim.blocked_until IS NOT NULL THEN lim.failures := 0; END IF;
  IF p_pin ~ '^[0-9]{4}$' AND crypt(p_pin, expected_hash) = expected_hash THEN
    UPDATE public.test_login_limits SET failures = 0, blocked_until = NULL WHERE student_id = p_student_id;
    RETURN true;
  END IF;
  UPDATE public.test_login_limits SET failures = lim.failures + 1,
    blocked_until = CASE WHEN lim.failures + 1 >= 5 THEN clock_timestamp() + interval '5 minutes' ELSE NULL END
    WHERE student_id = p_student_id;
  RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.verify_test_student(bigint, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_test_student(bigint, text) TO service_role;
