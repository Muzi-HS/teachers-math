-- 테스트 자동채점. Supabase SQL Editor에서 실행한 다음 auto_grading_cron.sql을 실행하세요.
begin;

alter table public.tests add column if not exists auto_grading boolean not null default false;
alter table public.tests add column if not exists is_published boolean not null default false;

create table if not exists public.test_questions (
  test_id bigint not null references public.tests(id) on delete cascade,
  number integer not null check (number between 1 and 200),
  points numeric(6,2) not null check (points between 1 and 1000),
  kind text not null check (kind in ('choice', 'text')),
  correct_answer jsonb not null,
  primary key (test_id, number)
);
-- 기존 설치(배점이 integer)에도 소수점 배점을 허용한다. 새 설치에서는 위에서 이미 numeric으로 생성된다.
alter table public.test_questions alter column points type numeric(6,2) using points::numeric(6,2);
create table if not exists public.test_assignees (
  test_id bigint not null references public.tests(id) on delete cascade,
  student_id bigint not null references public.students(id) on delete cascade,
  primary key (test_id, student_id)
);
create table if not exists public.test_attempts (
  id bigint generated always as identity primary key,
  test_id bigint not null references public.tests(id) on delete cascade,
  student_id bigint not null references public.students(id) on delete cascade,
  started_at timestamptz not null default clock_timestamp(),
  deadline_at timestamptz not null default (clock_timestamp() + interval '2 minutes'),
  submitted_at timestamptz,
  answers jsonb not null default '{}'::jsonb,
  revision integer not null default 0,
  cor integer,
  score integer,
  earned_points numeric(8,2),
  total_points numeric(8,2),
  unique (test_id, student_id)
);
alter table public.test_attempts alter column earned_points type numeric(8,2) using earned_points::numeric(8,2);
alter table public.test_attempts alter column total_points type numeric(8,2) using total_points::numeric(8,2);
create index if not exists test_attempts_pending on public.test_attempts(deadline_at) where submitted_at is null;

create or replace function public.is_exam_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.teachers where user_id = auth.uid() and approved = true and role in ('admin','teacher','assistant'));
$$;
revoke all on function public.is_exam_staff() from public, anon;
grant execute on function public.is_exam_staff() to authenticated;

alter table public.test_questions enable row level security;
alter table public.test_assignees enable row level security;
alter table public.test_attempts enable row level security;
revoke all on public.test_questions, public.test_assignees, public.test_attempts from anon, authenticated;
grant select on public.test_questions, public.test_assignees, public.test_attempts to authenticated;
grant all on public.test_questions, public.test_assignees, public.test_attempts to service_role;
drop policy if exists exam_questions_staff on public.test_questions;
create policy exam_questions_staff on public.test_questions for select to authenticated using (public.is_exam_staff());
drop policy if exists exam_assignees_staff on public.test_assignees;
create policy exam_assignees_staff on public.test_assignees for select to authenticated using (public.is_exam_staff());
drop policy if exists exam_attempts_staff on public.test_attempts;
create policy exam_attempts_staff on public.test_attempts for select to authenticated using (public.is_exam_staff());

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
      insert into public.test_questions values(v_id,n,(q->>'points')::numeric,'choice',choices);
    else
      answer := btrim(q->>'text');
      if answer is null or length(answer) = 0 or length(answer) > 500 then raise exception '%번 주관식 정답을 입력하세요 (최대 500자).', n; end if;
      insert into public.test_questions values(v_id,n,(q->>'points')::numeric,'text',to_jsonb(answer));
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

