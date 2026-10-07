BEGIN;
ALTER TABLE public.test_questions ADD COLUMN IF NOT EXISTS award_all boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS public.test_grading_corrections (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 test_id bigint NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
 actor uuid, reason text NOT NULL, previous_questions jsonb NOT NULL,
 next_questions jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), reverted_at timestamptz
);
ALTER TABLE public.test_grading_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.test_grading_corrections FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.test_grading_corrections TO authenticated;
DROP POLICY IF EXISTS grading_corrections_staff ON public.test_grading_corrections;
CREATE POLICY grading_corrections_staff ON public.test_grading_corrections FOR SELECT TO authenticated USING (public.is_exam_staff());

CREATE OR REPLACE FUNCTION public.test_grading_snapshot(p_test_id bigint) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('number',number,'points',points,'kind',kind,'correct_answer',correct_answer,'award_all',award_all) ORDER BY number),'[]'::jsonb)
 FROM public.test_questions WHERE test_id=p_test_id;
$$;
REVOKE ALL ON FUNCTION public.test_grading_snapshot(bigint) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.recalculate_test_results(p_test_id bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a public.test_attempts; q public.test_questions; answer jsonb; ok boolean; earned numeric; total_pts numeric; n integer; sc integer;
BEGIN
 FOR a IN SELECT * FROM public.test_attempts WHERE test_id=p_test_id AND submitted_at IS NOT NULL ORDER BY id FOR UPDATE LOOP
  earned:=0; total_pts:=0; n:=0;
  FOR q IN SELECT * FROM public.test_questions WHERE test_id=p_test_id ORDER BY number LOOP
   answer:=a.answers->q.number::text; ok:=q.award_all;
   IF NOT ok AND q.kind='choice' AND jsonb_typeof(answer)='array' THEN
    SELECT coalesce(jsonb_agg(value ORDER BY value),'[]'::jsonb) INTO answer FROM (SELECT DISTINCT value FROM jsonb_array_elements(answer)) x;
    ok:=answer=q.correct_answer;
   ELSIF NOT ok AND q.kind='text' AND jsonb_typeof(answer)='string' THEN
    ok:=btrim(answer #>> '{}')=q.correct_answer #>> '{}';
   END IF;
   total_pts:=total_pts+q.points;
   IF ok THEN earned:=earned+q.points; n:=n+1; END IF;
  END LOOP;
  sc:=CASE WHEN total_pts>0 THEN round(earned/total_pts*100)::integer ELSE 0 END;
  UPDATE public.test_attempts SET cor=n,score=sc,earned_points=earned,total_points=total_pts WHERE id=a.id;
  INSERT INTO public.test_scores(test_id,student_id,correct,score) VALUES(p_test_id,a.student_id,n,sc)
   ON CONFLICT(test_id,student_id) DO UPDATE SET correct=excluded.correct,score=excluded.score;
  UPDATE public.record_test_items i SET t_cor=n,t_score=sc,t_total=(SELECT t.total FROM public.tests t WHERE t.id=p_test_id)
   FROM public.records r WHERE i.record_id=r.id AND r.student_id=a.student_id AND i.test_id=p_test_id;
 END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.recalculate_test_results(bigint) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_test_correction_data(p_test_id bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE qs jsonb;
BEGIN
 IF NOT public.is_exam_staff() THEN RAISE EXCEPTION '시험 관리 권한이 없습니다.'; END IF;
 qs:=public.test_grading_snapshot(p_test_id);
 RETURN jsonb_build_object('questions',qs,'version',md5(qs::text),
  'attempts',(SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) FROM public.test_attempts a WHERE test_id=p_test_id AND submitted_at IS NOT NULL),
  'history',(SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY id DESC),'[]'::jsonb) FROM public.test_grading_corrections h WHERE test_id=p_test_id));
