import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const read = file => readFileSync(new URL(`../supabase/${file}`, import.meta.url), 'utf8')
const timers = read('study_timer_migration.sql')
const notifications = read('study_timer_notifications_migration.sql')
const cron = read('study_timer_notifications_cron.sql')
const dispatcher = cron.slice(cron.indexOf('CREATE OR REPLACE FUNCTION'), cron.indexOf('DO $$ BEGIN'))
const token = '11111111-1111-1111-1111-111111111111'
async function setup(t) {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE TABLE students(id int PRIMARY KEY); INSERT INTO students VALUES(1),(2);
    CREATE TABLE teachers(user_id uuid,approved boolean,role text);
    CREATE TABLE class_students(student_id int,class_id bigint);
    CREATE FUNCTION staff_can_access_class(bigint) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE TABLE client_sessions(token uuid,subject_id int,subject_type text,expires_at timestamptz);
    INSERT INTO client_sessions VALUES('${token}',1,'student',now()+interval '1 day');
    CREATE SCHEMA net;
    CREATE TABLE net.requests(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,body jsonb);
    CREATE TABLE net._http_response(id bigint,status_code int,content text);
    CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds int) RETURNS bigint LANGUAGE sql AS $$ INSERT INTO net.requests(body) VALUES(body) RETURNING id $$;`)
  await db.exec(timers); await db.exec(notifications); await db.exec(notifications); await db.exec(dispatcher)
  return db
}
async function act(db, action, focus = 1, rest = 1, rounds = 2, mode = 'timer') {
  return (await db.query('SELECT study_timer($1::uuid,$2,$3,$4,$5,$6,$7) AS result', [token, action, '오답 정리', focus, rest, rounds, mode])).rows[0].result
}
async function events(db) { return (await db.query('SELECT * FROM study_push_events ORDER BY due_at,id')).rows }
async function dispatch(db) { await db.query('SELECT dispatch_study_push_events()') }

test('phase deadlines survive repeated sync, pause cancels, resume reschedules, early finish cancels', async t => {
  const db = await setup(t)
  const session = (await act(db, 'start')).session
  let rows = await events(db)
  assert.equal(rows.length, 2); assert.deepEqual(rows.map(e => e.phase), ['focus', 'break'])
  assert.equal(Date.parse(rows[1].due_at) - Date.parse(rows[0].due_at), 60000)
  const initialDeadline = rows[0].due_at
  await act(db, 'sync'); await act(db, 'sync')
  assert.equal((await events(db)).length, 2)
  assert.equal(Date.parse((await events(db))[0].due_at), Date.parse(initialDeadline))
  await act(db, 'pause')
  assert.ok((await events(db)).every(e => e.state === 'cancelled'))
  await dispatch(db); assert.equal((await db.query('SELECT * FROM net.requests')).rows.length, 0)
  await act(db, 'resume')
  rows = await events(db); assert.ok(rows.every(e => e.state === 'pending'))
  assert.ok(Date.parse(rows[0].due_at) >= Date.parse(initialDeadline))
  assert.ok(rows.every(e => e.student_id === 1 && e.session_id === session.id))
  await act(db, 'finish'); await dispatch(db)
  assert.ok((await events(db)).every(e => e.state === 'cancelled'))
})

test('both end notifications dispatch with the browser closed and do not repeat after reconnection', async t => {
  const db = await setup(t)
  await act(db, 'start')
  await db.exec("UPDATE study_sessions SET running_since=clock_timestamp()-interval '125 seconds'")
  await dispatch(db)
  const requests = (await db.query('SELECT * FROM net.requests ORDER BY id')).rows
  assert.equal(requests.length, 2)
  assert.deepEqual(requests.map(r => r.body.title), ['집중 시간이 끝났어요', '휴식 시간이 끝났어요'])
  assert.ok(requests.every(r => r.body.student_id === 1 && r.body.link === '/student/study'))
  assert.notEqual(requests[0].body.tag, requests[1].body.tag)
  await dispatch(db); assert.equal((await db.query('SELECT * FROM net.requests')).rows.length, 2)
  await db.exec(`INSERT INTO net._http_response SELECT id,200,'{"sent":1,"total":1}' FROM net.requests`)
  await dispatch(db); assert.ok((await events(db)).every(e => e.state === 'sent'))
  assert.equal((await act(db, 'sync')).session.phase, 'ready')
  await dispatch(db); assert.equal((await db.query('SELECT * FROM net.requests')).rows.length, 2)
})

test('last focus has no break alert, stopwatches have none, and client roles cannot dispatch', async t => {
  const db = await setup(t)
  await act(db, 'start', 1, 1, 1)
  assert.deepEqual((await events(db)).map(e => e.phase), ['focus'])
  await act(db, 'finish')
  await act(db, 'start', 1, 0, 2, 'stopwatch')
  assert.equal((await events(db)).length, 1)
  await db.exec('SET ROLE anon')
  await assert.rejects(db.query('SELECT * FROM study_push_events'), /permission denied/)
  await assert.rejects(db.query('SELECT dispatch_study_push_events()'), /permission denied/)
})

test('failed delivery has bounded retries and stale notifications are not replayed', async t => {
  const db = await setup(t)
  await act(db, 'start', 1, 0, 1)
  await db.exec("UPDATE study_sessions SET running_since=clock_timestamp()-interval '65 seconds'")
  for (let i = 0; i < 3; i++) {
    await dispatch(db)
    await db.exec(`INSERT INTO net._http_response SELECT id,500,'{"error":"unavailable"}' FROM net.requests WHERE id NOT IN (SELECT id FROM net._http_response)`)
  }
  await dispatch(db)
  assert.equal((await events(db))[0].state, 'failed')
  assert.equal((await db.query('SELECT * FROM net.requests')).rows.length, 3)
  await act(db, 'finish'); await act(db, 'start', 1, 0, 1)
  await db.exec("UPDATE study_sessions SET running_since=clock_timestamp()-interval '10 minutes' WHERE ended_at IS NULL")
  await dispatch(db)
  assert.equal((await events(db)).filter(e => e.state === 'cancelled').length, 1)
  assert.equal((await db.query('SELECT * FROM net.requests')).rows.length, 3)
})
