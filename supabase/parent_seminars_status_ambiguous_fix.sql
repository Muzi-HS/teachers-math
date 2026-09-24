-- register_for_seminar / find_seminar_registration 함수는 RETURNS TABLE(status text, ...)로
-- 정의되어 있어, plpgsql이 함수 본문 전체에서 "status"를 OUT 파라미터(변수)로도 취급한다.
-- 그 결과 parent_seminar_registrations.status를 별칭 없이 그냥 "status"로만 쓴 부분들이
-- "column reference status is ambiguous"(42702) 오류를 내며 실패했다(설명회 신청 접수/조회
-- 전부 실패). 테이블에 별칭을 주고 모든 status 참조를 별칭.status로 명시해 고친다.
-- Supabase 대시보드 > SQL Editor에서 실행하세요

CREATE OR REPLACE FUNCTION public.register_for_seminar(
  p_seminar_id bigint,
  p_parent_name text,
  p_phone text,
  p_child_name text,
  p_child_grade text,
  p_child_school text
) RETURNS TABLE(status text, waitlist_position int)
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_capacity int;
  v_confirmed_count int;
  v_new_status text;
  v_phone text := regexp_replace(p_phone, '\D', '', 'g');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM parent_seminars WHERE id = p_seminar_id AND is_active = true) THEN
    RAISE EXCEPTION '신청을 받고 있지 않은 설명회입니다.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM parent_seminar_registrations psr
    WHERE psr.seminar_id = p_seminar_id AND psr.phone = v_phone AND psr.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION '이미 신청하신 전화번호입니다.';
  END IF;

  SELECT capacity INTO v_capacity FROM parent_seminars WHERE id = p_seminar_id;

  IF v_capacity > 0 THEN
    SELECT count(*) INTO v_confirmed_count FROM parent_seminar_registrations psr
      WHERE psr.seminar_id = p_seminar_id AND psr.status = 'confirmed';
    v_new_status := CASE WHEN v_confirmed_count < v_capacity THEN 'confirmed' ELSE 'waitlisted' END;
  ELSE
    v_new_status := 'confirmed';
  END IF;

  INSERT INTO parent_seminar_registrations
    (seminar_id, parent_name, phone, child_name, child_grade, child_school, status, consent_agreed_at)
  VALUES
    (p_seminar_id, p_parent_name, v_phone, NULLIF(p_child_name, ''), p_child_grade, p_child_school, v_new_status, now());

  IF v_new_status = 'waitlisted' THEN
    RETURN QUERY
      SELECT v_new_status, (
        SELECT rn::int FROM (
          SELECT psr.phone, row_number() OVER (ORDER BY psr.created_at) AS rn
          FROM parent_seminar_registrations psr
          WHERE psr.seminar_id = p_seminar_id AND psr.status = 'waitlisted'
        ) t WHERE t.phone = v_phone
      );
  ELSE
    RETURN QUERY SELECT v_new_status, NULL::int;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.find_seminar_registration(
  p_seminar_id bigint,
  p_phone text
) RETURNS TABLE(status text, waitlist_position int, parent_name text, child_name text, child_grade text, child_school text)
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_phone text := regexp_replace(p_phone, '\D', '', 'g');
BEGIN
  RETURN QUERY
    SELECT r.status, (
      CASE WHEN r.status = 'waitlisted' THEN (
        SELECT rn::int FROM (
          SELECT psr.phone, row_number() OVER (ORDER BY psr.created_at) AS rn
          FROM parent_seminar_registrations psr
          WHERE psr.seminar_id = p_seminar_id AND psr.status = 'waitlisted'
        ) t WHERE t.phone = v_phone
      ) ELSE NULL END
    ), r.parent_name, r.child_name, r.child_grade, r.child_school
    FROM parent_seminar_registrations r
    WHERE r.seminar_id = p_seminar_id AND r.phone = v_phone AND r.status <> 'cancelled'
    ORDER BY r.created_at DESC
    LIMIT 1;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.register_for_seminar(bigint, text, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.find_seminar_registration(bigint, text) TO anon;
