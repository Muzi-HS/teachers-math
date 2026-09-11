-- 학생 개인 NFC 태그(스티커)로 등원 체크인을 하기 위한 토큰 컬럼.
-- 학생마다 고유한 토큰을 발급해 URL(/tag-checkin?t=토큰)에 담아 NFC 스티커에 기록한다.
-- 토큰만으로 학생을 특정할 수 있으므로 충분히 무작위한 값이어야 하고(UUID 사용),
-- RLS 없이도 안전하도록 조회는 서비스 롤을 쓰는 엣지 함수(kiosk-checkin)에서만 한다.
ALTER TABLE students ADD COLUMN IF NOT EXISTS nfc_token text;
CREATE UNIQUE INDEX IF NOT EXISTS students_nfc_token_key ON students (nfc_token) WHERE nfc_token IS NOT NULL;
