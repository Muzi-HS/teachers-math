import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('analytics aggregates more than 1000 rows, preserves KST boundaries and limits access to approved admins', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  const admin = '00000000-0000-0000-0000-000000000001'
  const teacher = '00000000-0000-0000-0000-000000000002'
  const pending = '00000000-0000-0000-0000-000000000003'
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE TABLE teachers(user_id uuid,role text,approved boolean);
    INSERT INTO teachers VALUES('${admin}','admin',true),('${teacher}','teacher',true),('${pending}','admin',false);
    CREATE TABLE site_visits(visited_at timestamptz,is_mobile boolean);
    CREATE TABLE consultation_requests(created_at timestamptz);
    CREATE TABLE inquiry_messages(sender_type text,is_read boolean);
    INSERT INTO inquiry_messages VALUES('parent',false),('parent',true),('admin',false);
  `)
  const sql = readFileSync(new URL('../supabase/analytics_summary_migration.sql', import.meta.url), 'utf8')
  await db.exec(sql)
  await db.exec(sql)
  const summary = async () => (await db.query("SELECT admin_analytics_summary('2026-03-31T16:00:00Z') AS summary")).rows[0].summary
  for (const id of ['', teacher, pending]) {
    await db.query("SELECT set_config('test.uid',$1,false)", [id])
    await assert.rejects(summary(), /승인된 관리자/)
  }
  await db.query("SELECT set_config('test.uid',$1,false)", [admin])
  await db.exec('SET ROLE anon')
  await assert.rejects(summary(), /permission denied/)
  await db.exec('SET ROLE authenticated')
  const empty = await summary()
  assert.equal(empty.totalVisits, 0)
  assert.equal(empty.mobilePct, 0)
  assert.equal(empty.dailyChartData.length, 14)
  assert.equal(empty.monthlyChartData.length, 12)
  assert.ok(empty.dailyChartData.every(day => day.count === 0))
  await db.exec('RESET ROLE')
  await db.exec(`
    INSERT INTO site_visits SELECT '2026-03-31T15:30:00Z'::timestamptz, i % 2 = 0 FROM generate_series(1,1500) i;
    INSERT INTO site_visits VALUES('2026-03-31T14:59:59Z',false),('2026-03-31T15:00:00Z',true),('2024-01-01Z',true),('2027-01-01Z',true);
    INSERT INTO consultation_requests SELECT '2026-03-31T15:30:00Z'::timestamptz FROM generate_series(1,1200);
    INSERT INTO consultation_requests VALUES('2026-03-31T14:59:59Z'),('2024-01-01Z');
  `)
  const result = await summary()
  assert.equal(result.totalVisits, 1502)
  assert.equal(result.todayCount, 1501)
  assert.equal(result.monthCount, 1501)
  assert.equal(result.consultThisMonth, 1200)
  assert.equal(result.consultTotal, 1201)
  assert.equal(result.mobilePct, 50)
  assert.equal(result.unreadInquiries, 1)
  assert.equal(result.pendingTeachers, 1)
  assert.deepEqual(result.dailyChartData.at(-1), { date: '04-01', count: 1501 })
  assert.deepEqual(result.monthlyChartData.at(-2), { month: '26.03', visits: 1, consults: 1 })
  assert.deepEqual(result.monthlyChartData.at(-1), { month: '26.04', visits: 1501, consults: 1200 })
  assert.equal(new Set(result.monthlyChartData.map(month => month.month)).size, 12)
  const marchEnd = (await db.query("SELECT admin_analytics_summary('2026-03-31T14:30:00Z') AS summary")).rows[0].summary
  assert.deepEqual(marchEnd.monthlyChartData.map(month => month.month), [
    '25.04','25.05','25.06','25.07','25.08','25.09','25.10','25.11','25.12','26.01','26.02','26.03',
  ])
  const leapDay = (await db.query("SELECT admin_analytics_summary('2024-02-29T12:00:00Z') AS summary")).rows[0].summary
  assert.equal(leapDay.dailyChartData.at(-1).date, '02-29')
  assert.equal(leapDay.monthlyChartData.at(-1).month, '24.02')
  await db.exec("SET TIME ZONE 'America/New_York'")
  assert.deepEqual(await summary(), result)
  await assert.rejects(db.query('SELECT admin_analytics_summary(NULL)'))
})
