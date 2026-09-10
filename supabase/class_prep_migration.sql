-- 반관리 '수업 준비' 기능 — 학생별 오늘의 진도를 미리 입력해두면
-- 1) "오늘의 공부" 안내문(엑셀) 생성에 쓰이고
-- 2) 같은 날짜로 "수업기록 작성"을 열었을 때 아직 저장된 기록이 없는 학생에 한해
--    수업 내용(진도) 칸에 자동으로 미리 채워진다.
-- 순수 관리자용 내부 도구라 anon 접근은 필요 없고 스태프만 읽고 쓸 수 있으면 된다.
-- Supabase 대시보드 > SQL Editor에서 실행하세요

CREATE TABLE IF NOT EXISTS class_prep_progress (
  id bigint generated always as identity primary key,
  student_id bigint not null references students(id) on delete cascade,
  date date not null,
  progress text not null default '',
  prev_homework text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, date)
);

ALTER TABLE class_prep_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS class_prep_progress_staff ON class_prep_progress;
CREATE POLICY class_prep_progress_staff ON class_prep_progress
  FOR ALL TO authenticated USING (is_teacher_or_admin()) WITH CHECK (is_teacher_or_admin());
