-- 시험 PIN 검증: pgcrypto가 extensions 스키마에 설치된 환경 지원.
-- PIN 해시 마이그레이션 이후 SQL Editor에서 실행하세요. 재실행 가능합니다.
-- 기존 PIN, 시험 답안, 잠금 상태는 변경하지 않습니다.
BEGIN;
CREATE OR REPLACE FUNCTION public.verify_test_student(p_student_id bigint, p_pin text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
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
COMMIT;