create or replace function public.publish_auto_test(p_id bigint, p_published boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_exam_staff() then raise exception '시험 관리 권한이 없습니다.'; end if;
  perform 1 from public.tests where id = p_id and auto_grading for no key update;
  if not found then raise exception '자동채점 시험을 찾을 수 없습니다.'; end if;
  if p_published and (not exists(select 1 from public.test_assignees where test_id=p_id)
    or (select count(*) from public.test_questions where test_id=p_id) <> (select total from public.tests where id=p_id)) then
    raise exception '문항과 응시 대상을 먼저 설정하세요.';
  end if;
  update public.tests set is_published=p_published where id=p_id;
end $$;
revoke all on function public.publish_auto_test(bigint,boolean) from public, anon;
grant execute on function public.publish_auto_test(bigint,boolean) to authenticated;

-- 이 함수들은 서비스 역할과 DB 스케줄러만 호출한다. 정답을 학생 브라우저에 반환하지 않는다.
create or replace function public.finalize_test_attempt(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare a public.test_attempts; q public.test_questions; answer jsonb; correct boolean;
  v_cor integer := 0; earned numeric(8,2) := 0; total_pts numeric(8,2) := 0; v_score integer;
begin
  select * into a from public.test_attempts where id=p_id for update;
  if not found or a.submitted_at is not null then return; end if;
  for q in select * from public.test_questions where test_id=a.test_id order by number loop
    answer := a.answers->q.number::text;
    correct := false;
    if q.kind='choice' and jsonb_typeof(answer)='array' then
      select coalesce(jsonb_agg(value order by value), '[]'::jsonb) into answer
        from (select distinct value from jsonb_array_elements(answer)) s;
      correct := answer=q.correct_answer;
    elsif q.kind='text' and jsonb_typeof(answer)='string' then
      correct := btrim(answer #>> '{}') = q.correct_answer #>> '{}';
    end if;
    total_pts := total_pts + q.points;
    if correct then v_cor := v_cor+1; earned := earned+q.points; end if;
  end loop;
  v_score := case when total_pts>0 then round(earned::numeric / total_pts * 100)::integer else 0 end;
  update public.test_attempts set submitted_at=least(clock_timestamp(),deadline_at), cor=v_cor,
    score=v_score, earned_points=earned, total_points=total_pts where id=a.id;
  insert into public.test_scores(test_id,student_id,cor,score) values(a.test_id,a.student_id,v_cor,v_score)
    on conflict(test_id,student_id) do update set cor=excluded.cor,score=excluded.score;
  update public.record_test_items i set t_cor=v_cor,t_score=v_score,
    t_total=(select total from public.tests where id=a.test_id)
    from public.records r where i.record_id=r.id and r.student_id=a.student_id and i.test_id=a.test_id;
end $$;

create or replace function public.finalize_expired_tests()
returns void language plpgsql security definer set search_path = public as $$
declare a record;
begin
  for a in select id from public.test_attempts where submitted_at is null and deadline_at<=clock_timestamp() for update skip locked loop
    perform public.finalize_test_attempt(a.id);
  end loop;
end $$;

create or replace function public.student_test_action(
  p_student_id bigint, p_test_id bigint, p_action text, p_answers jsonb default null, p_revision integer default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.test_attempts; t public.tests; q record; answer jsonb; safe_questions jsonb;
begin
  -- 시험 설정 변경과 시작을 같은 행 잠금으로 직렬화한다.
  select * into t from public.tests where id=p_test_id and auto_grading for no key update;
  if not found or not exists(select 1 from public.test_assignees where test_id=p_test_id and student_id=p_student_id) then
    raise exception '응시 대상 시험이 아닙니다.';
  end if;
  if p_action not in ('start','save','submit','status') then raise exception '잘못된 요청입니다.'; end if;
  select * into a from public.test_attempts where test_id=p_test_id and student_id=p_student_id for update;
  if not found then
    if p_action<>'start' or not t.is_published then raise exception '아직 응시할 수 없는 시험입니다.'; end if;
    insert into public.test_attempts(test_id,student_id) values(p_test_id,p_student_id) returning * into a;
  end if;
  if a.submitted_at is null and clock_timestamp() >= a.deadline_at then
    perform public.finalize_test_attempt(a.id);
  elsif a.submitted_at is null and p_action in ('save','submit') then
    if jsonb_typeof(p_answers) is distinct from 'object' or length(p_answers::text)>150000 then raise exception '답안 형식이 올바르지 않습니다.'; end if;
    if p_revision is null or p_revision <> a.revision+1 then
      -- 동일 요청의 재전송은 안전하게 허용한다.
      if p_revision is distinct from a.revision or p_answers is distinct from a.answers then
        raise exception '다른 창에서 답안이 변경되었습니다. 시험을 다시 열어 확인하세요.';
      end if;
    else
      if exists(select 1 from jsonb_object_keys(p_answers) k where not exists(select 1 from public.test_questions where test_id=p_test_id and number::text=k)) then
        raise exception '없는 문항의 답안입니다.';
      end if;
      for q in select * from public.test_questions where test_id=p_test_id loop
        answer := p_answers->q.number::text;
        if answer is null then continue; end if;
        if q.kind='text' then
          if jsonb_typeof(answer)<>'string' or length(answer #>> '{}')>500 then raise exception '주관식 답안을 확인하세요.'; end if;
        else
          if jsonb_typeof(answer)<>'array' then raise exception '객관식 답안을 확인하세요.'; end if;
          if jsonb_array_length(answer)>5 or exists(select 1 from jsonb_array_elements(answer) x where x.value not in ('1'::jsonb,'2'::jsonb,'3'::jsonb,'4'::jsonb,'5'::jsonb)) then raise exception '선택지를 확인하세요.'; end if;
        end if;
      end loop;
      update public.test_attempts set answers=p_answers,revision=p_revision where id=a.id;
    end if;
    if p_action='submit' then perform public.finalize_test_attempt(a.id); end if;
  end if;
  select * into a from public.test_attempts where id=a.id;
  select jsonb_agg(jsonb_build_object('number',number,'points',points,'kind',kind,
    'multiple',case when kind='choice' then jsonb_array_length(correct_answer)>1 else false end) order by number)
    into safe_questions from public.test_questions where test_id=p_test_id;
  return jsonb_build_object('server_now',clock_timestamp(),'attempt',to_jsonb(a),'questions',safe_questions,'name',t.name);
end $$;

create or replace function public.student_test_list(p_student_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pending record; result jsonb;
begin
  -- 변수명이 아래 조회의 test_attempts 별칭(a)과 겹치면 PL/pgSQL이 별칭 대신 이 변수를 참조해
  -- "record has no field" 오류가 나므로 다른 이름을 쓴다.
  for pending in select id from public.test_attempts where student_id=p_student_id and submitted_at is null and deadline_at<=clock_timestamp() loop
    perform public.finalize_test_attempt(pending.id);
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'date',t.date,'total',t.total,
    'is_published',t.is_published,'attempt',case when a.id is null then null else to_jsonb(a) end) order by t.date desc,t.id desc),'[]'::jsonb)
    into result from public.tests t join public.test_assignees s on s.test_id=t.id
    left join public.test_attempts a on a.test_id=t.id and a.student_id=p_student_id
    where s.student_id=p_student_id and t.auto_grading and (t.is_published or a.id is not null);
  return result;
end $$;

revoke all on function public.finalize_test_attempt(bigint), public.finalize_expired_tests(),
  public.student_test_action(bigint,bigint,text,jsonb,integer), public.student_test_list(bigint) from public, anon, authenticated;
grant execute on function public.finalize_test_attempt(bigint), public.finalize_expired_tests(),
  public.student_test_action(bigint,bigint,text,jsonb,integer), public.student_test_list(bigint) to service_role;

-- PIN 검증은 서버에서 수행하고 반복 실패는 DB에 기록한다 (5회 실패 시 5분 대기).
create table if not exists public.test_login_limits (
  student_id bigint primary key references public.students(id) on delete cascade,
  failures integer not null default 0,
  blocked_until timestamptz
);
alter table public.test_login_limits enable row level security;
revoke all on public.test_login_limits from anon, authenticated;
create or replace function public.verify_test_student(p_student_id bigint, p_pin text)
returns boolean language plpgsql security definer set search_path = public as $$
declare lim public.test_login_limits; expected text;
begin
  select coalesce(pin,'0000') into expected from public.students where id=p_student_id;
  if not found then return false; end if;
  insert into public.test_login_limits(student_id) values(p_student_id) on conflict do nothing;
  select * into lim from public.test_login_limits where student_id=p_student_id for update;
  if lim.blocked_until>clock_timestamp() then return false; end if;
  if lim.blocked_until is not null then lim.failures:=0; end if;
  if p_pin=expected and p_pin ~ '^[0-9]{4}$' then
    update public.test_login_limits set failures=0,blocked_until=null where student_id=p_student_id;
    return true;
  end if;
  update public.test_login_limits set failures=lim.failures+1,
    blocked_until=case when lim.failures+1>=5 then clock_timestamp()+interval '5 minutes' else null end where student_id=p_student_id;
  return false;
end $$;
revoke all on function public.verify_test_student(bigint,text) from public, anon, authenticated;
grant execute on function public.verify_test_student(bigint,text) to service_role;

-- 기존 테이블에 넓은 쓰기 정책이 있더라도 자동채점 성적과 시험 설정은 전용 함수로만 변경한다.
create or replace function public.guard_auto_test_score() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon','authenticated') and exists(select 1 from public.tests where id in (new.test_id,old.test_id) and auto_grading) then
    raise exception '자동채점 성적은 직접 수정하거나 삭제할 수 없습니다.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists guard_auto_test_score on public.test_scores;
create trigger guard_auto_test_score before insert or update or delete on public.test_scores for each row execute function public.guard_auto_test_score();

create or replace function public.guard_auto_test_definition() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.auto_grading or old.auto_grading) and current_user in ('anon','authenticated') then
    raise exception '자동채점 시험 설정은 시험 편집/공개 기능을 이용하세요.';
  end if;
  if tg_op='UPDATE' and exists(select 1 from public.test_attempts where test_id=old.id)
    and (new.total is distinct from old.total or new.auto_grading is distinct from old.auto_grading) then
    raise exception '응시가 시작된 시험의 문항 수와 채점 방식은 변경할 수 없습니다.';
  end if;
  return new;
end $$;
drop trigger if exists guard_auto_test_definition on public.tests;
create trigger guard_auto_test_definition before insert or update on public.tests for each row execute function public.guard_auto_test_definition();

create or replace function public.fill_auto_test_record_score() returns trigger
language plpgsql security definer set search_path = public as $$
declare s record;
begin
  if exists(select 1 from public.tests where id=new.test_id and auto_grading) then
    select sc.cor,sc.score,t.total into s from public.test_scores sc
      join public.tests t on t.id=sc.test_id join public.records r on r.student_id=sc.student_id
      where r.id=new.record_id and sc.test_id=new.test_id;
    if not found then raise exception '학생 답안 제출 후 수업기록에 시험을 추가하세요.'; end if;
    new.t_cor:=s.cor; new.t_score:=s.score; new.t_total:=s.total;
  end if;
  return new;
end $$;
drop trigger if exists fill_auto_test_record_score on public.record_test_items;
create trigger fill_auto_test_record_score before insert or update on public.record_test_items for each row execute function public.fill_auto_test_record_score();
commit;
