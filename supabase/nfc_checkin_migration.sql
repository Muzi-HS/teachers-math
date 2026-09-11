-- (더 이상 사용하지 않음) 학생 개인별 NFC 태그 방식은 공용 NFC 카드 + 학부모 로그인 방식으로
-- 대체됐습니다. 이 컬럼을 쓰는 코드가 없으니 정리하고 싶다면 아래를 실행해 제거해도 됩니다.
-- (실행하지 않아도 아무 문제 없습니다 — 그냥 안 쓰는 컬럼으로 남아있을 뿐입니다.)
DROP INDEX IF EXISTS students_nfc_token_key;
ALTER TABLE students DROP COLUMN IF EXISTS nfc_token;
