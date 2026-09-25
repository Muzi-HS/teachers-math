import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

async function setup() {
  const db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA extensions;
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    CREATE TABLE parents(id int PRIMARY KEY, phone text, pin_hash text NOT NULL);
    CREATE TABLE students(id int PRIMARY KEY, name text, phone text, birth_year int, school text, pin_hash text NOT NULL);
    CREATE TABLE parent_students(parent_id int, student_id int);
    CREATE TABLE records(
      id int PRIMARY KEY, student_id int, date date NOT NULL, hw_rate int,
      is_draft boolean NOT NULL DEFAULT false, released_to_parent boolean NOT NULL DEFAULT true,
      viewed_at timestamptz, edited_at timestamptz, class_id bigint
    );
    CREATE TABLE record_comments(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, record_id bigint NOT NULL, sender_type text NOT NULL, content text NOT NULL, created_at timestamptz DEFAULT now());
    CREATE TABLE record_test_items(id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, record_id int NOT NULL, test_id int, t_total int, t_cor int, t_score int);
    INSERT INTO parents VALUES(1, '01011112222', extensions.crypt('1234', extensions.gen_salt('bf')));
    INSERT INTO students VALUES(2, 'Test student', '01033334444', 2010, 'Test school', extensions.crypt('0000', extensions.gen_salt('bf')));
    INSERT INTO parent_students VALUES(1,2);
  `)
  for (const file of [
    '../supabase/pin_null_guard_migration.sql',
    '../supabase/parent_student_session_gateway_migration.sql',
    '../supabase/pin_rate_limit_and_logout_migration.sql',
  ]) {
    await db.exec(readFileSync(new URL(file, import.meta.url), 'utf8'))
  }
  return db
}

test('5 consecutive wrong PINs lock the account for a while, correct PIN resets the counter', async t => {
  const db = await setup()
  t.after(() => db.close())
  await db.exec('SET ROLE anon')

  // 틀린 PIN은 예외가 아니라 빈 결과로 온다 (실패 기록이 같은 트랜잭션에서 롤백되지 않도록)
  for (let i = 0; i < 4; i++) {
    const rows = (await db.query("SELECT * FROM verify_parent_pin('01011112222','9999')")).rows
    assert.equal(rows.length, 0)
  }
  // 4번째까지는 아직 잠기지 않아서, 맞는 PIN이면 로그인이 성공해야 한다
  const ok = (await db.query("SELECT * FROM verify_parent_pin('01011112222','1234')")).rows[0]
  assert.ok(ok.session_token)

  // 다시 5번 연속 틀리면 잠긴다
  for (let i = 0; i < 5; i++) {
    const rows = (await db.query("SELECT * FROM verify_parent_pin('01011112222','9999')")).rows
    assert.equal(rows.length, 0)
  }
  // 이제 맞는 PIN을 넣어도 잠금 때문에 거부되어야 한다 (이때는 진짜 예외)
  await assert.rejects(
    db.query("SELECT * FROM verify_parent_pin('01011112222','1234')"),
    '5회 연속 실패 후에는 맞는 PIN도 잠금 기간 동안 거부되어야 한다',
  )
})

test('rate limiting applies independently per account and PIN change respects an existing lock', async t => {
  const db = await setup()
  t.after(() => db.close())
  await db.exec('SET ROLE anon')

  for (let i = 0; i < 5; i++) {
    const rows = (await db.query("SELECT * FROM verify_student_pin('01033334444','9999')")).rows
    assert.equal(rows.length, 0)
  }
  // 학생 계정이 잠겨도 학부모 계정은 영향 없어야 한다
  const parentOk = (await db.query("SELECT * FROM verify_parent_pin('01011112222','1234')")).rows[0]
  assert.ok(parentOk.session_token)

  // 로그인 잠금 중에는 PIN 변경(update_student_pin) 시도도 거부되어야 한다
  await assert.rejects(
    db.query("SELECT update_student_pin(2,'0000','5678')"),
    '로그인 잠금 중에는 PIN 변경 시도도 거부되어야 한다',
  )
})

test('logout invalidates the session token immediately', async t => {
  const db = await setup()
  t.after(() => db.close())
  await db.exec('SET ROLE anon')
  const token = (await db.query("SELECT * FROM verify_parent_pin('01011112222','1234')")).rows[0].session_token

  assert.equal((await db.query('SELECT session_owns_student($1,$2) AS ok', [token, 2])).rows[0].ok, true)
  await db.query('SELECT client_logout($1)', [token])
  assert.equal(
    (await db.query('SELECT session_owns_student($1,$2) AS ok', [token, 2])).rows[0].ok,
    false,
    '로그아웃한 토큰은 더 이상 어떤 것도 소유하고 있으면 안 된다',
  )
})
