-- parents.pin 기본값을 4자리('0000')로 수정
-- 원인: 학생 등록 시 parent_phone이 있으면 트리거(auto_create_parent)가 parents 테이블에
-- 자동으로 행을 만드는데, pin 컬럼의 DB 기본값이 '000000'(6자리)로 설정돼 있었습니다.
-- 반면 앱 코드(lib/auth.ts)는 기본 PIN을 '0000'(4자리)으로 다루고 있어(parentLookup의
-- pin ?? '0000', isDefaultPin 체크 등) 새로 생성된 학부모 계정은 실제 저장된 PIN('000000')과
-- 앱이 기대하는 기본 PIN('0000')이 달라 로그인이 안 되는 문제가 있었습니다.
-- Supabase 대시보드 > SQL Editor에서 실행하세요

ALTER TABLE parents ALTER COLUMN pin SET DEFAULT '0000';
