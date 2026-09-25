-- Apply AFTER pin_hash_migration.sql and pin_verify_ambiguous_fix.sql.
-- Replaces functions only: preserves hashes, default PIN 0000, arguments and result shapes.
-- Do not rerun old PIN migrations after this patch. Safe to apply before the app update.
BEGIN;

CREATE OR REPLACE FUNCTION public.verify_parent_pin(p_phone text, p_pin text)
RETURNS TABLE(parent_id int, phone text, is_default_pin boolean, children jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_phone text := regexp_replace(p_phone, '[-\s]', '', 'g');
  v_id int;
  v_hash text;
BEGIN
  SELECT p.id, p.pin_hash INTO v_id, v_hash FROM parents p WHERE p.phone = v_phone;
  IF v_id IS NULL THEN
    RAISE EXCEPTION '등록되지 않은 전화번호입니다. 담당 선생님에게 문의하세요.';
  END IF;
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' OR crypt(p_pin, v_hash) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'PIN이 올바르지 않습니다.';
  END IF;
  RETURN QUERY
    SELECT v_id, v_phone, (crypt('0000', v_hash) = v_hash),
      COALESCE(
        jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'birth_year', s.birth_year, 'school', s.school))
          FILTER (WHERE s.id IS NOT NULL),
        '[]'::jsonb
      )
    FROM parent_students ps JOIN students s ON s.id = ps.student_id
    WHERE ps.parent_id = v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_parent_pin(p_parent_id int, p_old_pin text, p_new_pin text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_hash text;
BEGIN
  IF p_new_pin IS NULL OR p_new_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'PIN은 4자리 숫자여야 합니다.';
  END IF;
  SELECT pin_hash INTO v_hash FROM parents WHERE id = p_parent_id;
  IF v_hash IS NULL THEN
    RAISE EXCEPTION '계정을 찾을 수 없습니다.';
  END IF;
  IF p_old_pin IS NULL OR p_old_pin !~ '^[0-9]{4}$' OR crypt(p_old_pin, v_hash) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION '현재 PIN이 올바르지 않습니다.';
  END IF;
  UPDATE parents SET pin_hash = crypt(p_new_pin, gen_salt('bf')) WHERE id = p_parent_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_student_pin(p_phone text, p_pin text)
RETURNS TABLE(student_id int, name text, phone text, is_default_pin boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_phone text := regexp_replace(p_phone, '[-\s]', '', 'g');
  v_id int;
  v_name text;
  v_hash text;
BEGIN
  SELECT st.id, st.name, st.pin_hash INTO v_id, v_name, v_hash FROM students st WHERE st.phone = v_phone;
  IF v_id IS NULL THEN
    RAISE EXCEPTION '등록되지 않은 전화번호입니다. 담당 선생님에게 문의하세요.';
  END IF;
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' OR crypt(p_pin, v_hash) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'PIN이 올바르지 않습니다.';
  END IF;
  RETURN QUERY SELECT v_id, v_name, v_phone, (crypt('0000', v_hash) = v_hash);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_student_pin(p_student_id int, p_old_pin text, p_new_pin text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_hash text;
BEGIN
  IF p_new_pin IS NULL OR p_new_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'PIN은 4자리 숫자여야 합니다.';
  END IF;
  SELECT pin_hash INTO v_hash FROM students WHERE id = p_student_id;
  IF v_hash IS NULL THEN
    RAISE EXCEPTION '계정을 찾을 수 없습니다.';
  END IF;
  IF p_old_pin IS NULL OR p_old_pin !~ '^[0-9]{4}$' OR crypt(p_old_pin, v_hash) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION '현재 PIN이 올바르지 않습니다.';
  END IF;
  UPDATE students SET pin_hash = crypt(p_new_pin, gen_salt('bf')) WHERE id = p_student_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.verify_parent_pin(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_parent_pin(text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.update_parent_pin(int, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_parent_pin(int, text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_student_pin(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_student_pin(text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.update_student_pin(int, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_student_pin(int, text, text) TO anon, authenticated;
COMMIT;
