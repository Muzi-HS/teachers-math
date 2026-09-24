-- verify_parent_pin / verify_student_pin은 RETURNS TABLE(... phone text ...)로 정의되어 있어
-- plpgsql이 함수 본문 전체에서 "phone"(그리고 학생 쪽은 "name"도)을 OUT 파라미터로도 취급한다.
-- WHERE phone = v_phone처럼 별칭 없이 쓴 부분이 컬럼과 충돌해 로그인 자체가 실패했다
-- ("column reference phone is ambiguous"). 테이블에 별칭을 줘서 고친다.
-- Supabase 대시보드 > SQL Editor에서 실행하세요

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

GRANT EXECUTE ON FUNCTION public.verify_parent_pin(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_student_pin(text, text) TO anon;
