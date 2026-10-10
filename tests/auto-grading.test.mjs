import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { PGlite } from '@electric-sql/pglite'

function loadTS(path) {
  const context = { exports: {}, require: createRequire(import.meta.url), Buffer }
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context)
  return context.exports
}
test('student test session rejects tampering, expiry, wrong keys and malformed tokens', () => {
  const { signTestSession, readTestSession } = loadTS('../lib/student-test-session.ts')
  const token = signTestSession(7, 'test-secret', 1000)
  assert.equal(readTestSession(token, 'test-secret', 2000), 7)
  assert.equal(readTestSession(token, 'different-key', 2000), null)
  assert.equal(readTestSession(token, 'test-secret', 1000 + 86400000), null)
  assert.equal(readTestSession(token + '.extra', 'test-secret', 2000), null)
  assert.equal(readTestSession('bad.token', 'test-secret', 2000), null)
  assert.equal(readTestSession(signTestSession(-1, 'test-secret', 1000), 'test-secret', 2000), null)
  const parts = token.split('.')
  parts[0] = Buffer.from(JSON.stringify({ studentId: 8, expires: 99999999 })).toString('base64url')
  assert.equal(readTestSession(parts.join('.'), 'test-secret', 2000), null)
})

test('choice selection and countdown handle duplicates, single-choice replacement and deadline', () => {
  const { toggleChoice, remainingSeconds } = loadTS('../lib/auto-grading.ts')
  assert.deepEqual(Array.from(toggleChoice([1], 3)), [1, 3])
  assert.deepEqual(Array.from(toggleChoice([1, 3], 1)), [3])
  assert.deepEqual(Array.from(toggleChoice([1], 3, false)), [3])
  assert.equal(remainingSeconds(180000, 0), 180)
  assert.equal(remainingSeconds(180000, 179999), 1)
  assert.equal(remainingSeconds(180000, 180000), 0)
  assert.equal(remainingSeconds(180000, 190000), 0)
})

test('isAnswerCorrect mirrors server-side grading: unordered multi-select and trimmed exact text', () => {
  const { isAnswerCorrect } = loadTS('../lib/auto-grading.ts')
  const choice = { number: 1, points: 10, kind: 'choice', correctAnswer: [1, 3] }
  assert.equal(isAnswerCorrect(choice, [3, 1]), true)
  assert.equal(isAnswerCorrect(choice, [1]), false)
  assert.equal(isAnswerCorrect(choice, [1, 2]), false)
  assert.equal(isAnswerCorrect(choice, undefined), false)
  assert.equal(isAnswerCorrect({ ...choice, awardAll: true }, undefined), true)
  assert.equal(isAnswerCorrect({ ...choice, awardAll: true }, [5]), true)
  assert.equal(isAnswerCorrect(choice, [3, 1, 1]), true)
  const text = { number: 2, points: 10, kind: 'text', correctAnswer: 'x = 2' }
  assert.equal(isAnswerCorrect(text, '  x = 2  '), true)
  assert.equal(isAnswerCorrect(text, 'x=2'), false)
  assert.equal(isAnswerCorrect(text, undefined), false)
})

