-- 수업기록의 "학부모 노출 여부"를 "푸시 발송 성공 여부(push_sent)"와 분리한다.
-- 지금까지는 학부모 화면이 push_sent = true인 기록만 보여줬는데, 그러면 학부모가
-- 알림을 허용하지 않았거나(FCM 토큰 없음) 일시적으로 발송이 실패한 경우 그 학생의
-- 수업기록을 영원히 볼 수 없게 되는 문제가 있었다.
-- 이제는 관리자가 "발송" 버튼을 누른 시점(실제 푸시 성공 여부와 무관)에
-- released_to_parent를 true로 남기고, 학부모 화면은 이 컬럼만 확인한다.
-- push_sent/push_sent_at은 기존처럼 "미발송 N건" 집계와 개별 발송 버튼 노출 등
-- 실제 알림 전달 성공 여부를 추적하는 용도로 그대로 유지된다.
-- Supabase 대시보드 > SQL Editor에서 실행하세요

ALTER TABLE records ADD COLUMN IF NOT EXISTS released_to_parent boolean NOT NULL DEFAULT false;

-- 기존에 작성 완료(초안 아님)된 기록은 발송 성공 여부와 무관하게 전부 공개 처리한다.
-- 그동안 알림 미등록/실패로 학부모에게 안 보이던 기록들도 이번에 한 번에 노출시킨다.
UPDATE records SET released_to_parent = true WHERE is_draft = false AND released_to_parent = false;
