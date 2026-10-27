import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('attendance migration preserves legacy records and synchronizes all four statuses', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`CREATE TABLE records(id integer PRIMARY KEY, late boolean);
    INSERT INTO records VALUES(1,false),(2,true);`)
  const sql = readFileSync(new URL('../supabase/record_attendance_status_migration.sql', import.meta.url), 'utf8')
  await db.exec(sql)
  await db.exec(sql)
  assert.deepEqual((await db.query('SELECT attendance_status FROM records ORDER BY id')).rows,
    [{ attendance_status: 'on_time' }, { attendance_status: 'late' }])
  await db.exec(`INSERT INTO records(id,late) VALUES(3,true);
    INSERT INTO records VALUES(4,true,'absence'),(5,true,'early_leave');`)
  assert.deepEqual((await db.query('SELECT late FROM records WHERE id IN (4,5) ORDER BY id')).rows,
    [{ late: false }, { late: false }])
  await db.exec("UPDATE records SET attendance_status='late' WHERE id=4")
  assert.equal((await db.query('SELECT late FROM records WHERE id=4')).rows[0].late, true)
  await db.exec('UPDATE records SET late=false WHERE id=3')
  assert.equal((await db.query('SELECT attendance_status FROM records WHERE id=3')).rows[0].attendance_status, 'on_time')
  await assert.rejects(db.exec("UPDATE records SET attendance_status='invalid' WHERE id=1"), /check constraint/)
})

test('attendance migration refreshes an older staff view while preserving receipts and access', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
    CREATE TABLE records(id integer PRIMARY KEY, late boolean, parent_comment_read_at timestamptz);
    CREATE TABLE records_staff_reads(record_id integer, user_id uuid, read_at timestamptz);
    INSERT INTO records VALUES (1,false,NULL),(2,false,NULL),(3,true,NULL),(4,false,NULL);
    INSERT INTO records_staff_reads VALUES
      (1,auth.uid(),'2026-10-27T00:00:00Z'),
      (2,'00000000-0000-0000-0000-000000000002','2026-10-27T01:00:00Z');
    CREATE VIEW staff_records WITH (security_invoker = true) AS
      SELECT source.id,source.late,receipt.read_at AS parent_comment_read_at
      FROM records source LEFT JOIN records_staff_reads receipt
        ON receipt.record_id=source.id AND receipt.user_id=auth.uid();
    GRANT SELECT ON staff_records TO authenticated;
  `)
  const sql = readFileSync(new URL('../supabase/record_attendance_status_migration.sql', import.meta.url), 'utf8')
  await db.exec(sql)
  await db.exec("UPDATE records SET attendance_status='absence' WHERE id=1; UPDATE records SET attendance_status='early_leave' WHERE id=2;")
  await db.exec(sql)
  assert.deepEqual((await db.query('SELECT attendance_status FROM staff_records ORDER BY id')).rows,
    ['absence', 'early_leave', 'late', 'on_time'].map(attendance_status => ({ attendance_status })))
  const receipts = (await db.query('SELECT parent_comment_read_at FROM staff_records ORDER BY id')).rows
  assert.equal(new Date(receipts[0].parent_comment_read_at).toISOString(), '2026-10-27T00:00:00.000Z')
  assert.equal(receipts[1].parent_comment_read_at, null)
  assert.equal((await db.query("SELECT has_table_privilege('authenticated','staff_records','SELECT') AS allowed")).rows[0].allowed, true)
  assert.deepEqual((await db.query("SELECT reloptions FROM pg_class WHERE oid='staff_records'::regclass")).rows[0].reloptions,
    ['security_invoker=true'])
})
