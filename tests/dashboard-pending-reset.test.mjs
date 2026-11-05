import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('reset clears pending rows without releasing records and new records reappear', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE FUNCTION is_teacher_or_admin() RETURNS boolean LANGUAGE sql AS
      $$ SELECT COALESCE(current_setting('test.allowed',true),'false')::boolean $$;
    CREATE TABLE classes(id bigint PRIMARY KEY);
    CREATE TABLE records(id bigint PRIMARY KEY, student_id bigint, class_id bigint, date date,
      is_draft boolean DEFAULT false, released_to_parent boolean DEFAULT false);
    CREATE TABLE class_students(student_id bigint, class_id bigint);
    GRANT SELECT ON classes, records, class_students TO authenticated;
    INSERT INTO classes VALUES(1);
    INSERT INTO class_students VALUES(10,1);
    INSERT INTO records(id,student_id,class_id,date) VALUES
      (1,10,1,'2026-11-01'), (2,10,NULL,'2026-11-02'), (3,20,NULL,'2026-11-03');
  `)
  await db.exec(readFileSync(new URL('../supabase/class_bulk_sends_migration.sql', import.meta.url), 'utf8'))
  const migration = readFileSync(new URL('../supabase/dashboard_pending_reset_migration.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  await db.exec(migration)
  await db.exec('SET ROLE authenticated')
  await assert.rejects(db.query('SELECT reset_dashboard_pending_sends()'), /Only teachers/)
  await db.exec("SELECT set_config('test.allowed','true',false)")
  const pending = async () => (await db.query('SELECT * FROM dashboard_pending_class_sends')).rows
  assert.equal((await pending()).length, 3)
  await db.query('SELECT reset_dashboard_pending_sends()')
  assert.equal((await pending()).length, 0)
  assert.equal((await db.query('SELECT * FROM class_bulk_sends')).rows.length, 0)
  assert.equal((await db.query('SELECT * FROM records WHERE released_to_parent')).rows.length, 0)
  await db.exec('RESET ROLE')
  await db.exec(`INSERT INTO records(id,student_id,class_id,date) VALUES(4,10,1,'2026-11-01');`)
  await db.exec('SET ROLE authenticated')
  assert.equal((await pending()).length, 1)
  await db.query('SELECT reset_dashboard_pending_sends()')
  assert.equal((await pending()).length, 0)
  await db.exec('SET ROLE anon')
  await assert.rejects(db.query('SELECT reset_dashboard_pending_sends()'), /permission denied/)
})
