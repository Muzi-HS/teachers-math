-- 앱의 공지 저장 RPC 전환을 배포하기 전에 전체 실행하세요.
-- 기존 테이블/읽기 정책은 유지하며 함수만 추가합니다. 반복 실행 가능합니다.
-- 학부모 소유권 RLS는 별도 작업입니다. 이 SQL은 공지 저장의 부분 실패를 방지합니다.
BEGIN;
CREATE OR REPLACE FUNCTION public.save_notice_with_targets(
  p_notice_id bigint,
  p_title text,
  p_content text,
  p_pinned boolean,
  p_target_mode text,
  p_student_ids bigint[]
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id bigint;
  v_ids bigint[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.teachers t
    WHERE t.user_id = auth.uid() AND t.role = 'admin' AND t.approved = true) THEN
    RAISE EXCEPTION '승인된 관리자만 공지를 저장할 수 있습니다.' USING ERRCODE = '42501';
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION '제목을 입력하세요.';
  END IF;
  IF p_target_mode IS NULL OR p_target_mode NOT IN ('all','selected') THEN
    RAISE EXCEPTION '공지 대상을 확인하세요.';
  END IF;
  IF p_target_mode = 'selected' THEN
    IF coalesce(cardinality(p_student_ids),0) = 0 OR EXISTS (
      SELECT 1 FROM unnest(p_student_ids) AS x(id) WHERE id IS NULL OR id <= 0
    ) THEN
      RAISE EXCEPTION '대상 학생을 한 명 이상 선택하세요.';
    END IF;
    SELECT array_agg(DISTINCT id ORDER BY id) INTO v_ids FROM unnest(p_student_ids) AS x(id);
    -- 저장 중 학생이 삭제되는 경우에도 대상만 사라진 공지를 남기지 않는다.
    PERFORM 1 FROM public.students WHERE id = ANY(v_ids) ORDER BY id FOR KEY SHARE;
    IF (SELECT count(*) FROM public.students WHERE id = ANY(v_ids)) <> cardinality(v_ids) THEN
      RAISE EXCEPTION '삭제되었거나 존재하지 않는 학생이 있습니다. 대상 목록을 새로 확인하세요.';
    END IF;
  ELSE
    v_ids := ARRAY[]::bigint[];
  END IF;

  IF p_notice_id IS NULL THEN
    INSERT INTO public.notices(title,content,pinned,parent_visible,created_by,created_at)
      VALUES(p_title,coalesce(p_content,''),coalesce(p_pinned,false),true,auth.uid(),now())
      RETURNING id INTO v_id;
  ELSE
    UPDATE public.notices SET title = p_title, content = coalesce(p_content,''),
      pinned = coalesce(p_pinned,false), parent_visible = true
      WHERE id = p_notice_id RETURNING id INTO v_id;
    IF NOT FOUND THEN RAISE EXCEPTION '삭제된 공지입니다. 목록을 새로고침하세요.'; END IF;
  END IF;

  DELETE FROM public.notice_target_students WHERE notice_id = v_id;
  INSERT INTO public.notice_target_students(notice_id,student_id)
    SELECT v_id, id FROM unnest(v_ids) AS x(id);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.save_notice_with_targets(bigint,text,text,boolean,text,bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_notice_with_targets(bigint,text,text,boolean,text,bigint[]) TO authenticated;
COMMIT;
