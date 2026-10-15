import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('staff read receipts isolate accounts, retain new comments and enforce RLS', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  const a = '00000000-0000-0000-0000-000000000001'
  const b = '00000000-0000-0000-0000-000000000002'
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES ('${a}'), ('${b}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('test.uid')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE FUNCTION public.is_teacher_or_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE TABLE inquiry_messages(id bigint PRIMARY KEY, sender_type text, is_read boolean);
    CREATE TABLE records(id bigint PRIMARY KEY, parent_comment_at timestamptz, parent_comment_read_at timestamptz);
    CREATE TABLE record_comments(id bigint PRIMARY KEY, is_read boolean);
    INSERT INTO inquiry_messages VALUES (1,'parent',true);
    INSERT INTO records VALUES (1,'2026-10-15T00:00:00Z','2026-10-15T01:00:00Z');
    INSERT INTO record_comments VALUES (1,true);
    GRANT SELECT ON inquiry_messages, records, record_comments TO authenticated;
    CREATE FUNCTION public.admin_analytics_summary(timestamptz DEFAULT now()) RETURNS bigint
      LANGUAGE sql SECURITY DEFINER AS $$ SELECT count(*) FROM public.inquiry_messages WHERE sender_type = 'parent' AND is_read = false $$;
  `)
  const sql = readFileSync(new URL('../supabase/staff_read_receipts_migration.sql', import.meta.url), 'utf8')
  await db.exec(sql)
  await db.exec(sql)
  await db.exec(`SET ROLE authenticated; SELECT set_config('test.uid','${a}',false)`)
  assert.equal((await db.query('SELECT is_read FROM staff_inquiry_messages')).rows[0].is_read, false)
  await db.exec(`INSERT INTO inquiry_messages_staff_reads(message_id) VALUES (1);
    INSERT INTO records_staff_reads(record_id,read_at) VALUES (1,'2026-10-15T00:00:00Z');
    INSERT INTO record_comments_staff_reads(comment_id) VALUES (1);`)
  assert.equal((await db.query('SELECT is_read FROM staff_inquiry_messages')).rows[0].is_read, true)
  assert.equal(Number((await db.query('SELECT admin_analytics_summary() AS count')).rows[0].count), 0)
  assert.equal((await db.query('SELECT is_read FROM staff_record_comments')).rows[0].is_read, true)
  await db.exec(`SELECT set_config('test.uid','${b}',false)`)
  assert.equal((await db.query('SELECT is_read FROM staff_inquiry_messages')).rows[0].is_read, false)
  assert.equal((await db.query('SELECT is_read FROM staff_record_comments')).rows[0].is_read, false)
  assert.equal(Number((await db.query('SELECT admin_analytics_summary() AS count')).rows[0].count), 1)
  assert.equal((await db.query('SELECT parent_comment_read_at FROM staff_records')).rows[0].parent_comment_read_at, null)
  await assert.rejects(db.exec(`INSERT INTO inquiry_messages_staff_reads(user_id,message_id) VALUES ('${a}',1)`), /row-level security/)
  assert.equal((await db.query('SELECT * FROM inquiry_messages_staff_reads')).rows.length, 0)
  await db.exec(`RESET ROLE; UPDATE records SET parent_comment_at = '2026-10-15T02:00:00Z';
    SET ROLE authenticated; SELECT set_config('test.uid','${a}',false)`)
  assert.equal((await db.query('SELECT parent_comment_read_at < parent_comment_at AS unread FROM staff_records')).rows[0].unread, true)
})
