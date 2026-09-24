-- 자주 조회되는데 인덱스가 없던 컬럼들에 인덱스를 추가한다. 기능/화면 변화는 전혀 없고
-- 조회 속도만 개선되는 순수 성능 작업이다. 코드에서 실제로 쓰이는 필터 패턴을 확인하고
-- 골랐다(추측성 인덱스 없음):
--   - students.phone: 학부모/학생 로그인 시 매번 조회(parents.phone엔 이미 유니크 인덱스가
--     있었는데 students만 빠져 있었다)
--   - records.student_id / records.date: 대시보드·수업기록·학부모 화면이 전부 이 두 컬럼으로
--     필터링하는데 정작 인덱스가 없어 데이터가 쌓일수록 느려지는 구조였다
--   - class_students.student_id / parent_students.student_id: 복합 PK가 반대 순서
--     (class_id, student_id) / (parent_id, student_id)라 "학생 기준으로 반/학부모 찾기"
--     조회에는 못 쓰인다
-- Supabase 대시보드 > SQL Editor에서 실행하세요

-- 실제 데이터에 형제가 번호를 공유하는 등 phone 중복 사례가 있어(UNIQUE 제약을 걸면
-- 마이그레이션이 실패한다) 일반 인덱스로만 추가한다. 조회 속도 개선 목적은 동일하게 달성된다.
CREATE INDEX IF NOT EXISTS idx_students_phone ON students(phone) WHERE phone IS NOT NULL AND phone <> '';

CREATE INDEX IF NOT EXISTS idx_records_student_id_date ON records(student_id, date);
CREATE INDEX IF NOT EXISTS idx_records_date ON records(date);

CREATE INDEX IF NOT EXISTS idx_class_students_student_id ON class_students(student_id);
CREATE INDEX IF NOT EXISTS idx_parent_students_student_id ON parent_students(student_id);
