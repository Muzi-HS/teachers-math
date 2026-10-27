-- Run before deploying the four-option lesson attendance UI.
-- Re-run on existing installations to expose attendance_status in staff_records.
BEGIN;
ALTER TABLE public.records ADD COLUMN IF NOT EXISTS attendance_status text;
UPDATE public.records SET attendance_status = CASE WHEN late THEN 'late' ELSE 'on_time' END
WHERE attendance_status IS NULL;
ALTER TABLE public.records ALTER COLUMN attendance_status SET NOT NULL;
ALTER TABLE public.records DROP CONSTRAINT IF EXISTS records_attendance_status_check;
ALTER TABLE public.records ADD CONSTRAINT records_attendance_status_check
  CHECK (attendance_status IN ('on_time', 'late', 'absence', 'early_leave'));

-- Keep older clients that only write late compatible with the new status.
CREATE OR REPLACE FUNCTION public.sync_record_attendance_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.attendance_status IS NULL THEN
    NEW.attendance_status := CASE WHEN NEW.late THEN 'late' ELSE 'on_time' END;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.attendance_status IS NOT DISTINCT FROM OLD.attendance_status
       AND NEW.late IS DISTINCT FROM OLD.late THEN
      NEW.attendance_status := CASE WHEN NEW.late THEN 'late' ELSE 'on_time' END;
    END IF;
  END IF;
  NEW.late := NEW.attendance_status = 'late';
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_record_attendance_status() FROM PUBLIC;
DROP TRIGGER IF EXISTS sync_record_attendance_status ON public.records;
CREATE TRIGGER sync_record_attendance_status BEFORE INSERT OR UPDATE ON public.records
FOR EACH ROW EXECUTE FUNCTION public.sync_record_attendance_status();

-- Views expand their column list when created, so refresh an existing staff view
-- after adding attendance_status. Keep per-account read receipts and source RLS.
DO $$
DECLARE columns_sql text;
BEGIN
  IF to_regclass('public.staff_records') IS NOT NULL THEN
    SELECT string_agg(CASE WHEN attname = 'parent_comment_read_at'
      THEN 'receipt.read_at AS parent_comment_read_at' ELSE format('source.%I', attname) END, ', ' ORDER BY attnum)
    INTO columns_sql FROM pg_attribute
    WHERE attrelid = 'public.records'::regclass AND attnum > 0 AND NOT attisdropped;
    EXECUTE format('CREATE OR REPLACE VIEW public.staff_records WITH (security_invoker = true) AS SELECT %s FROM public.records source LEFT JOIN public.records_staff_reads receipt ON receipt.record_id = source.id AND receipt.user_id = auth.uid()', columns_sql);
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
