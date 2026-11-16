import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('student statuses retain records and update enrollment totals', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
    CREATE TABLE teachers(user_id uuid,role text,approved boolean);
    INSERT INTO teachers VALUES(auth.uid(),'admin',true);
    CREATE TABLE students(id bigint PRIMARY KEY,reg_date date);
    INSERT INTO students VALUES(1,current_date);`)
  for (const file of ['student_enrollment_stats_migration.sql','student_enrollment_status_migration.sql']) {
    await db.exec(readFileSync(new URL(`../supabase/${file}`,import.meta.url),'utf8'))
  }
  const count = async () => (await db.query('SELECT admin_student_enrollment_summary() AS s')).rows[0].s.currentEnrolled
  assert.equal(await count(),1)
  await db.exec("INSERT INTO students(id,reg_date,enrollment_status) VALUES(2,current_date,'prospective')")
  assert.equal(await count(),1)
  await db.exec("UPDATE students SET enrollment_status='withdrawn' WHERE id=1")
  assert.equal(await count(),0)
  assert.equal((await db.query('SELECT count(*)::int AS n FROM students')).rows[0].n,2)
  assert.ok((await db.query('SELECT withdrawn_on FROM students WHERE id=1')).rows[0].withdrawn_on)
  await db.exec("UPDATE students SET enrollment_status='enrolled' WHERE id IN (1,2)")
  assert.equal(await count(),2)
  assert.equal((await db.query('SELECT withdrawn_on FROM students WHERE id=1')).rows[0].withdrawn_on,null)
  await assert.rejects(db.exec("UPDATE students SET enrollment_status='invalid'"),/check constraint/)
  // pg_cron runs on Supabase; use a scheduler stub to validate the complete migration locally.
  await db.exec(`CREATE SCHEMA cron;
    CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;`)
  const autoSql = readFileSync(new URL('../supabase/student_enrollment_auto_start_migration.sql',import.meta.url),'utf8')
    .replace('CREATE EXTENSION IF NOT EXISTS pg_cron;','')
  await db.exec(autoSql)
  await db.exec(`INSERT INTO students(id,reg_date) VALUES(3,(now() AT TIME ZONE 'Asia/Seoul')::date+1);
    INSERT INTO students(id,reg_date) VALUES(4,(now() AT TIME ZONE 'Asia/Seoul')::date);
    UPDATE students SET enrollment_status='withdrawn' WHERE id=1;`)
  assert.equal((await db.query('SELECT enrollment_status FROM students WHERE id=3')).rows[0].enrollment_status,'prospective')
  assert.equal((await db.query('SELECT enrollment_status FROM students WHERE id=4')).rows[0].enrollment_status,'enrolled')
  // Simulate the clock reaching the registration date without running the date-normalization trigger.
  await db.exec(`ALTER TABLE students DISABLE TRIGGER set_student_withdrawal_date;
    UPDATE students SET reg_date=(now() AT TIME ZONE 'Asia/Seoul')::date WHERE id=3;
    ALTER TABLE students ENABLE TRIGGER set_student_withdrawal_date;
    SELECT activate_due_students(); SELECT activate_due_students();`)
  assert.equal((await db.query('SELECT enrollment_status FROM students WHERE id=3')).rows[0].enrollment_status,'enrolled')
  assert.equal((await db.query('SELECT is_test FROM student_enrollment_history WHERE student_id=3')).rows[0].is_test,false)
  assert.equal((await db.query('SELECT enrollment_status FROM students WHERE id=1')).rows[0].enrollment_status,'withdrawn')
  assert.equal(await count(),3)
  await db.exec("SET ROLE authenticated")
  await assert.rejects(db.query('SELECT activate_due_students()'),/permission denied/)
})
