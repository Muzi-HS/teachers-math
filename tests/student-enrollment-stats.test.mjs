import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('enrollment migration preserves deleted history, excludes tests, uses period first days and restricts access', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  const admin = '00000000-0000-0000-0000-000000000001'
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE TABLE teachers(user_id uuid,role text,approved boolean);
    INSERT INTO teachers VALUES('${admin}','admin',true);
    CREATE TABLE students(id bigint PRIMARY KEY,reg_date date);
    INSERT INTO students VALUES(1,'2024-01-01'),(2,'2024-01-15'),(3,'2023-12-01');`)
  const sql = readFileSync(new URL('../supabase/student_enrollment_stats_migration.sql', import.meta.url),'utf8')
  await db.exec(sql)
  const summary = async (grain = 'month') => (await db.query('SELECT admin_student_enrollment_summary(2024,$1) AS s',[grain])).rows[0].s
  await assert.rejects(summary(), /관리자/)
  await assert.rejects(db.query('SELECT admin_student_enrollment_export()'), /관리자/)
  await db.query("SELECT set_config('test.uid',$1,false)",[admin])
  // First-day departures are excluded; midmonth arrivals do not affect that month's first-day count.
  await db.exec(`UPDATE student_enrollment_history SET withdrawn_on='2024-02-01' WHERE student_id=1;
    UPDATE student_enrollment_history SET withdrawn_on='2024-02-14' WHERE student_id=2;
    INSERT INTO students VALUES(4,'2024-01-01'); UPDATE students SET is_test=true WHERE id=4;
    INSERT INTO students SELECT i,'2024-03-01' FROM generate_series(10,1209) i;`)
  let result = await summary()
  assert.equal(result.rows.length,12)
  const { tenure:januaryTenure,...january } = result.rows[0]
  assert.deepEqual(january,{ start:'2024-01-01',end:'2024-02-01',enrolled:2,registrations:2,withdrawals:0,earlyWithdrawals:0 })
  assert.equal(januaryTenure.asOf,'2024-01-01')
  assert.equal(januaryTenure.total,2)
  assert.deepEqual(januaryTenure.milestones.map(m => m.count),[1,0,0,0])
  assert.equal(result.rows[1].enrolled,2)
  assert.equal(result.rows[1].withdrawals,2)
  assert.equal(result.rows[1].earlyWithdrawals,1) // Jan 15 -> Feb 14 is exactly 30 days.
  assert.equal(result.rows[2].enrolled,1201)
  assert.equal(result.rows[2].registrations,1200)
  const q = await summary('quarter')
  const y = await summary('year')
  assert.equal(q.rows.length,4)
  assert.equal(q.rows[0].enrolled,2)
  assert.equal(q.rows[0].registrations,1202)
  assert.deepEqual(q.rows[0].tenure,januaryTenure)
  assert.equal(y.rows[0].enrolled,2)
  assert.equal(y.rows[0].withdrawals,2)
  assert.deepEqual(y.rows[0].tenure,januaryTenure)
  assert.equal(result.tenure.asOf,result.today)
  // Actual deletion retains a non-identifying record, including the KST withdrawal date.
  await db.exec('DELETE FROM students WHERE id=3; DELETE FROM students WHERE id=4;')
  const removed = (await db.query('SELECT *, (now() AT TIME ZONE \'Asia/Seoul\')::date AS today FROM student_enrollment_history WHERE student_id=3')).rows[0]
  assert.deepEqual(removed.withdrawn_on,removed.today)
  assert.equal((await db.query('SELECT is_test FROM student_enrollment_history WHERE student_id=4')).rows[0].is_test,true)
  await db.exec(sql) // Reapplying must not resurrect a withdrawn student or discard history.
  assert.deepEqual((await db.query('SELECT withdrawn_on FROM student_enrollment_history WHERE student_id=3')).rows[0].withdrawn_on,removed.today)
  await db.exec('SET ROLE authenticated')
  await assert.rejects(db.query('SELECT * FROM student_enrollment_history'), /permission denied/)
  await assert.rejects(db.query('DELETE FROM student_enrollment_history'), /permission denied/)
  await assert.rejects(db.query("SELECT student_enrollment_tenure('2024-01-01')"), /permission denied/)
  result = await summary()
  assert.equal(result.rows[2].registrations,1200)
  await assert.rejects(summary('invalid'), /조회 기간/)
  await db.query("SELECT set_config('test.uid','',false)")
  await assert.rejects(summary(), /관리자/)
  await db.exec('SET ROLE anon')
  await assert.rejects(summary(), /permission denied/)
  await assert.rejects(db.query('SELECT admin_student_enrollment_export()'), /permission denied/)
})

test('tenure ratios use calendar anniversaries, handle leap days, and exclude tests, withdrawals and unknown dates', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE TABLE teachers(user_id uuid,role text,approved boolean);
    CREATE TABLE students(id bigint PRIMARY KEY,reg_date date);
    INSERT INTO students VALUES(1,'2024-01-29'),(2,'2024-01-30'),(3,'2024-01-31'),(4,'2024-02-01'),
      (5,'2023-11-29'),(6,'2023-08-29'),(7,'2023-02-28'),(8,'2023-03-01'),(9,NULL),
      (10,'2022-01-01'),(11,'2020-01-01'),(12,'2020-01-01'),(13,'2024-03-01'),(14,'2024-02-29');`)
  await db.exec(readFileSync(new URL('../supabase/student_enrollment_stats_migration.sql',import.meta.url),'utf8'))
  await db.exec(`UPDATE students SET is_test=true WHERE id=10;
    UPDATE student_enrollment_history SET withdrawn_on='2024-02-29' WHERE student_id=11;
    UPDATE student_enrollment_history SET withdrawn_on='2024-03-01' WHERE student_id=12;`)
  const get = async date => (await db.query('SELECT student_enrollment_tenure($1::date) AS t',[date])).rows[0].t
  const leap = await get('2024-02-29')
  assert.equal(leap.total,11)
  assert.equal(leap.eligible,10)
  assert.equal(leap.unknownDates,1)
  assert.deepEqual(leap.milestones,[{ months:1,count:8,percent:80 },{ months:3,count:5,percent:50 },{ months:6,count:4,percent:40 },{ months:12,count:2,percent:20 }])
  assert.equal((await get('2024-02-28')).milestones[0].count,6)
  // A leap-day registration reaches one year on February 28 of the following year.
  await db.exec('UPDATE students SET is_test=true WHERE id<>14;')
  assert.equal((await get('2025-02-27')).milestones[3].count,0)
  assert.equal((await get('2025-02-28')).milestones[3].count,1)
  await db.exec('UPDATE students SET is_test=true WHERE id=14;')
  const empty = await get('2025-02-28')
  assert.equal(empty.total,0)
  assert.equal(empty.eligible,0)
  assert.ok(empty.milestones.every(m => m.count === 0 && m.percent === null))
})

