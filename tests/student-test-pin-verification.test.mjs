import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

test('exam PIN supports extensions.pgcrypto and preserves hash verification, lockout and grants', async t => {
  const db = new PGlite({ extensions: { pgcrypto } })
  t.after(() => db.close())
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA extensions;
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    CREATE TABLE students(id bigint PRIMARY KEY, pin_hash text NOT NULL);
    CREATE TABLE test_login_limits(student_id bigint PRIMARY KEY REFERENCES students(id), failures int NOT NULL DEFAULT 0, blocked_until timestamptz);
    INSERT INTO students VALUES(1, extensions.crypt('1234', extensions.gen_salt('bf')));
  `)
  const fix = readFileSync(new URL('../supabase/student_test_pin_verification_fix.sql', import.meta.url), 'utf8')
  // Reproduce the previous function's restricted search path with pgcrypto in Supabase's extensions schema.
  await db.exec(fix.replace('public, extensions, pg_temp AS', 'public AS'))
  await assert.rejects(db.query("SELECT verify_test_student(1, '1234')"), /function crypt\(text, text\) does not exist/)
  await db.exec(fix)
  await db.exec(fix)
  await db.exec('SET ROLE anon')
  await assert.rejects(db.query("SELECT verify_test_student(1, '1234')"), /permission denied/)
  await db.exec('SET ROLE authenticated')
  await assert.rejects(db.query("SELECT verify_test_student(1, '1234')"), /permission denied/)
  await db.exec('SET ROLE service_role')
  const verify = async pin => (await db.query('SELECT verify_test_student(1, $1) AS ok', [pin])).rows[0].ok
  assert.equal(await verify('1234'), true)
  assert.equal(await verify(null), false)
  assert.equal(await verify('123'), false)
  assert.equal(await verify('1234'), true)
  for (let i = 0; i < 5; i++) assert.equal(await verify('9999'), false)
  assert.equal(await verify('1234'), false)
  await db.exec("RESET ROLE; UPDATE test_login_limits SET blocked_until = clock_timestamp() - interval '1 second' WHERE student_id = 1; SET ROLE service_role;")
  assert.equal(await verify('1234'), true)
  assert.equal((await db.query("SELECT verify_test_student(999, '1234') AS ok")).rows[0].ok, false)
  await db.exec('RESET ROLE')
  const limit = (await db.query('SELECT failures, blocked_until FROM test_login_limits WHERE student_id = 1')).rows[0]
  assert.equal(limit.failures, 0)
  assert.equal(limit.blocked_until, null)
})
