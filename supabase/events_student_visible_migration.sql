-- 학원일정 "일정 추가"에서 일반 일정 등록 시 학부모/학생을 각각 독립적으로 공개 대상으로
-- 고를 수 있게 한다. 기존에는 parent_visible 한 컬럼이 학부모/학생 화면(AcademyEventsView)
-- 양쪽 노출을 동시에 결정했는데, 이제 학생 쪽을 별도 컬럼으로 분리한다.
-- 기존 행은 지금까지와 동일하게 보이도록 parent_visible 값을 그대로 이어받는다.
ALTER TABLE events ADD COLUMN IF NOT EXISTS student_visible boolean NOT NULL DEFAULT true;
UPDATE events SET student_visible = parent_visible WHERE student_visible IS DISTINCT FROM parent_visible;

-- anon(학생 세션 포함) SELECT 정책이 parent_visible = true인 행만 허용하고 있었다.
-- student_visible이 별도 컬럼으로 분리된 이상, student_visible = true인 행도 anon이
-- 읽을 수 있어야 학생 화면에 노출된다(개별 필터링은 클라이언트의 .eq()가 담당).
DROP POLICY IF EXISTS events_select_anon ON public.events;
CREATE POLICY events_select_anon ON public.events FOR SELECT TO anon
  USING (parent_visible = true OR student_visible = true);
