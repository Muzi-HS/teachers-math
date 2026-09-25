-- 적용 순서: parent_student_directory_and_rewards_gateway_migration.sql 다음, 앱의 전환
-- 배포 전에 전체 실행하세요. 반복 실행 가능합니다. 기존 데이터는 변경하지 않습니다.
--
-- 목적: 앞 두 슬라이스와 같은 이유로 notices/notice_comments/notice_target_students/
-- notice_reads/class_notices/inquiry_messages/attendance_notices에도 anon "누구나
-- 조회·수정 가능" 정책이 걸려 있었다. 특히 notice_comments·inquiry_messages는 학부모와
-- 학원 사이의 사적인 대화라 노출 범위가 크고, attendance_notices는 익명이 남의 자녀
-- 이름으로 결석/지각을 등록·삭제할 수도 있었다.
BEGIN;

-- ── 1. 공지사항 — "전체공개"이거나 "내 자녀가 대상"인 것만 보인다 ──
CREATE OR REPLACE FUNCTION public.client_visible_notices(p_token uuid) RETURNS SETOF public.notices
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT n.* FROM public.notices n
  WHERE n.parent_visible = true
    AND (
      NOT EXISTS (SELECT 1 FROM public.notice_target_students nts WHERE nts.notice_id = n.id)
      OR EXISTS (
        SELECT 1 FROM public.notice_target_students nts
        WHERE nts.notice_id = n.id AND public.session_owns_student(p_token, nts.student_id)
      )
    )
  ORDER BY n.pinned DESC NULLS LAST, n.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.client_mark_notice_read(p_token uuid, p_notice_id int) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_type text; v_parent_id int;
BEGIN
  SELECT subject_type, subject_id INTO v_type, v_parent_id FROM public.client_sessions WHERE token = p_token AND expires_at > now();
  IF v_type IS DISTINCT FROM 'parent' THEN RETURN; END IF;
  INSERT INTO public.notice_reads(notice_id, student_id, read_at)
    SELECT p_notice_id, ps.student_id, now() FROM public.parent_students ps WHERE ps.parent_id = v_parent_id
    ON CONFLICT (notice_id, student_id) DO NOTHING;
END;
$$;

-- ── 2. 공지 댓글 — 같은 공지 노출 조건을 그대로 적용해서 읽고, 학부모 세션으로만 쓴다 ──
CREATE OR REPLACE FUNCTION public.client_notice_comments(p_token uuid, p_notice_id int) RETURNS SETOF public.notice_comments
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT nc.* FROM public.notice_comments nc
  WHERE nc.notice_id = p_notice_id
    AND EXISTS (
      SELECT 1 FROM public.notices n WHERE n.id = p_notice_id AND n.parent_visible = true
        AND (
          NOT EXISTS (SELECT 1 FROM public.notice_target_students nts WHERE nts.notice_id = n.id)
          OR EXISTS (SELECT 1 FROM public.notice_target_students nts WHERE nts.notice_id = n.id AND public.session_owns_student(p_token, nts.student_id))
        )
    )
  ORDER BY nc.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.client_post_notice_comment(
  p_token uuid, p_notice_id int, p_content text, p_is_anonymous boolean, p_parent_comment_id bigint DEFAULT NULL
) RETURNS public.notice_comments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_type text; v_parent_id int; v_row public.notice_comments;
BEGIN
  IF p_content IS NULL OR btrim(p_content) = '' THEN RAISE EXCEPTION '내용을 입력하세요.'; END IF;
  SELECT subject_type, subject_id INTO v_type, v_parent_id FROM public.client_sessions WHERE token = p_token AND expires_at > now();
  IF v_type IS DISTINCT FROM 'parent' THEN RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501'; END IF;
  -- 이 학부모에게 노출되는 공지가 아니면 댓글도 남길 수 없다 (조회 조건과 동일하게 적용)
  IF NOT EXISTS (
    SELECT 1 FROM public.notices n WHERE n.id = p_notice_id AND n.parent_visible = true
      AND (
        NOT EXISTS (SELECT 1 FROM public.notice_target_students nts WHERE nts.notice_id = n.id)
        OR EXISTS (SELECT 1 FROM public.notice_target_students nts WHERE nts.notice_id = n.id AND public.session_owns_student(p_token, nts.student_id))
      )
  ) THEN
    RAISE EXCEPTION '이 공지에는 댓글을 남길 수 없습니다.' USING ERRCODE = '42501';
  END IF;
  -- 대댓글은 최상위 댓글에만 달 수 있다 (기존 제약과 동일)
  IF p_parent_comment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.notice_comments pc WHERE pc.id = p_parent_comment_id AND pc.parent_comment_id IS NULL
  ) THEN
    RAISE EXCEPTION '답글을 남길 수 없는 댓글입니다.';
  END IF;
  INSERT INTO public.notice_comments(notice_id, parent_comment_id, sender_type, parent_id, is_anonymous, content)
    VALUES (p_notice_id, p_parent_comment_id, 'parent', v_parent_id, coalesce(p_is_anonymous, false), p_content)
    RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- ── 3. 반 공지사항 (학생, 읽기 전용) — 본인이 속한 반의 것만 ──
CREATE OR REPLACE FUNCTION public.client_class_notices(p_token uuid, p_class_ids bigint[]) RETURNS SETOF public.class_notices
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT cn.* FROM public.class_notices cn
  WHERE cn.class_id = ANY(p_class_ids)
    AND EXISTS (
      SELECT 1 FROM public.class_students cls
      WHERE cls.class_id = cn.class_id AND public.session_owns_student(p_token, cls.student_id)
    )
  ORDER BY cn.created_at ASC;
$$;