test('recent trends cross year boundaries, cap at twelve periods and retain zero-event gaps without padding before data', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  const admin = '00000000-0000-0000-0000-000000000001'
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${admin}'::uuid $$;
    CREATE TABLE teachers(user_id uuid,role text,approved boolean);
    INSERT INTO teachers VALUES('${admin}','admin',true);
    CREATE TABLE students(id bigint PRIMARY KEY,reg_date date);`)
  await db.exec(readFileSync(new URL('../supabase/student_enrollment_stats_migration.sql',import.meta.url),'utf8'))
  const get = async grain => (await db.query('SELECT admin_student_enrollment_summary(NULL,$1) AS s',[grain])).rows[0].s
  assert.deepEqual((await get('month')).rows,[])
  await db.exec(`INSERT INTO students VALUES(1,'1990-01-01'),(2,'2099-01-01'); UPDATE students SET is_test=true WHERE id=1;`)
  assert.deepEqual((await get('month')).rows,[])
  await db.exec(`INSERT INTO students VALUES(3,(date_trunc('month',now() AT TIME ZONE 'Asia/Seoul') - interval '1 month' + interval '10 days')::date);`)
  let summary = await get('month')
  assert.equal(summary.rows.length,2)
  assert.equal(summary.rows[0].registrations,1)
  assert.equal(summary.rows[1].registrations,0)
  assert.equal(summary.rangeStart,summary.rows[0].start)
  await db.exec(`INSERT INTO students VALUES(4,(date_trunc('month',now() AT TIME ZONE 'Asia/Seoul') - interval '5 months')::date);`)
  summary = await get('month')
  assert.equal(summary.rows.length,6)
  assert.equal(summary.rows[2].registrations,0)
  assert.equal(summary.rows[2].withdrawals,0)
  await db.exec('UPDATE students SET is_test=true WHERE id=4;')
  assert.equal((await get('month')).rows.length,2)
  await db.exec(`INSERT INTO students VALUES(5,(date_trunc('year',now() AT TIME ZONE 'Asia/Seoul') - interval '20 years')::date);`)
  for (const [grain,step] of [['month','1 month'],['quarter','3 months'],['year','1 year']]) {
    summary = await get(grain)
    const expected = (await db.query(`SELECT to_char(date_trunc($1,now() AT TIME ZONE 'Asia/Seoul') - $2::interval*11,'YYYY-MM-DD') AS first,
      to_char(date_trunc($1,now() AT TIME ZONE 'Asia/Seoul'),'YYYY-MM-DD') AS last`,[grain,step])).rows[0]
    assert.equal(summary.rows.length,12)
    assert.equal(summary.rows[0].start,expected.first)
    assert.equal(summary.rows.at(-1).start,expected.last)
    for (let i=1;i<12;i++) assert.equal(summary.rows[i-1].end,summary.rows[i].start)
  }
  const exported = (await db.query('SELECT admin_student_enrollment_export() AS data')).rows[0].data
  assert.deepEqual(Object.keys(exported).sort(),['month','quarter','year'])
  assert.ok(exported.month.rows.length > 12)
  assert.ok(exported.quarter.rows.length > 12)
  assert.ok(exported.year.rows.length > 12)
  assert.equal(exported.month.rows.reduce((n,row) => n+row.registrations,0),2)
  assert.ok(!JSON.stringify(exported).includes('student_id'))
  for (const grain of ['month','quarter','year']) {
    assert.equal(exported[grain].scope,'all')
    assert.equal(exported[grain].today,exported.month.today)
    assert.deepEqual(exported[grain].tenure,exported.month.tenure)
  }
})
