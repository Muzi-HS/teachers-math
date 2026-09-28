-- 적용 순서: notices_inquiries_gateway_migration.sql 다음. 반복 실행 가능합니다.
--
-- 배경: notices_inquiries_gateway_migration에서 notice_reads의 anon SELECT/INSERT
-- 정책(notice_reads_select_anon/insert_anon)을 제거했다. 그런데 학부모 화면(헤더 종
-- 아이콘의 "안 읽은 공지" 개수)이 여전히 브라우저에서 anon 키로 notice_reads 테이블을
-- 직접 select하고 있어서, 정책 제거 이후로는 그 조회가 항상 빈 결과만 받아 공지를
-- 읽어도 배지가 절대 사라지지 않는 문제가 있었다. client_mark_notice_read처럼 서버
-- 쪽에서 SECURITY DEFINER로 개수를 계산해 돌려주는 RPC로 바꾼다.
BEGIN;

CREATE OR REPLACE FUNCTION public.client_unread_notice_count(p_token uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_type text; v_parent_id int; v_count int;
BEGIN
  SELECT subject_type, subject_id INTO v_type, v_parent_id
    FROM public.client_sessions WHERE token = p_token AND expires_at > now();
  IF v_type IS DISTINCT FROM 'parent' THEN RETURN 0; END IF;

  SELECT count(*) INTO v_count FROM public.notices n
  WHERE n.parent_visible = true
    AND (
      NOT EXISTS (SELECT 1 FROM public.notice_target_students nts WHERE nts.notice_id = n.id)
      OR EXISTS (
        SELECT 1 FROM public.notice_target_students nts
        WHERE nts.notice_id = n.id AND public.session_owns_student(p_token, nts.student_id)
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.notice_reads nr
      JOIN public.parent_students ps ON ps.student_id = nr.student_id
      WHERE nr.notice_id = n.id AND ps.parent_id = v_parent_id
    );

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.client_unread_notice_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_unread_notice_count(uuid) TO anon, authenticated;

COMMIT;
