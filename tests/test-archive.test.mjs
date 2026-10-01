import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('archiving hides a published test while preserving its results and allows restoration', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE ROLE anon;
    CREATE ROLE service_role;
    CREATE TABLE public.tests (
      id bigint PRIMARY KEY, auto_grading boolean NOT NULL,
      is_published boolean NOT NULL DEFAULT false
    );
    CREATE TABLE public.test_scores (test_id bigint REFERENCES public.tests(id), score integer);
    CREATE FUNCTION public.is_exam_staff() RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT current_setting('test.is_staff', true) = 'yes'
    $$;
    INSERT INTO public.tests(id, auto_grading, is_published) VALUES (1, true, true), (2, false, false);
    INSERT INTO public.test_scores VALUES (1, 87);
  `)
  const sql = readFileSync(new URL('../supabase/test_archive_migration.sql', import.meta.url), 'utf8')
  await db.exec(sql)
  await db.exec(sql)
  await db.exec("SET test.is_staff = 'no'")
  await db.exec('SET ROLE authenticated')
  await assert.rejects(db.query('SELECT public.set_test_archived(1, true)'), /권한/)
  await db.exec('RESET ROLE')
  await db.exec("SET test.is_staff = 'yes'")
  await db.exec('SET ROLE authenticated')
  await db.query('SELECT public.set_test_archived(1, true)')
  await db.query('SELECT public.set_test_archived(2, true)')
  await db.exec('RESET ROLE')
  assert.deepEqual((await db.query('SELECT id, is_archived, is_published FROM public.tests ORDER BY id')).rows, [
    { id: 1, is_archived: true, is_published: false },
    { id: 2, is_archived: true, is_published: false },
  ])
  assert.equal((await db.query('SELECT score FROM public.test_scores')).rows[0].score, 87)
  await db.exec('SET ROLE authenticated')
  await db.query('SELECT public.set_test_archived(1, false)')
  await db.exec('RESET ROLE')
  assert.deepEqual((await db.query('SELECT is_archived, is_published FROM public.tests WHERE id = 1')).rows[0],
    { is_archived: false, is_published: false })
})
