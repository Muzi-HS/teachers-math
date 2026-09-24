-- pin_hash_migration.sql에서 실행한 `REVOKE SELECT (pin_hash) ON ... FROM anon`이 실제로는
-- 효과가 없었다. Supabase 프로젝트에는 이미 anon 역할에 parents/students 테이블 전체에 대한
-- 테이블 단위 SELECT 권한(GRANT SELECT ON table TO anon, 컬럼 지정 없음)이 있었는데,
-- PostgreSQL은 "테이블 전체 권한"이 있는 상태에서 컬럼 단위로만 회수할 수는 없다
-- (테이블 단위 권한을 걷어내지 않는 한 모든 컬럼이 여전히 조회 가능하다).
-- 그 결과 pin_hash(bcrypt 해시)가 anon 키만으로 REST API에서 그대로 조회됐다 —
-- 4자리 숫자 PIN은 경우의 수가 10000개뿐이라 해시가 유출되면 사실상 평문 유출과 다름없다.
--
-- 고쳐서: anon의 테이블 단위 SELECT 권한을 완전히 회수하고, pin_hash를 제외한 나머지
-- 컬럼에 대해서만 다시 SELECT 권한을 부여한다(RLS의 "행 접근 가능 여부"는 그대로 유지되고,
-- 이번엔 "어떤 컬럼을 볼 수 있는지"까지 실제로 제한된다).
-- Supabase 대시보드 > SQL Editor에서 실행하세요

REVOKE SELECT ON parents FROM anon;
GRANT SELECT (id, phone, name, created_at) ON parents TO anon;

REVOKE SELECT ON students FROM anon;
GRANT SELECT (id, name, birth_year, school, phone, parent_phone, reg_date, created_at, school_type, school_elementary, school_middle, nfc_token) ON students TO anon;