test('PostgreSQL migration and exam lifecycle', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    create table teachers(user_id uuid primary key,approved boolean,role text);
    create table students(id bigint primary key,name text,phone text,pin text);
    create table classes(id bigint primary key,name text);
    create table class_students(class_id bigint references classes(id),student_id bigint references students(id),primary key(class_id,student_id));
    create table tests(id bigint generated always as identity primary key,name text not null,date date not null,total integer not null);
    create table test_scores(id bigint generated always as identity primary key,test_id bigint references tests(id) on delete cascade,student_id bigint references students(id),correct integer,score integer,unique(test_id,student_id));
    create table records(id bigint primary key,student_id bigint references students(id));
    create table record_test_items(id bigint generated always as identity primary key,record_id bigint references records(id),test_id bigint references tests(id) on delete cascade,t_total integer,t_cor integer,t_score integer);
    insert into teachers values('11111111-1111-1111-1111-111111111111',true,'admin');
    insert into students values(1,'A','0101','1234'),(2,'B','0102','2345'),(3,'C','0103','3456');
    insert into classes values(10,'First'),(20,'Second');
    insert into class_students values(10,1),(10,2),(20,3);
    insert into records values(1,1),(2,2);
    select set_config('test.uid','11111111-1111-1111-1111-111111111111',false);
    grant select,insert,update,delete on tests,test_scores,record_test_items to anon,authenticated;
    grant usage on all sequences in schema public to anon,authenticated;
  `)
  const migration = readFileSync(new URL('../supabase/auto_grading_migration.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  await db.exec(migration) // SQL Editor reruns must remain safe.
  // Simulate an existing installation with its earlier two-minute default.
  await db.exec("alter table test_attempts alter column deadline_at set default (clock_timestamp() + interval '2 minutes')")
  const durationMigration = readFileSync(new URL('../supabase/test_answer_entry_three_minutes_migration.sql', import.meta.url), 'utf8')
  await db.exec(durationMigration)
  await db.exec(durationMigration)
  const reviewMigration = readFileSync(new URL('../supabase/test_review_and_late_assignees_migration.sql', import.meta.url), 'utf8')
  await db.exec(reviewMigration)
  await db.exec(reviewMigration)
  const batchMigration = readFileSync(new URL('../supabase/test_batches_migration.sql', import.meta.url), 'utf8')
  await db.exec(batchMigration)
  await db.exec(batchMigration)
  const renameMigration = readFileSync(new URL('../supabase/test_batch_rename_migration.sql', import.meta.url), 'utf8')
  await db.exec(renameMigration)
  await db.exec(renameMigration)
  const listIndexes = readFileSync(new URL('../supabase/student_test_list_indexes_migration.sql', import.meta.url), 'utf8')
  await db.exec(listIndexes)
  await db.exec(listIndexes)
  const questions = [{ points: 20, choices: [2], text: '' }, { points: 30, choices: [1, 3], text: '' }, { points: 50, choices: [], text: 'x = 2' }]
  const correctionMigration = readFileSync(new URL('../supabase/test_grading_correction_migration.sql', import.meta.url), 'utf8')
  await db.exec(correctionMigration)
  await db.exec(correctionMigration)
  async function create(published = true, qs = questions) {
    const { rows } = await db.query('select save_auto_test(null,$1,$2,$3,true,$4,$5,$6) as id', ['Test','2026-09-22',qs.length,published,JSON.stringify(qs),[1,2]])
    return Number(rows[0].id)
  }
  async function act(id, action, answers = null, revision = null, sid = 1) {
    const { rows } = await db.query('select student_test_action($1,$2,$3,$4,$5) as data', [sid,id,action,answers === null ? null : JSON.stringify(answers),revision])
    return rows[0].data
  }
  await t.test('transactional setup validates all keys and targets before publishing', async () => {
    const before = (await db.query('select count(*)::int as n from tests')).rows[0].n
    await assert.rejects(create(true,[{ points: 0, choices: [2], text: '' }]))
    await assert.rejects(create(true,[{ points: 10, choices: [6], text: '' }]))
    await assert.rejects(create(true,[{ points: 10, choices: [], text: ' ' }]))
    assert.equal((await db.query('select count(*)::int as n from tests')).rows[0].n, before)
  })
  await t.test('decimal points (up to 2 places) are graded precisely; over-precise values are rejected', async () => {
    await assert.rejects(create(true,[{ points: 1.005, choices: [1], text: '' }]))
    const id = await create(true,[{ points: 2.5, choices: [2], text: '' }, { points: 7.5, choices: [], text: 'x = 2' }])
    await act(id,'start')
    const result = await act(id,'submit',{1:[2],2:'wrong'},1)
    assert.equal(result.attempt.earned_points, 2.5)
    assert.equal(result.attempt.total_points, 10)
    assert.equal(result.attempt.score, 25)
  })
  await t.test('only assigned published tests can start and list does not expose answer keys', async () => {
    const id = await create(false)
    await assert.rejects(act(id,'start'))
    await db.query('select publish_auto_test($1,true)', [id])
    await assert.rejects(act(id,'start',null,null,3))
    const data = await act(id,'start')
    assert.equal(data.questions[1].multiple, true)
    assert.equal(JSON.stringify(data).includes('correct_answer'), false)
    assert.equal(JSON.stringify(data).includes('x = 2'), false)
    const again = await act(id,'start')
    assert.equal(again.attempt.id, data.attempt.id)
    assert.equal(again.attempt.deadline_at, data.attempt.deadline_at)
    assert.ok(Math.abs(Date.parse(data.attempt.deadline_at) - Date.parse(data.attempt.started_at) - 180000) < 20)
    await db.query('select publish_auto_test($1,false)', [id])
    assert.equal((await act(id,'save',{1:[2]},1)).attempt.revision, 1)
  })
  await t.test('student_test_list shows only assigned/published-or-attempted tests without leaking answer keys', async () => {
    const published = await create(true)
    const unpublished = await create(false)
    await act(published,'start',null,null,1)
    const forAssignedStudent = (await db.query('select student_test_list(1) as data')).rows[0].data
    const entry = forAssignedStudent.find(row => row.id === published)
    assert.ok(entry)
    assert.equal(entry.attempt.test_id, published)
    assert.equal(JSON.stringify(forAssignedStudent).includes('correct_answer'), false)
    assert.equal(JSON.stringify(forAssignedStudent).includes('x = 2'), false)
    assert.equal(forAssignedStudent.some(row => row.id === unpublished), false)
    const forUnassignedStudent = (await db.query('select student_test_list(3) as data')).rows[0].data
    assert.equal(forUnassignedStudent.some(row => row.id === published || row.id === unpublished), false)
  })
  await t.test('weighted grading, unordered multi-select, trimmed text and idempotent submit', async () => {
    const id = await create()
    await act(id,'start')
    const result = await act(id,'submit',{1:[2],2:[3,1],3:'  x = 2  '},1)
    assert.equal(result.attempt.cor, 3)
    assert.equal(result.attempt.score, 100)
    assert.equal(result.attempt.earned_points, 100)
    const second = await act(id,'submit',{1:[1]},2)
    assert.equal(second.attempt.score, 100)
    const stored = (await db.query('select correct,score from test_scores where test_id=$1',[id])).rows
    assert.equal(stored.length, 1)
    assert.equal(stored[0].correct, 3)
    assert.equal(stored[0].score, 100)
    await db.query('insert into record_test_items(record_id,test_id,t_total,t_cor,t_score) values(1,$1,99,0,0)',[id])
    const item = (await db.query('select * from record_test_items where test_id=$1',[id])).rows[0]
    assert.equal(item.t_score,100); assert.equal(item.t_cor,3); assert.equal(item.t_total,3)
  })
  await t.test('late assignees retain earlier scores and review rates include both classes', async () => {
    const id = await create()
    await assert.rejects(db.query('select student_test_review(1,$1)', [id]))
    await act(id, 'start', null, null, 1)
    await assert.rejects(db.query('select student_test_review(1,$1)', [id]))
    await act(id, 'submit', {1:[2], 2:[3,1], 3:'x = 2'}, 1, 1)
    const firstReview = (await db.query('select student_test_review(1,$1) as review', [id])).rows[0].review
    assert.equal(firstReview[0].correct_rate, 100)
    assert.deepEqual(firstReview[1].correct_answer, [1,3])
    assert.equal((await db.query('select add_auto_test_assignees($1,$2) as added', [id,[2,3]])).rows[0].added, 1)
    assert.equal((await db.query('select add_auto_test_assignees($1,$2) as added', [id,[3]])).rows[0].added, 0)
    assert.equal((await act(id, 'start', null, null, 3)).attempt.student_id, 3)
    await act(id, 'submit', {1:[2], 2:[1], 3:'wrong'}, 1, 3)
    const review = (await db.query('select student_test_review(1,$1) as review', [id])).rows[0].review
    assert.equal(review[0].correct_rate, 100)
    assert.equal(review[1].correct_rate, 50)
    assert.equal(review[2].correct_rate, 50)
    assert.equal(review[1].submitted_count, 2)
    assert.equal((await db.query('select count(*)::int as count from test_scores where test_id=$1', [id])).rows[0].count, 2)
    await assert.rejects(db.query('select student_test_review(2,$1)', [id]))
  })
  await t.test('new rounds separate rosters while preserving cumulative attempts', async () => {
    const id = await create()
    const first = (await db.query('select id from test_batches where test_id=$1 and round_number=1', [id])).rows[0].id
    await act(id, 'start', null, null, 1)
    await act(id, 'submit', {1:[2],2:[1,3],3:'x = 2'}, 1, 1)
    await assert.rejects(db.query('select add_auto_test_batch($1,$2,$3,$4)', [id,'Invalid',20,[2]]))
    const second = (await db.query('select add_auto_test_batch($1,$2,$3,$4) as id', [id,'Second class',20,[3]])).rows[0].id
    await db.query('select rename_auto_test_batch($1,$2,$3)', [id, second, 'Evening class'])
    assert.equal((await db.query('select name from test_batches where id=$1', [second])).rows[0].name, 'Evening class')
    await assert.rejects(db.query('select rename_auto_test_batch($1,$2,$3)', [id, second, '   ']))
    const assigned = (await db.query('select student_id,batch_id from test_assignees where test_id=$1 order by student_id', [id])).rows
    assert.deepEqual(assigned.map(row => Number(row.batch_id)), [Number(first), Number(first), Number(second)])
    assert.equal((await db.query('select count(*)::int as n from test_attempts where test_id=$1 and submitted_at is not null', [id])).rows[0].n, 1)
    await assert.rejects(db.query('select add_auto_test_batch($1,$2,$3,$4)', [id,'Duplicate',20,[3]]))
    await act(id, 'start', null, null, 3)
    await act(id, 'submit', {1:[1],2:[1],3:'wrong'}, 1, 3)
    const review = (await db.query('select student_test_review(1,$1) as review', [id])).rows[0].review
    assert.equal(review[0].correct_rate, 50)
    assert.equal((await db.query('select count(*)::int as n from test_batches where test_id=$1', [id])).rows[0].n, 2)
  })
  await t.test('partial multi-select and different subjective answers do not earn credit; zero is preserved', async () => {
    const id = await create()
    await act(id,'start')
    const partial = await act(id,'submit',{1:[2],2:[1],3:'x=2'},1)
    assert.equal(partial.attempt.score,20); assert.equal(partial.attempt.cor,1)
    await act(id,'start',null,null,2)
    const blank = await act(id,'submit',{},1,2)
    assert.equal(blank.attempt.score,0)
    await db.query('insert into record_test_items(record_id,test_id,t_total,t_cor,t_score) values(2,$1,99,9,99)',[id])
    assert.equal((await db.query('select t_score from record_test_items where test_id=$1 and record_id=2',[id])).rows[0].t_score,0)
  })
  await t.test('out-of-order saves cannot overwrite answers; missing question and invalid choices rejected', async () => {
    const id = await create()
    await act(id,'start')
    await act(id,'save',{1:[2]},1)
    // A lost HTTP response may cause exactly the same write to be sent again.
    assert.equal((await act(id,'save',{1:[2]},1)).attempt.revision,1)
    await act(id,'save',{1:[2],2:[1,3]},2)
    await assert.rejects(act(id,'save',{1:[1]},1))
    await assert.rejects(act(id,'save',{1:[8]},3))
    await assert.rejects(act(id,'save',{4:'missing'},3))
    assert.equal((await act(id,'status')).attempt.revision,2)
  })
  await t.test('late submissions use only already saved answers and scheduler finalizes offline attempts', async () => {
    const id = await create()
    await act(id,'start')
    await act(id,'save',{1:[2]},1)
    await db.query("update test_attempts set deadline_at=clock_timestamp()-interval '1 second' where test_id=$1",[id])
    const expired = await act(id,'submit',{1:[2],2:[1,3],3:'x = 2'},2)
    assert.equal(expired.attempt.score,20)
    await act(id,'start',null,null,2)
    await db.query("update test_attempts set deadline_at=clock_timestamp()-interval '1 second' where test_id=$1 and student_id=2",[id])
    await db.query('select finalize_expired_tests()')
    await db.query('select finalize_expired_tests()')
    assert.equal((await act(id,'status',null,null,2)).attempt.score,0)
    assert.equal((await db.query('select count(*)::int as n from test_scores where test_id=$1',[id])).rows[0].n,2)
  })
  await t.test('started exams cannot be rewritten or switched back to manual', async () => {
    const id = await create()
    await act(id,'start')
    await assert.rejects(db.query('select save_auto_test($1,$2,$3,3,false,false,$4,$5)',[id,'Changed','2026-09-22',JSON.stringify(questions),[1]]))
    await assert.rejects(db.query('update tests set total=10 where id=$1',[id]))
  })
  await t.test('anonymous and ordinary authenticated callers cannot read keys or invoke student RPCs', async () => {
    for (const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}; select set_config('test.uid','',false);`)
      await assert.rejects(db.query('select student_test_list(1)'))
      await assert.rejects(db.query('select student_test_review(1,1)'))
      await assert.rejects(db.query('select add_auto_test_assignees(1,array[3]::bigint[])'))
      await assert.rejects(db.query("select add_auto_test_batch(1,'Other',null,array[3]::bigint[])"))
      await assert.rejects(db.query("select rename_auto_test_batch(1,1,'Other')"))
      await assert.rejects(db.query('select finalize_expired_tests()'))
      if (role==='anon') await assert.rejects(db.query('select * from test_questions'))
      else {
        assert.equal((await db.query('select * from test_questions')).rows.length,0)
        assert.equal((await db.query('select * from test_batches')).rows.length,0)
      }
      await db.exec('reset role')
    }
    await db.query("select set_config('test.uid','11111111-1111-1111-1111-111111111111',false)")
  })
  await t.test('even broad legacy table grants cannot overwrite auto scores; manual scores still work', async () => {
    const id=await create(); await act(id,'start'); await act(id,'submit',{1:[2]},1)
    const manual=(await db.query("insert into tests(name,date,total) values('Manual','2026-09-22',10) returning id")).rows[0].id
    await db.exec('set role authenticated')
    await assert.rejects(db.query('update test_scores set score=99 where test_id=$1',[id]))
    await assert.rejects(db.query('delete from test_scores where test_id=$1',[id]))
    await assert.rejects(db.query('update test_scores set test_id=$2 where test_id=$1',[id,manual]))
    await assert.rejects(db.query('update tests set is_published=false where id=$1',[id]))
    await db.query('insert into test_scores(test_id,student_id,correct,score) values($1,1,8,80)',[manual])
    await db.exec('reset role')
    assert.equal((await db.query('select score from test_scores where test_id=$1',[manual])).rows[0].score,80)
  })
  await t.test('grading corrections preserve answers, recalculate linked scores, affect later submissions and can be undone', async () => {
    const id = await create()
    await act(id,'start')
    await act(id,'submit',{'2':[5]},1)
    await db.query('insert into record_test_items(record_id,test_id) values(1,$1)', [id])
    const original = (await db.query('select * from test_attempts where test_id=$1 and student_id=1',[id])).rows[0]
    const snapshot = (await db.query('select get_test_correction_data($1) as data',[id])).rows[0].data
    const qs = snapshot.questions.map(q => ({ ...q, points: q.number === 1 ? 10 : q.number === 3 ? 60 : 30,
      award_all: q.number !== 2, correct_answer: q.number === 2 ? [5] : q.correct_answer }))
    const { rows } = await db.query('select apply_test_correction($1,$2,$3,$4) as id',[id,JSON.stringify(qs),'Key and full-credit correction',snapshot.version])
    const corrected = (await db.query('select * from test_attempts where test_id=$1 and student_id=1',[id])).rows[0]
    assert.equal(corrected.score,100)
    assert.equal(corrected.cor,3)
    assert.deepEqual(corrected.answers,original.answers)
    assert.deepEqual(corrected.submitted_at,original.submitted_at)
    assert.equal((await db.query('select t_score from record_test_items where test_id=$1',[id])).rows[0].t_score,100)
    await assert.rejects(db.query('select apply_test_correction($1,$2,$3,$4)',[id,JSON.stringify(qs),'Stale edit',snapshot.version]))
    await act(id,'start',null,null,2)
    await act(id,'submit',{},1,2)
    assert.equal((await db.query('select score from test_attempts where test_id=$1 and student_id=2',[id])).rows[0].score,70)
    const review = (await db.query('select student_test_review(1,$1) as r',[id])).rows[0].r
    assert.equal(review[0].award_all,true)
    assert.equal(review[0].correct_rate,100)
    await db.query('select undo_test_correction($1)',[rows[0].id])
    assert.equal((await db.query('select t_score from record_test_items where test_id=$1',[id])).rows[0].t_score,0)
    assert.equal((await db.query('select score from test_attempts where test_id=$1 and student_id=2',[id])).rows[0].score,0)
    await assert.rejects(db.query('select undo_test_correction($1)',[rows[0].id]))
    const restored = (await db.query('select get_test_correction_data($1) as data',[id])).rows[0].data
    const invalid = restored.questions.map(q => ({ ...q,points:q.number===2?0:q.points,award_all:true }))
    await assert.rejects(db.query('select apply_test_correction($1,$2,$3,$4)',[id,JSON.stringify(invalid),'Invalid points',restored.version]))
    assert.deepEqual((await db.query('select get_test_correction_data($1) as data',[id])).rows[0].data.questions,restored.questions)
    await db.query("select set_config('test.uid','',false)")
    await db.exec('set role authenticated')
    await assert.rejects(db.query('select get_test_correction_data($1)',[id]))
    await assert.rejects(db.query('select apply_test_correction($1,$2,$3,$4)',[id,JSON.stringify(qs),'Forbidden',restored.version]))
    await assert.rejects(db.query('select recalculate_test_results($1)',[id]))
    await db.exec('reset role')
    await db.query("select set_config('test.uid','11111111-1111-1111-1111-111111111111',false)")
  })
  await t.test('one-block Yushin correction works twice without any temporary table', async () => {
    const qs=Array.from({length:6},()=>({points:10,choices:[1],text:''}))
    const id=await create(true,qs)
    await db.query('update tests set name=$1 where id=$2',['공통수학2 2학기 1차 테스트(유신고 기출)',id])
    await act(id,'start'); await act(id,'submit',{},1)
    const correction=readFileSync(new URL('../supabase/yushin_test_questions_3_6_correction.sql',import.meta.url),'utf8')
    await db.exec(correction); await db.exec(correction)
    const attempt=(await db.query('select * from test_attempts where test_id=$1',[id])).rows[0]
    assert.equal(attempt.cor,2); assert.equal(attempt.score,33); assert.deepEqual(attempt.answers,{})
    assert.equal((await db.query('select count(*)::int n from test_grading_corrections where test_id=$1',[id])).rows[0].n,1)
  })
  await t.test('PIN verification locks repeated failures and unlocks after the cooldown', async () => {
    for (let i=0;i<5;i++) assert.equal((await db.query("select verify_test_student(1,'9999') as ok")).rows[0].ok,false)
    assert.equal((await db.query("select verify_test_student(1,'1234') as ok")).rows[0].ok,false)
    await db.query("update test_login_limits set blocked_until=clock_timestamp()-interval '1 second' where student_id=1")
    assert.equal((await db.query("select verify_test_student(1,'1234') as ok")).rows[0].ok,true)
  })
})
