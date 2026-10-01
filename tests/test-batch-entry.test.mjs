import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('rounds open independently and submitted results survive archive', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
      SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    CREATE TABLE teachers(user_id uuid PRIMARY KEY, approved boolean, role text);
    CREATE TABLE students(id bigint PRIMARY KEY, name text, phone text, pin text);
    CREATE TABLE classes(id bigint PRIMARY KEY, name text);
    CREATE TABLE class_students(class_id bigint REFERENCES classes(id), student_id bigint REFERENCES students(id), PRIMARY KEY(class_id, student_id));
    CREATE TABLE tests(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL, date date NOT NULL, total integer NOT NULL);
    CREATE TABLE test_scores(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, test_id bigint REFERENCES tests(id), student_id bigint REFERENCES students(id), correct integer, score integer, UNIQUE(test_id, student_id));
    CREATE TABLE records(id bigint PRIMARY KEY, student_id bigint REFERENCES students(id), date date,
      is_draft boolean NOT NULL DEFAULT false, released_to_parent boolean NOT NULL DEFAULT true);
    CREATE TABLE record_test_items(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, record_id bigint REFERENCES records(id), test_id bigint REFERENCES tests(id), t_total integer, t_cor integer, t_score integer);
    INSERT INTO teachers VALUES ('11111111-1111-1111-1111-111111111111', true, 'admin');
    INSERT INTO students VALUES (1, 'A', '0101', '1234'), (2, 'B', '0102', '2345');
    INSERT INTO classes VALUES (10, 'First'), (20, 'Second');
    INSERT INTO class_students VALUES (10, 1), (20, 2);
    SELECT set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);
  `)
  for (const filename of [
    'auto_grading_migration.sql',
    'test_review_and_late_assignees_migration.sql',
    'test_batches_migration.sql',
    'test_archive_migration.sql',
  ]) {
    await db.exec(readFileSync(new URL(`../supabase/${filename}`, import.meta.url), 'utf8'))
  }
  const questions = [{ points: 100, choices: [2], text: '' }]
  const created = await db.query('SELECT save_auto_test(NULL,$1,$2,1,true,false,$3,$4) AS id',
    ['Reusable', '2026-10-01', JSON.stringify(questions), [1]])
  const testId = Number(created.rows[0].id)
  const migration = readFileSync(new URL('../supabase/test_batch_entry_migration.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  await db.exec(migration)
  const firstBatch = Number((await db.query('SELECT id FROM test_batches WHERE test_id=$1', [testId])).rows[0].id)
  const before = (await db.query('SELECT student_test_list(1) AS data')).rows[0].data
  assert.equal(before[0].answer_entry_open, false)
  await assert.rejects(db.query("SELECT student_test_action($1,1,'start')", [1]))
  await db.exec("SELECT set_config('test.uid', '22222222-2222-2222-2222-222222222222', false)")
  await db.exec('SET ROLE authenticated')
  await assert.rejects(db.query('SELECT open_test_batch_entry($1,$2)', [testId, firstBatch]), /권한/)
  await db.exec('RESET ROLE')
  await db.exec("SELECT set_config('test.uid', '11111111-1111-1111-1111-111111111111', false)")
  await db.query('SELECT open_test_batch_entry($1,$2)', [testId, firstBatch])
  const started = (await db.query("SELECT student_test_action(1,$1,'start') AS data", [testId])).rows[0].data
  assert.equal(started.questions.length, 1)
  assert.equal(JSON.stringify(started).includes('correct_answer'), false)
  const finished = (await db.query("SELECT student_test_action(1,$1,'submit',$2,1) AS data",
    [testId, JSON.stringify({ 1: [2] })])).rows[0].data
  assert.equal(finished.attempt.score, 100)
  const secondBatch = Number((await db.query('SELECT add_auto_test_batch($1,$2,20,$3) AS id',
    [testId, 'Next year', [2]])).rows[0].id)
  assert.equal((await db.query('SELECT answer_entry_open FROM test_batches WHERE id=$1', [secondBatch])).rows[0].answer_entry_open, false)
  await assert.rejects(db.query("SELECT student_test_action(2,$1,'start')", [testId]))
  await db.exec(migration)
  assert.equal((await db.query('SELECT answer_entry_open FROM test_batches WHERE id=$1', [secondBatch])).rows[0].answer_entry_open, false)
  await db.query('SELECT set_test_archived($1,true)', [testId])
  assert.equal((await db.query('SELECT student_test_list(1) AS data')).rows[0].data[0].attempt.score, 100)
  const manualId = Number((await db.query("INSERT INTO tests(name,date,total,auto_grading) VALUES ('Paper test','2026-10-02',10,false) RETURNING id")).rows[0].id)
  await db.query("INSERT INTO records(id,student_id,date) VALUES (11,1,'2026-10-02'), (12,2,'2026-10-02')")
  await db.query('INSERT INTO record_test_items(record_id,test_id,t_total,t_cor,t_score) VALUES (11,$1,10,8,80),(12,$1,10,6,60)', [manualId])
  await db.query('SELECT set_test_archived($1,true)', [manualId])
  await db.query('UPDATE records SET released_to_parent=false WHERE id=12')
  const studentOne = (await db.query('SELECT student_test_list(1) AS data')).rows[0].data
  assert.equal(studentOne.find(row => row.id === manualId).manual_score, 80)
  assert.equal(studentOne.find(row => row.id === manualId).kind, 'manual')
  assert.equal((await db.query('SELECT student_test_list(2) AS data')).rows[0].data.some(row => row.id === manualId), false)
  await db.query('SELECT open_test_batch_entry($1,$2)', [testId, secondBatch])
  assert.equal((await db.query('SELECT answer_entry_open FROM test_batches WHERE id=$1', [secondBatch])).rows[0].answer_entry_open, true)
  assert.equal((await db.query("SELECT student_test_action(2,$1,'start') AS data", [testId])).rows[0].data.attempt.student_id, 2)
})
