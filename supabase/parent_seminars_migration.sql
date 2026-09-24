-- 학부모 설명회 기능
-- 1) parent_seminars: 관리자가 등록하는 설명회 회차(제목/일시/장소/정원/배너·팝업 노출 설정).
--    special_classes와 동일하게 is_active=true인 것만 anon이 조회할 수 있다.
-- 2) parent_seminar_registrations: 설명회 신청/취소/대기 내역. 전화번호만으로 타인의 신청
--    정보를 조회/취소할 수 없도록, anon은 테이블에 직접 접근하지 않고 아래 SECURITY DEFINER
--    RPC 함수(register_for_seminar / find_seminar_registration / cancel_seminar_registration)
--    를 통해서만 자기 전화번호에 해당하는 내역을 다룰 수 있다.
-- Supabase 대시보드 > SQL Editor에서 실행하세요

CREATE TABLE IF NOT EXISTS parent_seminars (
  id bigint generated always as identity primary key,
  title text NOT NULL,
  description text,
  event_at timestamptz,
  location text,
  capacity int NOT NULL DEFAULT 0, -- 0이면 정원 제한 없음
  is_active boolean NOT NULL DEFAULT true,
  banner_enabled boolean NOT NULL DEFAULT true,
  popup_enabled boolean NOT NULL DEFAULT false,
  popup_type text NOT NULL DEFAULT 'text' CHECK (popup_type IN ('image', 'text', 'both')),
  popup_image_url text,
  popup_title text,
  popup_body text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE parent_seminars ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parent_seminars_staff ON parent_seminars;
DROP POLICY IF EXISTS parent_seminars_select_anon ON parent_seminars;

CREATE POLICY parent_seminars_staff ON parent_seminars
  FOR ALL TO public USING (is_teacher_or_admin());

CREATE POLICY parent_seminars_select_anon ON parent_seminars
  FOR SELECT TO anon USING (is_active = true);


CREATE TABLE IF NOT EXISTS parent_seminar_registrations (
  id bigint generated always as identity primary key,
  seminar_id bigint NOT NULL REFERENCES parent_seminars(id) ON DELETE CASCADE,
  parent_name text NOT NULL,
  phone text NOT NULL,
  child_name text,
  child_grade text NOT NULL,
  child_school text NOT NULL,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'waitlisted', 'cancelled')),
  consent_agreed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_psr_seminar_phone ON parent_seminar_registrations(seminar_id, phone);
CREATE INDEX IF NOT EXISTS idx_psr_seminar_status_created ON parent_seminar_registrations(seminar_id, status, created_at);

ALTER TABLE parent_seminar_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parent_seminar_registrations_staff ON parent_seminar_registrations;

-- 관리자/선생님/조교만 테이블을 직접 조회·수정·삭제할 수 있다.
-- 일반 방문자(anon)는 이 테이블에 대한 정책이 없으므로 직접 접근이 전혀 불가능하며,
-- 아래 SECURITY DEFINER 함수를 통해서만 자신의 전화번호에 해당하는 신청을 다룰 수 있다.
CREATE POLICY parent_seminar_registrations_staff ON parent_seminar_registrations
  FOR ALL TO public USING (is_teacher_or_admin());


-- 신청 접수: 정원 이내면 확정(confirmed), 초과하면 대기(waitlisted)로 등록하고
-- 결과 상태와(대기라면) 대기번호를 반환한다.
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

-- 전화번호로 본인의 최신 신청 내역을 조회(대기 중이면 실시간 대기번호 포함)
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

-- 전화번호로 본인의 신청 취소. 확정자가 취소하면 가장 오래 기다린 대기자를 자동 승격한다.
CREATE OR REPLACE FUNCTION public.cancel_seminar_registration(
  p_seminar_id bigint,
  p_phone text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_phone text := regexp_replace(p_phone, '\D', '', 'g');
  v_id bigint;
  v_status text;
  v_promote_id bigint;
BEGIN
  SELECT id, status INTO v_id, v_status FROM parent_seminar_registrations
    WHERE seminar_id = p_seminar_id AND phone = v_phone AND status <> 'cancelled'
    ORDER BY created_at DESC LIMIT 1;

  IF v_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE parent_seminar_registrations SET status = 'cancelled' WHERE id = v_id;

  IF v_status = 'confirmed' THEN
    SELECT id INTO v_promote_id FROM parent_seminar_registrations
      WHERE seminar_id = p_seminar_id AND status = 'waitlisted'
      ORDER BY created_at ASC LIMIT 1;
    IF v_promote_id IS NOT NULL THEN
      UPDATE parent_seminar_registrations SET status = 'confirmed' WHERE id = v_promote_id;
    END IF;
  END IF;

  RETURN true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.register_for_seminar(bigint, text, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.find_seminar_registration(bigint, text) TO anon;
GRANT EXECUTE ON FUNCTION public.cancel_seminar_registration(bigint, text) TO anon;
