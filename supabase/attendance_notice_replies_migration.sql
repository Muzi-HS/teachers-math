-- Run after notices_inquiries_gateway_migration.sql, before deploying the reply UI.
BEGIN;
ALTER TABLE public.attendance_notices
  ADD COLUMN IF NOT EXISTS admin_reply text,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz;

-- Parent edits require a fresh reply. Only approved administrators can change replies.
CREATE OR REPLACE FUNCTION public.guard_attendance_notice_reply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.admin_reply IS NOT NULL OR NEW.replied_at IS NOT NULL THEN
      RAISE EXCEPTION '답변은 기존 신청에만 등록할 수 있습니다.' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF ROW(NEW.student_id, NEW.parent_id, NEW.date, NEW.type, NEW.reason)
      IS DISTINCT FROM ROW(OLD.student_id, OLD.parent_id, OLD.date, OLD.type, OLD.reason) THEN
      NEW.admin_reply := NULL;
      NEW.replied_at := NULL;
    ELSIF ROW(NEW.admin_reply, NEW.replied_at) IS DISTINCT FROM ROW(OLD.admin_reply, OLD.replied_at) THEN
      IF NOT EXISTS (SELECT 1 FROM public.teachers WHERE user_id = auth.uid() AND role = 'admin' AND approved = true) THEN
        RAISE EXCEPTION '관리자만 답변할 수 있습니다.' USING ERRCODE = '42501';
      END IF;
      IF NEW.admin_reply IS NULL OR length(btrim(NEW.admin_reply)) NOT BETWEEN 1 AND 1000 THEN
        RAISE EXCEPTION '답변은 1~1000자로 입력해주세요.';
      END IF;
      NEW.admin_reply := btrim(NEW.admin_reply);
      NEW.replied_at := now();
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_attendance_notice_reply() FROM PUBLIC;
DROP TRIGGER IF EXISTS guard_attendance_notice_reply ON public.attendance_notices;
CREATE TRIGGER guard_attendance_notice_reply BEFORE INSERT OR UPDATE ON public.attendance_notices
FOR EACH ROW EXECUTE FUNCTION public.guard_attendance_notice_reply();

CREATE OR REPLACE FUNCTION public.admin_reply_attendance_notice(p_id bigint, p_reply text)
RETURNS public.attendance_notices
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.attendance_notices;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.teachers WHERE user_id = auth.uid() AND role = 'admin' AND approved = true) THEN
    RAISE EXCEPTION '관리자만 답변할 수 있습니다.' USING ERRCODE = '42501';
  END IF;
  IF p_reply IS NULL OR length(btrim(p_reply)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION '답변은 1~1000자로 입력해주세요.';
  END IF;
  UPDATE public.attendance_notices SET admin_reply = btrim(p_reply), replied_at = clock_timestamp()
    WHERE id = p_id RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION '신청 내역을 찾을 수 없습니다.'; END IF;
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.admin_reply_attendance_notice(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reply_attendance_notice(bigint, text) TO authenticated;
-- client_attendance_notices returns the table row type, including the new reply fields.
NOTIFY pgrst, 'reload schema';
COMMIT;