-- ── 4. 문의하기 (학부모 ↔ 학원 1:1) — 본인 것만 ──
CREATE OR REPLACE FUNCTION public.client_inquiry_messages(p_token uuid) RETURNS SETOF public.inquiry_messages
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT im.* FROM public.inquiry_messages im
  JOIN public.client_sessions cs ON cs.token = p_token AND cs.expires_at > now()
    AND cs.subject_type = 'parent' AND cs.subject_id = im.parent_id
  ORDER BY im.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.client_send_inquiry_message(p_token uuid, p_content text) RETURNS public.inquiry_messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_type text; v_parent_id int; v_row public.inquiry_messages;
BEGIN
  IF p_content IS NULL OR btrim(p_content) = '' THEN RAISE EXCEPTION '내용을 입력하세요.'; END IF;
  SELECT subject_type, subject_id INTO v_type, v_parent_id FROM public.client_sessions WHERE token = p_token AND expires_at > now();
  IF v_type IS DISTINCT FROM 'parent' THEN RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.inquiry_messages(parent_id, sender_type, content) VALUES (v_parent_id, 'parent', p_content) RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- ── 5. 결석/지각 등록 — 본인 자녀만, 본인이 등록한 것만 수정/삭제 ──
CREATE OR REPLACE FUNCTION public.client_attendance_notices(p_token uuid) RETURNS SETOF public.attendance_notices
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT an.* FROM public.attendance_notices an
  JOIN public.client_sessions cs ON cs.token = p_token AND cs.expires_at > now()
    AND cs.subject_type = 'parent' AND cs.subject_id = an.parent_id
  ORDER BY an.date DESC;
$$;

CREATE OR REPLACE FUNCTION public.client_upsert_attendance_notice(
  p_token uuid, p_id bigint, p_student_id int, p_date date, p_type text, p_reason text
) RETURNS public.attendance_notices
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_type text; v_parent_id int; v_row public.attendance_notices;
BEGIN
  SELECT subject_type, subject_id INTO v_type, v_parent_id FROM public.client_sessions WHERE token = p_token AND expires_at > now();
  IF v_type IS DISTINCT FROM 'parent' THEN RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501'; END IF;
  IF p_type NOT IN ('absence', 'late') THEN RAISE EXCEPTION '구분을 확인하세요.'; END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION '날짜를 선택하세요.'; END IF;
  IF NOT public.session_owns_student(p_token, p_student_id) THEN
    RAISE EXCEPTION '본인 자녀만 등록할 수 있습니다.' USING ERRCODE = '42501';
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE public.attendance_notices SET student_id = p_student_id, date = p_date, type = p_type, reason = p_reason
      WHERE id = p_id AND parent_id = v_parent_id
      RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN RAISE EXCEPTION '수정할 수 없는 항목입니다.'; END IF;
  ELSE
    INSERT INTO public.attendance_notices(parent_id, student_id, date, type, reason)
      VALUES (v_parent_id, p_student_id, p_date, p_type, p_reason) RETURNING * INTO v_row;
  END IF;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.client_delete_attendance_notice(p_token uuid, p_id bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_type text; v_parent_id int;
BEGIN
  SELECT subject_type, subject_id INTO v_type, v_parent_id FROM public.client_sessions WHERE token = p_token AND expires_at > now();
  IF v_type IS DISTINCT FROM 'parent' THEN RETURN; END IF;
  DELETE FROM public.attendance_notices WHERE id = p_id AND parent_id = v_parent_id;
END;
$$;

-- ── 권한 부여 ──
REVOKE ALL ON FUNCTION public.client_visible_notices(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_visible_notices(uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.client_mark_notice_read(uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_mark_notice_read(uuid,int) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.client_notice_comments(uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_notice_comments(uuid,int) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.client_post_notice_comment(uuid,int,text,boolean,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_post_notice_comment(uuid,int,text,boolean,bigint) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.client_class_notices(uuid,bigint[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_class_notices(uuid,bigint[]) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.client_inquiry_messages(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_inquiry_messages(uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.client_send_inquiry_message(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_send_inquiry_message(uuid,text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.client_attendance_notices(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_attendance_notices(uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.client_upsert_attendance_notice(uuid,bigint,int,date,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_upsert_attendance_notice(uuid,bigint,int,date,text,text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.client_delete_attendance_notice(uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_delete_attendance_notice(uuid,bigint) TO anon, authenticated;

-- ── 6. 기존 anon 직접 접근 정책 제거 ──
-- (관리자/선생님 쪽 *_staff 정책은 이미 진짜 Supabase Auth로 보호되고 있어 그대로 둔다)
DROP POLICY IF EXISTS notices_select_anon ON public.notices;
DROP POLICY IF EXISTS notice_target_students_select_anon ON public.notice_target_students;
DROP POLICY IF EXISTS notice_reads_select_anon ON public.notice_reads;
DROP POLICY IF EXISTS notice_reads_insert_anon ON public.notice_reads;
DROP POLICY IF EXISTS notice_comments_select_anon ON public.notice_comments;
DROP POLICY IF EXISTS notice_comments_insert_anon ON public.notice_comments;
DROP POLICY IF EXISTS class_notices_select_anon ON public.class_notices;
DROP POLICY IF EXISTS inquiry_messages_select_anon ON public.inquiry_messages;
DROP POLICY IF EXISTS inquiry_messages_insert_anon ON public.inquiry_messages;
DROP POLICY IF EXISTS attendance_notices_select_anon ON public.attendance_notices;
DROP POLICY IF EXISTS attendance_notices_insert_anon ON public.attendance_notices;
DROP POLICY IF EXISTS attendance_notices_update_anon ON public.attendance_notices;
DROP POLICY IF EXISTS attendance_notices_delete_anon ON public.attendance_notices;

COMMIT;
