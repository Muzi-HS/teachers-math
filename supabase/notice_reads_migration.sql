-- 공지사항 조회수 · 대상 학생별 읽음 표시 기능
-- 학부모가 공지사항 상세를 열람하면, 그 학부모의 자녀(들) 기준으로 이 테이블에 읽음 기록을
-- 남긴다. 관리자 화면에서는 이 값을 모아 조회수를 표시하고, 대상 지정 공지의 학생 이름
-- 칩을 읽음 여부에 따라 색으로 구분한다.
-- Supabase 대시보드 > SQL Editor에서 실행하세요

CREATE TABLE IF NOT EXISTS notice_reads (
  notice_id bigint NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  student_id integer NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notice_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_notice_reads_notice_id ON notice_reads(notice_id);

ALTER TABLE notice_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notice_reads_staff ON notice_reads;
DROP POLICY IF EXISTS notice_reads_select_anon ON notice_reads;
DROP POLICY IF EXISTS notice_reads_insert_anon ON notice_reads;

-- 관리자/선생님/조교 — 전체 조회 (다른 학부모 트래킹 테이블과 동일하게 조회수 집계용)
CREATE POLICY notice_reads_staff ON notice_reads
  FOR ALL TO public USING (is_teacher_or_admin());

-- 학부모(anon) — 다른 학부모 테이블과 동일한 신뢰 기반 정책: 조회는 전체 허용(관리자 화면
-- 집계용), 본인 자녀 읽음 기록 등록(및 중복 upsert)만 가능
CREATE POLICY notice_reads_select_anon ON notice_reads
  FOR SELECT TO anon USING (true);
CREATE POLICY notice_reads_insert_anon ON notice_reads
  FOR INSERT TO anon WITH CHECK (true);
