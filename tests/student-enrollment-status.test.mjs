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
})
