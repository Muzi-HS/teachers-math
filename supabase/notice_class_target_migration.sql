-- Supabase SQL Editor에서 실행하세요. 다시 실행해도 안전합니다.
-- 공지사항 작성 시 "반 전체" 대상 지정을 지원한다.
-- 실제 공개 대상은 기존과 동일하게 notice_target_students에 반 소속 학생 전원의 행을 넣어 처리하며
-- (학부모 화면 조회 로직은 전혀 변경할 필요가 없다), 이 컬럼은 공지 편집 화면을 다시 열었을 때
-- "반 전체" 모드와 선택된 반을 그대로 복원해서 보여주기 위한 용도다.
ALTER TABLE public.notices ADD COLUMN IF NOT EXISTS target_class_id bigint REFERENCES public.classes(id) ON DELETE SET NULL;
