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
    CREATE TABLE students(id int PRIMARY KEY, name text, phone text, school text, birth_year int, pin_hash text NOT NULL);
    CREATE TABLE parent_students(parent_id int, student_id int);
    CREATE TABLE class_students(class_id int, student_id int);
    CREATE TABLE records(
      id int PRIMARY KEY, student_id int, date date NOT NULL, hw_rate int,
      is_draft boolean NOT NULL DEFAULT false, released_to_parent boolean NOT NULL DEFAULT true,
      viewed_at timestamptz, edited_at timestamptz, class_id bigint
    );
    CREATE TABLE record_comments(
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, record_id bigint NOT NULL,
      sender_type text NOT NULL, content text NOT NULL, created_at timestamptz DEFAULT now()
    );
    CREATE TABLE record_test_items(
      id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, record_id int NOT NULL,
      test_id int, t_total int, t_cor int, t_score int
    );
    CREATE TABLE student_coupons(
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, student_id bigint NOT NULL,
      milestone int NOT NULL, streak_value int NOT NULL, code text NOT NULL UNIQUE,
      claimed_at timestamptz NOT NULL DEFAULT now(), used boolean NOT NULL DEFAULT false, used_at timestamptz
    );
    CREATE TABLE student_streak_state(
      student_id bigint PRIMARY KEY, last_seen_streak int NOT NULL DEFAULT 0,
      last_prompted_milestone int NOT NULL DEFAULT 0, last_claimed_date date,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE fcm_tokens(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, parent_id int, student_id bigint, token text NOT NULL);
    CREATE TABLE notice_comments(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, notice_id bigint NOT NULL, parent_id int);

    ALTER TABLE parents ENABLE ROW LEVEL SECURITY;
    ALTER TABLE students ENABLE ROW LEVEL SECURITY;
    ALTER TABLE parent_students ENABLE ROW LEVEL SECURITY;
    ALTER TABLE class_students ENABLE ROW LEVEL SECURITY;
    ALTER TABLE student_coupons ENABLE ROW LEVEL SECURITY;
    ALTER TABLE student_streak_state ENABLE ROW LEVEL SECURITY;
    ALTER TABLE fcm_tokens ENABLE ROW LEVEL SECURITY;
    -- 옛 anon 전체 허용 정책 재현 — 마이그레이션이 실제로 지우는지 검증한다.
    CREATE POLICY parents_select_anon ON parents FOR SELECT TO anon USING (true);
    CREATE POLICY students_select_anon ON students FOR SELECT TO anon USING (true);
    CREATE POLICY parent_students_select_anon ON parent_students FOR SELECT TO anon USING (true);
    CREATE POLICY class_students_select_anon ON class_students FOR SELECT TO anon USING (true);
    CREATE POLICY student_coupons_select_anon ON student_coupons FOR SELECT TO anon USING (true);
    CREATE POLICY student_coupons_insert_anon ON student_coupons FOR INSERT TO anon WITH CHECK (true);
    CREATE POLICY student_streak_state_anon ON student_streak_state FOR ALL TO anon USING (true) WITH CHECK (true);
    CREATE POLICY fcm_tokens_insert_anon ON fcm_tokens FOR INSERT TO anon WITH CHECK (true);
    CREATE POLICY fcm_tokens_update_anon ON fcm_tokens FOR UPDATE TO anon USING (true) WITH CHECK (true);
    GRANT SELECT ON parents, students, parent_students, class_students TO anon;
    GRANT SELECT, INSERT ON student_coupons TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON student_streak_state TO anon;
    GRANT INSERT, UPDATE ON fcm_tokens TO anon;

    INSERT INTO parents VALUES(1, '01011112222', extensions.crypt('1234', extensions.gen_salt('bf')));
    INSERT INTO parents VALUES(2, '01055552222', extensions.crypt('1234', extensions.gen_salt('bf')));
    INSERT INTO students VALUES(10, 'Child A', '01033334444', 'School A', 2012, extensions.crypt('0000', extensions.gen_salt('bf')));
    INSERT INTO students VALUES(20, 'Other child', '01099994444', 'School B', 2013, extensions.crypt('0000', extensions.gen_salt('bf')));
    INSERT INTO parent_students VALUES(1, 10);
    INSERT INTO parent_students VALUES(2, 20);
    INSERT INTO class_students VALUES(500, 10);
  `)
  const pinMigration = readFileSync(new URL('../supabase/pin_null_guard_migration.sql', import.meta.url), 'utf8')
  await db.exec(pinMigration)
  const sessionMigration = readFileSync(new URL('../supabase/parent_student_session_gateway_migration.sql', import.meta.url), 'utf8')
  await db.exec(sessionMigration)
  const migration = readFileSync(new URL('../supabase/parent_student_directory_and_rewards_gateway_migration.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  return db
}

async function loginParent(db, phone, pin) {
  return (await db.query('SELECT * FROM verify_parent_pin($1,$2)', [phone, pin])).rows[0].session_token
}
async function loginStudent(db, phone, pin) {
  return (await db.query('SELECT * FROM verify_student_pin($1,$2)', [phone, pin])).rows[0].session_token
}

test('directory tables lock out anon direct access after the migration', async t => {
  const db = await setup()
  t.after(() => db.close())
  await db.exec('SET ROLE anon')
  for (const table of ['parents', 'students', 'parent_students', 'class_students', 'student_coupons', 'student_streak_state']) {
    const rows = await db.query(`SELECT * FROM ${table}`)
    assert.equal(rows.rows.length, 0, `${table} should not be directly readable by anon anymore`)
  }
  await assert.rejects(
    db.query("INSERT INTO student_coupons(student_id, milestone, streak_value, code) VALUES (10, 30, 30, 'FAKE-999') RETURNING id"),
    'anon should not be able to fabricate a coupon directly anymore',
  )
})

test('phone lookups return only an exact match, never the whole table', async t => {
  const db = await setup()
  t.after(() => db.close())
  await db.exec('SET ROLE anon')
  const hit = await db.query('SELECT * FROM lookup_parent_by_phone($1)', ['010-1111-2222'])
  assert.equal(hit.rows.length, 1)
  assert.equal(hit.rows[0].id, 1)
  const miss = await db.query('SELECT * FROM lookup_parent_by_phone($1)', ['01000000000'])
  assert.equal(miss.rows.length, 0)

  // parent 1과 parent 2는 일부러 전화번호 뒷 4자리가 같다(2222) — 마지막 4자리만 보는
  // 기존 설계상 두 가족이 모두 후보로 나와야 한다.
  const suffix = await db.query('SELECT * FROM lookup_family_by_phone_suffix($1)', ['2222'])
  assert.equal(suffix.rows.length, 2, '뒷자리가 같은 두 가족이 모두 나와야 한다(기존 설계 유지)')
  const invalid = await db.query('SELECT * FROM lookup_family_by_phone_suffix($1)', ["' OR 1=1 --"])
  assert.equal(invalid.rows.length, 0, '숫자 4자리가 아니면 아무 것도 반환하지 않아야 한다')

  // 함께 발급된 학부모 세션 토큰으로 그 가족의 자녀만 알림 등록에 쓸 수 있어야 한다
  const row1 = suffix.rows.find(r => r.parent_id === 1)
  assert.ok(row1.parent_session_token)
  const ownsOwn = await db.query('SELECT session_owns_student($1,$2) AS ok', [row1.parent_session_token, 10])
  assert.equal(ownsOwn.rows[0].ok, true)
  const ownsOther = await db.query('SELECT session_owns_student($1,$2) AS ok', [row1.parent_session_token, 20])
  assert.equal(ownsOther.rows[0].ok, false, '다른 가족의 학생은 이 토큰으로 등록할 수 없어야 한다')
})

test('class_students gateway only reveals the caller\'s own student', async t => {
  const db = await setup()
  t.after(() => db.close())
  await db.exec('SET ROLE anon')
  const token = await loginStudent(db, '01033334444', '0000')
  const own = await db.query('SELECT * FROM client_class_students($1,$2)', [token, 10])
  assert.equal(own.rows.length, 1)
  const other = await db.query('SELECT * FROM client_class_students($1,$2)', [token, 20])
  assert.equal(other.rows.length, 0)
})

test('streak status is recomputed server-side and a claim cannot be forged', async t => {
  const db = await setup()
  t.after(() => db.close())
  await db.exec('SET ROLE anon')
  const token = await loginStudent(db, '01033334444', '0000')

  // 아직 스트릭이 없으면 프롬프트도 없어야 한다
  const none = await db.query('SELECT client_streak_status($1) AS s', [token])
  assert.equal(none.rows[0].s, null)
  await assert.rejects(db.query('SELECT client_claim_streak_coupon($1)', [token]), '스트릭 없이 쿠폰을 요구하면 거부되어야 한다')

  await db.exec('RESET ROLE')
  const dates = Array.from({ length: 5 }, (_, i) => `2026-01-0${i + 1}`)
  for (let i = 0; i < 5; i++) {
    await db.query('INSERT INTO records(id, student_id, date, hw_rate) VALUES ($1,10,$2,100)', [100 + i, dates[i]])
  }
  await db.exec('SET ROLE anon')

  const status = (await db.query('SELECT client_streak_status($1) AS s', [token])).rows[0].s
  assert.equal(status.milestone, 5)
  assert.equal(status.streakValue, 5)

  // 다른 학생(20) 행세로는 절대 쿠폰을 받을 수 없다 — 학생 자신의 토큰으로만 가능
  const otherToken = await loginStudent(db, '01099994444', '0000')
  await assert.rejects(db.query('SELECT client_claim_streak_coupon($1)', [otherToken]), '기록이 없는 학생은 쿠폰을 받을 수 없어야 한다')

  const claim = (await db.query('SELECT client_claim_streak_coupon($1) AS c', [token])).rows[0].c
  assert.equal(claim.milestone, 5)
  assert.ok(claim.code)

  await db.exec('RESET ROLE')
  const coupon = (await db.query('SELECT * FROM student_coupons WHERE student_id = 10')).rows[0]
  assert.equal(coupon.milestone, 5)
  assert.equal(coupon.streak_value, 5)
  await db.exec('SET ROLE anon')

  // 방금 받았으니 다시 받을 건 없어야 한다 (같은 마일스톤 재청구 방지)
  await assert.rejects(db.query('SELECT client_claim_streak_coupon($1)', [token]))

  const list = await db.query('SELECT * FROM client_coupons($1)', [token])
  assert.equal(list.rows.length, 1)
  const listOther = await db.query('SELECT * FROM client_coupons($1)', [otherToken])
  assert.equal(listOther.rows.length, 0)
})

test('session_subject resolves the true owner for the FCM edge function to check', async t => {
  const db = await setup()
  t.after(() => db.close())
  await db.exec('SET ROLE anon')
  const parentToken = await loginParent(db, '01011112222', '1234')
  const row = (await db.query('SELECT * FROM session_subject($1)', [parentToken])).rows[0]
  assert.equal(row.subject_type, 'parent')
  assert.equal(row.subject_id, 1)
  const bad = await db.query('SELECT * FROM session_subject($1)', ['00000000-0000-0000-0000-000000000000'])
  assert.equal(bad.rows.length, 0)
})

test('notice_comment_authors only exposes commenters actually on that notice', async t => {
  const db = await setup()
  t.after(() => db.close())
  await db.query('INSERT INTO notice_comments(notice_id, parent_id) VALUES (1, 1)')
  await db.exec('SET ROLE anon')
  const authors = await db.query('SELECT * FROM notice_comment_authors($1)', [1])
  assert.equal(authors.rows.length, 1)
  assert.equal(authors.rows[0].parent_id, 1)
  assert.deepEqual(authors.rows[0].child_names, ['Child A'])
  const empty = await db.query('SELECT * FROM notice_comment_authors($1)', [999])
  assert.equal(empty.rows.length, 0, '댓글을 안 남긴 공지에서는 아무도 노출되면 안 된다')
})
