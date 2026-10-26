import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

test('attendance replies require an approved admin and reset when the parent edits the request', async () => {
  const db = new PGlite()
  try {
    await db.exec(`CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
      CREATE TABLE teachers(user_id uuid, role text, approved boolean);
      INSERT INTO teachers VALUES ('00000000-0000-0000-0000-000000000001', 'admin', true), ('00000000-0000-0000-0000-000000000002', 'teacher', true);
      CREATE TABLE attendance_notices(id bigint PRIMARY KEY, student_id int, parent_id int, date date, type text, reason text);
      INSERT INTO attendance_notices VALUES (1, 10, 20, '2026-10-26', 'late', '병원');`)
    await db.exec(readFileSync(new URL('../supabase/attendance_notice_replies_migration.sql', import.meta.url), 'utf8').replace(/^\uFEFF/, ''))
    await assert.rejects(db.query(`SELECT admin_reply_attendance_notice(1, '확인했습니다.')`), /관리자만/)
    await db.exec(`SET test.uid = '00000000-0000-0000-0000-000000000002'`)
    await assert.rejects(db.query(`UPDATE attendance_notices SET admin_reply = '위조' WHERE id = 1`), /관리자만/)
    await db.exec(`SET test.uid = '00000000-0000-0000-0000-000000000001'`)
    await assert.rejects(db.query(`SELECT admin_reply_attendance_notice(1, '   ')`), /1000/)
    await db.query(`SELECT admin_reply_attendance_notice(1, ' 확인했습니다. ')`)
    const { rows } = await db.query('SELECT admin_reply, replied_at FROM attendance_notices WHERE id = 1')
    assert.equal(rows[0].admin_reply, '확인했습니다.')
    assert.ok(rows[0].replied_at)
    await db.exec(`SET test.uid = ''; UPDATE attendance_notices SET reason = '사유 변경' WHERE id = 1`)
    const edited = await db.query('SELECT admin_reply, replied_at FROM attendance_notices WHERE id = 1')
    assert.deepEqual(edited.rows[0], { admin_reply: null, replied_at: null })
  } finally { await db.close() }
})
