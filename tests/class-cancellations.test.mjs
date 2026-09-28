import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('class_cancellations: staff can register/delete, anon can only read, duplicates and missing classes are rejected', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  const admin = '00000000-0000-0000-0000-000000000001'
  const teacher = '00000000-0000-0000-0000-000000000002'
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES ('${admin}'), ('${teacher}');
    CREATE TABLE teachers(user_id uuid PRIMARY KEY, role text, approved boolean);
    INSERT INTO teachers VALUES ('${admin}','admin',true), ('${teacher}','teacher',true);
    CREATE FUNCTION public.is_teacher_or_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND role IN ('admin','teacher','assistant'));
    $$;
    CREATE TABLE classes(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL, days text);
    INSERT INTO classes(name, days) VALUES ('수학 정규반', '월,수,금'), ('심화 문제풀이반', '화,목');
    GRANT SELECT ON classes TO anon, authenticated;
  `)
  const sql = readFileSync(new URL('../supabase/class_cancellations_migration.sql', import.meta.url), 'utf8')
  await db.exec(sql)
  await db.exec(sql) // 재실행 가능해야 한다
  // Supabase는 anon/authenticated에 테이블 권한을 기본적으로 부여해두고 RLS로 제한한다 —
  // 로컬 PGlite에는 그 기본값이 없으니 동일한 조건이 되도록 직접 부여한다.
  await db.exec('GRANT SELECT, INSERT, UPDATE, DELETE ON class_cancellations TO anon, authenticated;')

  await db.query("SELECT set_config('test.uid','',false)")
  await db.exec('SET ROLE anon')
  // 로그인 없는 학생/학부모 화면과 동일하게 anon은 조회는 가능하지만 쓰기는 막힌다.
  assert.equal((await db.query('SELECT * FROM class_cancellations')).rows.length, 0)
  await assert.rejects(db.query("INSERT INTO class_cancellations(class_id, cancel_date) VALUES (1, '2026-09-29')"), /permission denied|row-level security/)

  await db.exec('SET ROLE authenticated')
  await assert.rejects(db.query("INSERT INTO class_cancellations(class_id, cancel_date) VALUES (1, '2026-09-29')"), /row-level security/)

  await db.query("SELECT set_config('test.uid',$1,false)", [teacher])
  await db.query("INSERT INTO class_cancellations(class_id, cancel_date, memo) VALUES (2, '2026-09-29', '선생님 사정')")
  const rows = (await db.query('SELECT class_id, cancel_date, memo FROM class_cancellations')).rows
  assert.equal(rows.length, 1)
  assert.equal(rows[0].class_id, 2)
  assert.equal(rows[0].cancel_date.toISOString().slice(0, 10), '2026-09-29')
  assert.equal(rows[0].memo, '선생님 사정')

  // 같은 반·같은 날짜 중복 등록은 막힌다 (관리자 화면의 upsert가 기대하는 제약).
  await assert.rejects(db.query("INSERT INTO class_cancellations(class_id, cancel_date) VALUES (2, '2026-09-29')"), /duplicate key|unique/)
  // 존재하지 않는 반은 등록할 수 없다.
  await assert.rejects(db.query("INSERT INTO class_cancellations(class_id, cancel_date) VALUES (999, '2026-09-30')"), /foreign key/)

  await db.exec('RESET ROLE')
  const cancelId = (await db.query('SELECT id FROM class_cancellations')).rows[0].id

  await db.exec('SET ROLE anon')
  // RLS에는 anon용 삭제 정책이 없으므로 이 행이 anon에게는 보이지 않아 0건 삭제로 조용히
  // 끝난다 — 실제로 지워지지 않았는지로 검증한다.
  await db.query('DELETE FROM class_cancellations WHERE id = $1', [cancelId])
  await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT id FROM class_cancellations WHERE id = $1', [cancelId])).rows.length, 1)

  await db.query("SELECT set_config('test.uid',$1,false)", [admin])
  await db.exec('SET ROLE authenticated')
  await db.query('DELETE FROM class_cancellations WHERE id = $1', [cancelId])
  assert.equal((await db.query('SELECT * FROM class_cancellations')).rows.length, 0)

  // 반이 삭제되면 그 반의 휴강 등록도 함께 정리된다.
  await db.query("INSERT INTO class_cancellations(class_id, cancel_date) VALUES (2, '2026-10-06')")
  await db.exec('RESET ROLE')
  await db.query('DELETE FROM classes WHERE id = 2')
  assert.equal((await db.query('SELECT * FROM class_cancellations')).rows.length, 0)
})
