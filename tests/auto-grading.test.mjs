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
  assert.equal(remainingSeconds(120000, 0), 120)
  assert.equal(remainingSeconds(120000, 119999), 1)
  assert.equal(remainingSeconds(120000, 120000), 0)
  assert.equal(remainingSeconds(120000, 130000), 0)
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
    create table tests(id bigint generated always as identity primary key,name text not null,date date not null,total integer not null);
    create table test_scores(id bigint generated always as identity primary key,test_id bigint references tests(id) on delete cascade,student_id bigint references students(id),cor integer,score integer,unique(test_id,student_id));
    create table records(id bigint primary key,student_id bigint references students(id));
    create table record_test_items(id bigint generated always as identity primary key,record_id bigint references records(id),test_id bigint references tests(id) on delete cascade,t_total integer,t_cor integer,t_score integer);
    insert into teachers values('11111111-1111-1111-1111-111111111111',true,'admin');
    insert into students values(1,'A','0101','1234'),(2,'B','0102','2345'),(3,'C','0103','3456');
    insert into records values(1,1),(2,2);
    select set_config('test.uid','11111111-1111-1111-1111-111111111111',false);
    grant select,insert,update,delete on tests,test_scores,record_test_items to anon,authenticated;
    grant usage on all sequences in schema public to anon,authenticated;
  `)
  const migration = readFileSync(new URL('../supabase/auto_grading_migration.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  await db.exec(migration) // SQL Editor reruns must remain safe.
  const questions = [{ points: 20, choices: [2], text: '' }, { points: 30, choices: [1, 3], text: '' }, { points: 50, choices: [], text: 'x = 2' }]
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
    assert.ok(Math.abs(Date.parse(data.attempt.deadline_at) - Date.parse(data.attempt.started_at) - 120000) < 20)
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
    assert.equal((await db.query('select count(*)::int as n from test_scores where test_id=$1',[id])).rows[0].n,1)
    await db.query('insert into record_test_items(record_id,test_id,t_total,t_cor,t_score) values(1,$1,99,0,0)',[id])
    const item = (await db.query('select * from record_test_items where test_id=$1',[id])).rows[0]
    assert.equal(item.t_score,100); assert.equal(item.t_cor,3); assert.equal(item.t_total,3)
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
      await assert.rejects(db.query('select finalize_expired_tests()'))
      if (role==='anon') await assert.rejects(db.query('select * from test_questions'))
      else assert.equal((await db.query('select * from test_questions')).rows.length,0)
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
    await db.query('insert into test_scores(test_id,student_id,cor,score) values($1,1,8,80)',[manual])
    await db.exec('reset role')
    assert.equal((await db.query('select score from test_scores where test_id=$1',[manual])).rows[0].score,80)
  })
  await t.test('PIN verification locks repeated failures and unlocks after the cooldown', async () => {
    for (let i=0;i<5;i++) assert.equal((await db.query("select verify_test_student(1,'9999') as ok")).rows[0].ok,false)
    assert.equal((await db.query("select verify_test_student(1,'1234') as ok")).rows[0].ok,false)
    await db.query("update test_login_limits set blocked_until=clock_timestamp()-interval '1 second' where student_id=1")
    assert.equal((await db.query("select verify_test_student(1,'1234') as ok")).rows[0].ok,true)
  })
})
