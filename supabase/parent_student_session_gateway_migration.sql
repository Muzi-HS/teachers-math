-- 적용 순서: pin_null_guard_migration.sql 다음, 앱의 게이트웨이 전환 배포 전에 전체 실행하세요.
-- 반복 실행 가능합니다. 학생/학부모 PIN 해시, 기존 데이터는 변경하지 않습니다.
--
-- 목적: 학부모/학생은 Supabase Auth 없이 전화번호+PIN만 쓰기 때문에, records/record_comments/
-- record_test_items에 대해 지금까지 anon 역할에 "누구나 조회 가능" 정책(using: true)이 걸려 있었다.
-- 실제 보호는 화면단 필터(.eq('student_id', ...))뿐이었고, DB는 다른 학생 기록을 그대로 내줬다.
-- records는 심지어 "누구나 무제한 수정 가능" 정책까지 있었다.
--
-- 이 SQL은 PIN 검증 성공 시 발급하는 세션 토큰을 기준으로 "이 토큰이 정말 이 학생 데이터를
-- 볼 자격이 있는지"를 서버 함수 안에서 검사하고, anon의 직접 테이블 접근 정책은 제거한다.
BEGIN;

-- ── 1. 세션 토큰 테이블 — 직접 접근 전면 차단, SECURITY DEFINER 함수만 이 테이블을 만진다 ──
CREATE TABLE IF NOT EXISTS public.client_sessions (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('parent','student')),
  subject_id int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days'
);
ALTER TABLE public.client_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_sessions FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS client_sessions_subject_idx ON public.client_sessions(subject_type, subject_id);

-- 만료된 세션은 조용히 정리 (선택 실행되는 함수 안에서 opportunistic하게 호출)
CREATE OR REPLACE FUNCTION public._gc_client_sessions() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM public.client_sessions WHERE expires_at < now();
$$;