END;
$$;
REVOKE ALL ON FUNCTION public.get_test_correction_data(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_test_correction_data(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_test_correction(p_test_id bigint,p_questions jsonb,p_reason text,p_version text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE old_q jsonb; new_q jsonb; q jsonb; choices jsonb; answer text; v_id bigint; seen integer[]:=ARRAY[]::integer[]; num integer;
BEGIN
 IF NOT public.is_exam_staff() THEN RAISE EXCEPTION '시험 관리 권한이 없습니다.'; END IF;
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION '정정 사유를 입력하세요 (최대 500자).'; END IF;
 PERFORM 1 FROM public.tests WHERE id=p_test_id AND auto_grading FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '자동채점 시험을 찾을 수 없습니다.'; END IF;
 PERFORM id FROM public.test_attempts WHERE test_id=p_test_id ORDER BY id FOR UPDATE;
 old_q:=public.test_grading_snapshot(p_test_id);
 IF md5(old_q::text) IS DISTINCT FROM p_version THEN RAISE EXCEPTION '채점 기준이 변경되었습니다. 다시 불러오세요.'; END IF;
 IF jsonb_typeof(p_questions) IS DISTINCT FROM 'array' OR jsonb_array_length(p_questions)<>jsonb_array_length(old_q) THEN RAISE EXCEPTION '문항 수를 변경할 수 없습니다.'; END IF;
 FOR q IN SELECT value FROM jsonb_array_elements(p_questions) LOOP
  num:=(q->>'number')::integer;
  IF num IS NULL OR num=ANY(seen) OR NOT EXISTS(SELECT 1 FROM public.test_questions WHERE test_id=p_test_id AND number=num) THEN RAISE EXCEPTION '문항 번호를 확인하세요.'; END IF;
  seen:=array_append(seen,num);
  IF (q->>'points') IS NULL OR (q->>'points') !~ '^[0-9]+(\.[0-9]{1,2})?$' OR (q->>'points')::numeric NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION '배점은 1~1000, 소수 둘째 자리까지 입력하세요.'; END IF;
  IF q->>'kind'='choice' THEN
   IF jsonb_typeof(q->'correct_answer') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION '객관식 정답을 확인하세요.'; END IF;
   IF jsonb_array_length(q->'correct_answer') NOT BETWEEN 1 AND 5 OR EXISTS(SELECT 1 FROM jsonb_array_elements(q->'correct_answer') x WHERE x.value NOT IN ('1'::jsonb,'2'::jsonb,'3'::jsonb,'4'::jsonb,'5'::jsonb)) THEN RAISE EXCEPTION '객관식 정답은 1~5입니다.'; END IF;
   SELECT jsonb_agg(value ORDER BY value) INTO choices FROM (SELECT DISTINCT value FROM jsonb_array_elements(q->'correct_answer')) x;
  ELSIF q->>'kind'='text' THEN
   IF jsonb_typeof(q->'correct_answer') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION '주관식 정답을 확인하세요.'; END IF;
   answer:=btrim(q->>'correct_answer');
   IF length(answer) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION '주관식 정답을 입력하세요.'; END IF;
   choices:=to_jsonb(answer);
  ELSE RAISE EXCEPTION '문항 형식을 확인하세요.';
  END IF;
  UPDATE public.test_questions SET points=(q->>'points')::numeric,kind=q->>'kind',correct_answer=choices,award_all=coalesce((q->>'award_all')::boolean,false)
   WHERE test_id=p_test_id AND number=num;
 END LOOP;
 new_q:=public.test_grading_snapshot(p_test_id);
 IF old_q=new_q THEN RAISE EXCEPTION '변경된 채점 기준이 없습니다.'; END IF;
 INSERT INTO public.test_grading_corrections(test_id,actor,reason,previous_questions,next_questions) VALUES(p_test_id,auth.uid(),btrim(p_reason),old_q,new_q) RETURNING id INTO v_id;
 PERFORM public.recalculate_test_results(p_test_id);
 RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_test_correction(bigint,jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_test_correction(bigint,jsonb,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.undo_test_correction(p_id bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE h public.test_grading_corrections; q jsonb;
BEGIN
 IF NOT public.is_exam_staff() THEN RAISE EXCEPTION '시험 관리 권한이 없습니다.'; END IF;
 SELECT * INTO h FROM public.test_grading_corrections WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION '정정 이력이 없습니다.'; END IF;
 PERFORM 1 FROM public.tests WHERE id=h.test_id FOR UPDATE;
 PERFORM id FROM public.test_attempts WHERE test_id=h.test_id ORDER BY id FOR UPDATE;
 SELECT * INTO h FROM public.test_grading_corrections WHERE id=p_id FOR UPDATE;
 IF h.reverted_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.test_grading_corrections WHERE test_id=h.test_id AND id>h.id AND reverted_at IS NULL) THEN RAISE EXCEPTION '가장 최근 정정부터 되돌려 주세요.'; END IF;
 IF public.test_grading_snapshot(h.test_id)<>h.next_questions THEN RAISE EXCEPTION '채점 기준이 변경되어 되돌릴 수 없습니다.'; END IF;
 FOR q IN SELECT value FROM jsonb_array_elements(h.previous_questions) LOOP
  UPDATE public.test_questions SET points=(q->>'points')::numeric,kind=q->>'kind',correct_answer=q->'correct_answer',award_all=(q->>'award_all')::boolean
   WHERE test_id=h.test_id AND number=(q->>'number')::integer;
 END LOOP;
 UPDATE public.test_grading_corrections SET reverted_at=now() WHERE id=h.id;
 PERFORM public.recalculate_test_results(h.test_id);
END;
$$;
REVOKE ALL ON FUNCTION public.undo_test_correction(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_test_correction(bigint) TO authenticated;

create or replace function public.save_auto_test(
  p_id bigint, p_name text, p_date date, p_total integer, p_auto boolean,
  p_published boolean, p_questions jsonb, p_students bigint[]
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; q jsonb; n integer := 0; choices jsonb; answer text;
begin
  if not public.is_exam_staff() then raise exception '시험 관리 권한이 없습니다.'; end if;
  if p_name is null or length(btrim(p_name)) = 0 or p_date is null or p_total is null or p_total not between 1 and 200 or p_auto is null or p_published is null then
    raise exception '시험명, 날짜, 문항 수(1~200)를 확인하세요.';
  end if;
  if p_id is not null then
    perform 1 from public.tests where id = p_id for no key update;
    if not found then raise exception '시험을 찾을 수 없습니다.'; end if;
    if exists(select 1 from public.test_attempts where test_id = p_id) then
      raise exception '응시가 시작된 시험은 문항과 대상을 변경할 수 없습니다. 새 시험을 만들어 주세요.';
    end if;
    if p_auto and exists(select 1 from public.test_scores where test_id = p_id) then
      raise exception '기존 성적이 있는 시험은 자동채점으로 전환할 수 없습니다.';
    end if;
    v_id := p_id;
    update public.tests set name = btrim(p_name), date = p_date, total = p_total,
      auto_grading = p_auto, is_published = p_auto and p_published where id = v_id;
  else
    insert into public.tests(name,date,total,auto_grading,is_published)
      values(btrim(p_name),p_date,p_total,p_auto,p_auto and p_published) returning id into v_id;
  end if;
  delete from public.test_questions where test_id = v_id;
  delete from public.test_assignees where test_id = v_id;
  if not p_auto then return v_id; end if;
  if jsonb_typeof(p_questions) is distinct from 'array' or jsonb_array_length(p_questions) <> p_total then
    raise exception '모든 문항의 배점과 정답을 입력하세요.';
  end if;
  for q in select value from jsonb_array_elements(p_questions) loop
    n := n + 1;
    if (q->>'points') is null or (q->>'points') !~ '^[0-9]+(\.[0-9]{1,2})?$' or (q->>'points')::numeric not between 1 and 1000 then
      raise exception '%번 문항의 배점을 확인하세요.', n;
    end if;
    if jsonb_typeof(q->'choices') is distinct from 'array' then raise exception '객관식 선택지를 확인하세요.'; end if;
    if jsonb_array_length(q->'choices') > 0 then
      if exists(select 1 from jsonb_array_elements(q->'choices') x where x.value not in ('1'::jsonb,'2'::jsonb,'3'::jsonb,'4'::jsonb,'5'::jsonb)) then
        raise exception '객관식 정답은 1~5 중에서 선택하세요.';
      end if;
      select jsonb_agg(value order by value) into choices from (select distinct value from jsonb_array_elements(q->'choices')) s;
      insert into public.test_questions(test_id,number,points,kind,correct_answer) values(v_id,n,(q->>'points')::numeric,'choice',choices);
    else
      answer := btrim(q->>'text');
      if answer is null or length(answer) = 0 or length(answer) > 500 then raise exception '%번 주관식 정답을 입력하세요 (최대 500자).', n; end if;
      insert into public.test_questions(test_id,number,points,kind,correct_answer) values(v_id,n,(q->>'points')::numeric,'text',to_jsonb(answer));
    end if;
  end loop;
  insert into public.test_assignees(test_id,student_id) select v_id, unnest(p_students) on conflict do nothing;
  if p_published and not exists(select 1 from public.test_assignees where test_id = v_id) then
    raise exception '공개하려면 응시 학생을 추가하세요.';
  end if;
  return v_id;
end $$;
revoke all on function public.save_auto_test(bigint,text,date,integer,boolean,boolean,jsonb,bigint[]) from public, anon;
grant execute on function public.save_auto_test(bigint,text,date,integer,boolean,boolean,jsonb,bigint[]) to authenticated;


create or replace function public.finalize_test_attempt(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare a public.test_attempts; q public.test_questions; answer jsonb; correct boolean;
  v_cor integer := 0; earned numeric(8,2) := 0; total_pts numeric(8,2) := 0; v_score integer;
begin
  select * into a from public.test_attempts where id=p_id for update;
  if not found or a.submitted_at is not null then return; end if;
  for q in select * from public.test_questions where test_id=a.test_id order by number loop
    answer := a.answers->q.number::text;
    correct := q.award_all;
    if not correct and q.kind='choice' and jsonb_typeof(answer)='array' then
      select coalesce(jsonb_agg(value order by value), '[]'::jsonb) into answer
        from (select distinct value from jsonb_array_elements(answer)) s;
      correct := answer=q.correct_answer;
    elsif not correct and q.kind='text' and jsonb_typeof(answer)='string' then
      correct := btrim(answer #>> '{}') = q.correct_answer #>> '{}';
    end if;
    total_pts := total_pts + q.points;
    if correct then v_cor := v_cor+1; earned := earned+q.points; end if;
  end loop;
  v_score := case when total_pts>0 then round(earned::numeric / total_pts * 100)::integer else 0 end;
  update public.test_attempts set submitted_at=least(clock_timestamp(),deadline_at), cor=v_cor,
    score=v_score, earned_points=earned, total_points=total_pts where id=a.id;
  -- 기존 test_scores의 정답 수 컬럼명은 cor가 아니라 correct다.
  insert into public.test_scores(test_id,student_id,correct,score) values(a.test_id,a.student_id,v_cor,v_score)
    on conflict(test_id,student_id) do update set correct=excluded.correct,score=excluded.score;
  update public.record_test_items i set t_cor=v_cor,t_score=v_score,
    t_total=(select total from public.tests where id=a.test_id)
    from public.records r where i.record_id=r.id and r.student_id=a.student_id and i.test_id=a.test_id;
end $$;


CREATE OR REPLACE FUNCTION public.student_test_review(p_student_id bigint, p_test_id bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE review jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.test_attempts a
    JOIN public.test_assignees s ON s.test_id = a.test_id AND s.student_id = a.student_id
    WHERE a.test_id = p_test_id AND a.student_id = p_student_id AND a.submitted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION '제출한 시험만 정오표를 볼 수 있습니다.';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'number', q.number,
    'correct_answer', q.correct_answer,
    'award_all', q.award_all,
    'correct_count', stats.correct_count,
    'submitted_count', stats.submitted_count,
    'correct_rate', CASE WHEN stats.submitted_count = 0 THEN 0
      ELSE round(stats.correct_count::numeric * 100 / stats.submitted_count)::integer END
  ) ORDER BY q.number), '[]'::jsonb)
  INTO review
  FROM public.test_questions q
  CROSS JOIN LATERAL (
    SELECT count(*)::integer AS submitted_count,
      count(*) FILTER (WHERE
        CASE
          WHEN q.award_all THEN true
          WHEN q.kind = 'choice' AND jsonb_typeof(a.answers->q.number::text) = 'array' THEN
            COALESCE((SELECT jsonb_agg(choice.value ORDER BY choice.value)
              FROM (SELECT DISTINCT value FROM jsonb_array_elements(a.answers->q.number::text)) AS choice), '[]'::jsonb)
              = q.correct_answer
          WHEN q.kind = 'text' AND jsonb_typeof(a.answers->q.number::text) = 'string' THEN
            btrim(a.answers->>q.number::text) = q.correct_answer #>> '{}'
          ELSE false
        END
      )::integer AS correct_count
    FROM public.test_attempts a
    WHERE a.test_id = p_test_id AND a.submitted_at IS NOT NULL
  ) stats
  WHERE q.test_id = p_test_id;
  RETURN review;
END;
$$;
REVOKE ALL ON FUNCTION public.student_test_review(bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.student_test_review(bigint, bigint) TO service_role;

COMMIT;
