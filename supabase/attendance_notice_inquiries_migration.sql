-- Run after notices_inquiries_gateway_migration.sql, before deploying.
-- Safe whether or not attendance_notice_replies_migration.sql was already run.
BEGIN;
DROP TRIGGER IF EXISTS guard_attendance_notice_reply ON public.attendance_notices;
DROP FUNCTION IF EXISTS public.guard_attendance_notice_reply();
DROP FUNCTION IF EXISTS public.admin_reply_attendance_notice(bigint, text);
-- Leave any old reply columns/data intact; replies now use inquiry_messages.

CREATE OR REPLACE FUNCTION public.send_attendance_notice_inquiry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_notice public.attendance_notices;
  v_name text;
  v_action text;
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(NEW.student_id, NEW.parent_id, NEW.date, NEW.type, NEW.reason)
    IS NOT DISTINCT FROM ROW(OLD.student_id, OLD.parent_id, OLD.date, OLD.type, OLD.reason) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    v_notice := OLD;
    v_action := '등록 취소';
  ELSE
    v_notice := NEW;
    v_action := CASE WHEN TG_OP = 'INSERT' THEN '등록' ELSE '등록 수정' END;
  END IF;
  -- A parent/account cascade deletion should not recreate its conversation.
  IF NOT EXISTS (SELECT 1 FROM public.parents WHERE id = v_notice.parent_id) THEN
    RETURN NULL;
  END IF;
  SELECT name INTO v_name FROM public.students WHERE id = v_notice.student_id;
  INSERT INTO public.inquiry_messages(parent_id, sender_type, content)
  VALUES (v_notice.parent_id, 'parent',
    format(E'[%s %s]\n학생: %s\n날짜: %s\n구분: %s\n사유: %s',
      CASE WHEN v_notice.type = 'absence' THEN '결석' ELSE '지각' END,
      v_action, coalesce(v_name, '학생'), v_notice.date,
      CASE WHEN v_notice.type = 'absence' THEN '결석' ELSE '지각' END,
      coalesce(nullif(btrim(v_notice.reason), ''), '사유 미입력')));
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.send_attendance_notice_inquiry() FROM PUBLIC;
DROP TRIGGER IF EXISTS send_attendance_notice_inquiry ON public.attendance_notices;
CREATE TRIGGER send_attendance_notice_inquiry AFTER INSERT OR UPDATE OR DELETE ON public.attendance_notices
FOR EACH ROW EXECUTE FUNCTION public.send_attendance_notice_inquiry();
NOTIFY pgrst, 'reload schema';
COMMIT;
