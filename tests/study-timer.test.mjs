import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import ts from 'typescript'
const migration = readFileSync(new URL('../supabase/study_timer_migration.sql', import.meta.url), 'utf8')
const token = '11111111-1111-1111-1111-111111111111'
async function setup(t) {
 const db = new PGlite(); t.after(() => db.close())
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT null::uuid $$;
 CREATE TABLE students(id int PRIMARY KEY); INSERT INTO students VALUES(1),(2);
 CREATE TABLE teachers(user_id uuid, approved boolean, role text);
 CREATE TABLE class_students(student_id int,class_id bigint);
 CREATE FUNCTION staff_can_access_class(bigint) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
 CREATE TABLE client_sessions(token uuid,subject_id int,subject_type text,expires_at timestamptz);
 INSERT INTO client_sessions VALUES('${token}',1,'student',now()+interval '1 day');`)
 await db.exec(migration); await db.exec(migration)
 return db
}
async function action(db,a,goal='오답 정리') { return (await db.query('SELECT study_timer($1::uuid,$2,$3,1,1,2) AS data',[token,a,goal])).rows[0].data }
async function report(db) { return (await db.query('SELECT study_report($1::uuid) AS data',[token])).rows[0].data }

test('display catches up after suspended ticks and freezes while paused',async()=>{
 const source=readFileSync(new URL('../lib/study.ts',import.meta.url),'utf8')
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText
 const {studyDisplaySeconds,studyClock}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'))
 const start=Date.parse('2026-10-13T00:00:00Z')
 const session={mode:'stopwatch',elapsed_seconds:20,remaining_seconds:1000,running_since:new Date(start).toISOString()}
 assert.equal(studyDisplaySeconds(session,start+300000),320)
 assert.equal(studyDisplaySeconds({...session,running_since:null},start+300000),20)
 assert.equal(studyDisplaySeconds({...session,mode:'timer'},start+300000),700)
 assert.equal(studyDisplaySeconds({...session,mode:'timer'},start+2000000),0)
 assert.equal(studyClock(3661),'01:01:01')
})

test('stopwatch reconstructs screen-off elapsed time and excludes paused time',async t=>{
 const db=await setup(t)
 const started=(await db.query("SELECT study_timer($1::uuid,'start','study',25,5,4,'stopwatch') AS data",[token])).rows[0].data.session
 assert.equal(started.mode,'stopwatch'); assert.equal(started.remaining_seconds,86400)
 await db.exec("UPDATE study_sessions SET running_since=clock_timestamp()-interval '5 minutes'")
 const restored=(await action(db,'sync')).session
 assert.equal(restored.elapsed_seconds,300); assert.equal(restored.remaining_seconds,86100)
 await action(db,'pause'); await action(db,'sync')
 assert.equal((await report(db)).totals[0].today,300)
 await action(db,'resume')
 await db.exec("UPDATE study_sessions SET running_since=clock_timestamp()-interval '20 seconds'")
 await action(db,'finish')
 assert.equal((await report(db)).history[0].focus_seconds,320)
})

test('screen-off past focus and rest returns ready without counting additional focus',async t=>{
 const db=await setup(t); await action(db,'start')
 await db.exec("UPDATE study_sessions SET running_since=clock_timestamp()-interval '30 minutes'")
 assert.equal((await action(db,'sync')).session.phase,'ready')
 assert.equal((await report(db)).totals[0].today,60)
})
test('timer identity, validation, single active session and private table access',async t=>{
 const db=await setup(t)
 assert.equal((await action(db,'sync')).session,null)
 await assert.rejects(db.query("SELECT study_timer(null,'start','x')"),/expired/)
 await assert.rejects(action(db,'start',''),/check constraint/)
 await action(db,'start'); await assert.rejects(action(db,'start'),/already running/)
 await assert.rejects(db.query('SELECT study_report($1::uuid,2)',[token]),/Unauthorized/)
 await db.exec('SET ROLE anon'); await assert.rejects(db.query('SELECT * FROM study_sessions'),/permission denied/)
})
test('server caps unattended focus, break excluded, next focus requires explicit action',async t=>{
 const db=await setup(t); await action(db,'start')
 await db.exec("UPDATE study_sessions SET running_since=clock_timestamp()-interval '90 seconds'")
 const result=await action(db,'sync'); assert.equal(result.session.phase,'break')
 let r=await report(db); assert.equal(r.totals[0].today,60)
 await db.exec("UPDATE study_sessions SET running_since=clock_timestamp()-interval '10 minutes'")
 assert.equal((await action(db,'sync')).session.phase,'ready')
 assert.equal((await report(db)).totals[0].today,60)
 assert.equal((await action(db,'next')).session.round,2)
 await db.exec("UPDATE study_sessions SET running_since=clock_timestamp()-interval '2 minutes'")
 assert.equal((await action(db,'sync')).session,null)
 assert.equal((await report(db)).totals[0].today,120)
})
test('pause is idempotent and finish preserves partial focus without break time',async t=>{
 const db=await setup(t); await action(db,'start')
 await db.exec("UPDATE study_sessions SET running_since=clock_timestamp()-interval '20 seconds'")
 assert.equal((await action(db,'pause')).session.remaining_seconds,40)
 await action(db,'pause'); assert.equal((await report(db)).totals[0].today,20)
 await action(db,'resume'); await action(db,'finish'); await action(db,'finish')
 const r=await report(db); assert.equal(r.history.length,1); assert.equal(r.history[0].focus_seconds,20)
})
test('KST midnight overlaps are apportioned, totals are not limited by history pagination',async t=>{
 const db=await setup(t); const s=(await action(db,'start')).session
 await db.query(`INSERT INTO study_segments(session_id,started_at,ended_at) SELECT $1::uuid,
 (date_trunc('day',now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')-interval '30 seconds',
 (date_trunc('day',now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')+interval '30 seconds'`,[s.id])
 await db.exec("UPDATE study_sessions SET running_since=null,paused=true")
 const r=await report(db); assert.equal(r.totals[0].today,30); assert.equal(r.history[0].today_seconds,30); assert.equal(r.history[0].focus_seconds,60)
})
test('staff reports respect assigned classes and deny unapproved access',async t=>{
 const db=await setup(t); await action(db,'start')
 await assert.rejects(db.query('SELECT study_report()'),/Unauthorized/)
 await db.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '22222222-2222-2222-2222-222222222222'::uuid $$;
 INSERT INTO teachers VALUES('22222222-2222-2222-2222-222222222222',true,'teacher');`)
 assert.deepEqual((await db.query('SELECT study_report(null,1) AS data')).rows[0].data.history,[])
 await db.exec('INSERT INTO class_students VALUES(1,7); CREATE OR REPLACE FUNCTION staff_can_access_class(bigint) RETURNS boolean LANGUAGE sql AS $$ SELECT COALESCE($1=7,false) $$;')
 assert.equal((await db.query('SELECT study_report(null,1) AS data')).rows[0].data.history.length,1)
})
