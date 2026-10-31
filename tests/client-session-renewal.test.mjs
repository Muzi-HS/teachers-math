import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('renewal preserves valid existing tokens, respects opt-out and cannot revive expired or revoked tokens', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE client_sessions(token uuid PRIMARY KEY, subject_type text, subject_id int, expires_at timestamptz);
    ALTER TABLE client_sessions ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON client_sessions FROM PUBLIC, anon, authenticated;
    INSERT INTO client_sessions VALUES
      ('00000000-0000-0000-0000-000000000001','parent',1,now()+interval '1 day'),
      ('00000000-0000-0000-0000-000000000002','student',2,now()-interval '1 day');`)
  const migration = readFileSync(new URL('../supabase/client_session_renewal_migration.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  await db.exec(migration)
  const active = '00000000-0000-0000-0000-000000000001'
  const expired = '00000000-0000-0000-0000-000000000002'
  const before = (await db.query('SELECT expires_at FROM client_sessions WHERE token=$1', [active])).rows[0].expires_at
  await db.exec('SET ROLE anon')
  assert.deepEqual((await db.query('SELECT * FROM client_refresh_session($1,false)', [active])).rows, [{ subject_type: 'parent', subject_id: 1 }])
  await db.exec('RESET ROLE')
  assert.deepEqual((await db.query('SELECT expires_at FROM client_sessions WHERE token=$1', [active])).rows[0].expires_at, before)
  await db.exec('SET ROLE anon')
  assert.equal((await db.query('SELECT * FROM client_refresh_session($1,true)', [active])).rows.length, 1)
  assert.equal((await db.query('SELECT * FROM client_refresh_session($1,true)', [expired])).rows.length, 0)
  await assert.rejects(db.query('SELECT * FROM client_sessions'))
  await db.exec('RESET ROLE')
  assert.equal((await db.query("SELECT expires_at > now()+interval '29 days' AS extended FROM client_sessions WHERE token=$1", [active])).rows[0].extended, true)
  await db.query('DELETE FROM client_sessions WHERE token=$1', [active])
  await db.exec('SET ROLE authenticated')
  assert.equal((await db.query('SELECT * FROM client_refresh_session($1,true)', [active])).rows.length, 0)
})
