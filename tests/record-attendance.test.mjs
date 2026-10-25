import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('attendance migration preserves legacy records and synchronizes all four statuses', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`CREATE TABLE records(id integer PRIMARY KEY, late boolean);
    INSERT INTO records VALUES(1,false),(2,true);`)
  const sql = readFileSync(new URL('../supabase/record_attendance_status_migration.sql', import.meta.url), 'utf8')
  await db.exec(sql)
  await db.exec(sql)
  assert.deepEqual((await db.query('SELECT attendance_status FROM records ORDER BY id')).rows,
    [{ attendance_status: 'on_time' }, { attendance_status: 'late' }])
  await db.exec(`INSERT INTO records(id,late) VALUES(3,true);
    INSERT INTO records VALUES(4,true,'absence'),(5,true,'early_leave');`)
  assert.deepEqual((await db.query('SELECT late FROM records WHERE id IN (4,5) ORDER BY id')).rows,
    [{ late: false }, { late: false }])
  await db.exec("UPDATE records SET attendance_status='late' WHERE id=4")
  assert.equal((await db.query('SELECT late FROM records WHERE id=4')).rows[0].late, true)
  await db.exec('UPDATE records SET late=false WHERE id=3')
  assert.equal((await db.query('SELECT attendance_status FROM records WHERE id=3')).rows[0].attendance_status, 'on_time')
  await assert.rejects(db.exec("UPDATE records SET attendance_status='invalid' WHERE id=1"), /check constraint/)
})