-- ── 2. 세션 소유권 확인 헬퍼 ──
-- 학생 토큰: subject_id가 곧 그 학생.
-- 학부모 토큰: parent_students로 연결된 자녀만 인정.
-- student_id 타입이 테이블마다 int/bigint로 섞여 있어(records는 int, student_coupons 등은
-- bigint) 인자를 bigint로 받아 둘 다 암시적 형변환으로 받아들인다.
DROP FUNCTION IF EXISTS public.session_owns_student(uuid, int);
CREATE OR REPLACE FUNCTION public.session_owns_student(p_token uuid, p_student_id bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_type text; v_id int;
BEGIN
  IF p_token IS NULL OR p_student_id IS NULL THEN RETURN false; END IF;
  SELECT subject_type, subject_id INTO v_type, v_id
    FROM public.client_sessions WHERE token = p_token AND expires_at > now();
  IF v_type IS NULL THEN RETURN false; END IF;
  IF v_type = 'student' THEN RETURN v_id = p_student_id; END IF;
  RETURN EXISTS (SELECT 1 FROM public.parent_students WHERE parent_id = v_id AND student_id = p_student_id);
END;
$$;
REVOKE ALL ON FUNCTION public.session_owns_student(uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.session_owns_student(uuid,bigint) TO anon, authenticated;

-- ── 3. PIN 검증 함수에 세션 토큰 발급 추가 (pin_null_guard_migration.sql의 NULL 방어는 유지) ──
-- 반환 타입(컬럼)이 바뀌므로 CREATE OR REPLACE로는 안 되고, 먼저 지워야 한다.
DROP FUNCTION IF EXISTS public.verify_parent_pin(text, text);
DROP FUNCTION IF EXISTS public.verify_student_pin(text, text);

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
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' OR crypt(p_pin, v_hash) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'PIN이 올바르지 않습니다.';
  END IF;
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
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' OR crypt(p_pin, v_hash) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'PIN이 올바르지 않습니다.';
  END IF;
  INSERT INTO public.client_sessions(subject_type, subject_id) VALUES ('student', v_id) RETURNING token INTO v_token;
  RETURN QUERY SELECT v_id, v_name, v_phone, (crypt('0000', v_hash) = v_hash), v_token;
END;
$function$;

REVOKE ALL ON FUNCTION public.verify_parent_pin(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_parent_pin(text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_student_pin(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_student_pin(text, text) TO anon, authenticated;

-- ── 4. 수업기록 조회/쓰기 게이트웨이 함수 (학부모·학생 공용) ──
CREATE OR REPLACE FUNCTION public.client_records(p_token uuid, p_student_id int)
RETURNS SETOF public.records
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT r.* FROM public.records r
  WHERE r.student_id = p_student_id
    AND r.is_draft = false AND r.released_to_parent = true
    AND public.session_owns_student(p_token, p_student_id)
  ORDER BY r.date DESC;
$$;

CREATE OR REPLACE FUNCTION public.client_record_test_items(p_token uuid, p_record_ids int[])
RETURNS SETOF public.record_test_items
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT rti.* FROM public.record_test_items rti
  JOIN public.records r ON r.id = rti.record_id
  WHERE rti.record_id = ANY(p_record_ids)
    AND public.session_owns_student(p_token, r.student_id);
$$;

CREATE OR REPLACE FUNCTION public.client_record_comments(p_token uuid, p_record_ids int[])
RETURNS SETOF public.record_comments
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT rc.* FROM public.record_comments rc
  JOIN public.records r ON r.id = rc.record_id
  WHERE rc.record_id = ANY(p_record_ids)
    AND public.session_owns_student(p_token, r.student_id)
  ORDER BY rc.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.client_mark_records_viewed(p_token uuid, p_record_ids int[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.records r SET viewed_at = now()
  WHERE r.id = ANY(p_record_ids) AND r.viewed_at IS NULL
    AND public.session_owns_student(p_token, r.student_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.client_dismiss_edited_notice(p_token uuid, p_record_ids int[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.records r SET edited_at = NULL
  WHERE r.id = ANY(p_record_ids)
    AND public.session_owns_student(p_token, r.student_id);
END;
$$;

-- 학부모만 의견을 남길 수 있다 (학생 화면에는 이 기능이 없다).
CREATE OR REPLACE FUNCTION public.client_send_record_comment(p_token uuid, p_record_id int, p_content text)
RETURNS public.record_comments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_type text; v_student_id int; v_row public.record_comments;
BEGIN
  IF p_content IS NULL OR btrim(p_content) = '' THEN
    RAISE EXCEPTION '내용을 입력하세요.';
  END IF;
  SELECT subject_type INTO v_type FROM public.client_sessions WHERE token = p_token AND expires_at > now();
  IF v_type IS DISTINCT FROM 'parent' THEN
    RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
  END IF;
  SELECT student_id INTO v_student_id FROM public.records WHERE id = p_record_id;
  IF v_student_id IS NULL OR NOT public.session_owns_student(p_token, v_student_id) THEN
    RAISE EXCEPTION '이 기록에 접근할 수 없습니다.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.record_comments(record_id, sender_type, content)
    VALUES (p_record_id, 'parent', p_content) RETURNING * INTO v_row;
  UPDATE public.records SET viewed_at = coalesce(viewed_at, now()) WHERE id = p_record_id;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.client_records(uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_records(uuid,int) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.client_record_test_items(uuid,int[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_record_test_items(uuid,int[]) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.client_record_comments(uuid,int[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_record_comments(uuid,int[]) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.client_mark_records_viewed(uuid,int[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_mark_records_viewed(uuid,int[]) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.client_dismiss_edited_notice(uuid,int[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_dismiss_edited_notice(uuid,int[]) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.client_send_record_comment(uuid,int,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_send_record_comment(uuid,int,text) TO anon, authenticated;

-- ── 5. 기존 anon 직접 접근 정책 제거 — 이제 위 게이트웨이 함수로만 접근한다 ──
-- (관리자/선생님 쪽 정책 records_staff, record_comments_staff, rti_teacher_all은 그대로 둔다 —
--  이미 진짜 Supabase Auth + is_teacher_or_admin()으로 보호되고 있어서 이번 변경과 무관하다.)
DROP POLICY IF EXISTS records_select_anon ON public.records;
DROP POLICY IF EXISTS records_update_anon ON public.records;
DROP POLICY IF EXISTS records_parent ON public.records; -- 쓰이지 않는 옛 jwt claim 방식, 대체됨
DROP POLICY IF EXISTS record_comments_select_anon ON public.record_comments;
DROP POLICY IF EXISTS record_comments_insert_anon ON public.record_comments;
DROP POLICY IF EXISTS record_test_items_select_anon ON public.record_test_items;

COMMIT;
