-- 태그를 여러 번 하면 등원 알림이 중복으로 가던 문제의 근본 원인.
-- kiosk-checkin 함수가 "오늘 이미 등원 기록이 있는지"를 maybeSingle()로 조회했는데,
-- 이미 중복 행이 여러 개 쌓인 학생에 대해서는 maybeSingle()이 에러를 내면서
-- 중복 체크 자체가 조용히 무력화되어 계속 새 행이 쌓이고 알림도 매번 나갔다.
--
-- 1) 학생/날짜별로 가장 먼저 생긴 행 하나만 남기고 나머지 중복 행을 정리한다.
DELETE FROM student_checkins a USING student_checkins b
WHERE a.student_id = b.student_id
  AND a.date = b.date
  AND a.id > b.id;

-- 2) 앞으로는 DB 레벨에서 같은 학생/같은 날짜 중복 등원 기록 자체가 불가능하도록 강제한다.
--    kiosk-checkin 함수도 이 제약을 이용해 upsert(ignoreDuplicates)로 원자적으로 중복을 막는다.
ALTER TABLE student_checkins ADD CONSTRAINT student_checkins_student_date_key UNIQUE (student_id, date);
