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
      id int PRIMARY KEY, student_id int, date date NOT NULL,
      content text, homework text, hw_rate int, hw_cor int, attitude int,
      late boolean, has_test boolean, feedback text,
      is_draft boolean NOT NULL DEFAULT false, released_to_parent boolean NOT NULL DEFAULT false,
      viewed_at timestamptz, edited_at timestamptz, class_id bigint
    );
    CREATE TABLE record_comments(
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, record_id bigint NOT NULL,
      sender_type text NOT NULL, sender_teacher_id uuid, content text NOT NULL,
      created_at timestamptz DEFAULT now(), updated_at timestamptz, is_read boolean DEFAULT false
    );
    CREATE TABLE record_test_items(
      id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, record_id int NOT NULL,
      test_id int, t_total int, t_cor int, t_score int, created_at timestamptz DEFAULT now()
    );
    ALTER TABLE records ENABLE ROW LEVEL SECURITY;
    ALTER TABLE record_comments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE record_test_items ENABLE ROW LEVEL SECURITY;
    -- 옛 anon 전체 허용 정책을 재현해서, 마이그레이션이 실제로 이걸 지우는지 검증한다.
    CREATE POLICY records_select_anon ON records FOR SELECT TO anon USING (true);
    CREATE POLICY records_update_anon ON records FOR UPDATE TO anon USING (true) WITH CHECK (true);
    CREATE POLICY record_comments_select_anon ON record_comments FOR SELECT TO anon USING (true);
    CREATE POLICY record_comments_insert_anon ON record_comments FOR INSERT TO anon WITH CHECK (sender_type = 'parent');
    CREATE POLICY record_test_items_select_anon ON record_test_items FOR SELECT TO anon USING (true);
    GRANT SELECT, UPDATE ON records TO anon;
    GRANT SELECT, INSERT ON record_comments TO anon;
    GRANT SELECT ON record_test_items TO anon;

    INSERT INTO parents VALUES(1, '01011112222', extensions.crypt('1234', extensions.gen_salt('bf')));
    INSERT INTO parents VALUES(2, '01055556666', extensions.crypt('1234', extensions.gen_salt('bf')));
    INSERT INTO students VALUES(10, 'Child A', '01033334444', 2012, 'School A', extensions.crypt('0000', extensions.gen_salt('bf')));
    INSERT INTO students VALUES(20, 'Other child', '01077778888', 2013, 'School B', extensions.crypt('0000', extensions.gen_salt('bf')));
    INSERT INTO parent_students VALUES(1, 10);
    INSERT INTO parent_students VALUES(2, 20);
    INSERT INTO records VALUES(100, 10, '2026-01-05', 'content', 'hw', 80, 90, 8, false, false, 'fb', false, true, NULL, NULL, NULL);
    INSERT INTO records VALUES(200, 20, '2026-01-05', 'content2', 'hw2', 70, 60, 7, false, false, 'fb2', false, true, NULL, NULL, NULL);
    INSERT INTO records VALUES(101, 10, '2026-01-06', 'draft not released', '', -1, -1, 9, false, false, '', false, false, NULL, NULL, NULL);
  `)
  const pinMigration = readFileSync(new URL('../supabase/pin_null_guard_migration.sql', import.meta.url), 'utf8')
  await db.exec(pinMigration)
  const gatewayMigration = readFileSync(new URL('../supabase/parent_student_session_gateway_migration.sql', import.meta.url), 'utf8')
  await db.exec(gatewayMigration)
  return db
}

test('gateway migration removes anon direct-table access and is safe to apply twice', async t => {
  const db = await setup()
  t.after(() => db.close())
  const gatewayMigration = readFileSync(new URL('../supabase/parent_student_session_gateway_migration.sql', import.meta.url), 'utf8')
  await db.exec(gatewayMigration) // 반복 적용 안전성

  await db.exec('SET ROLE anon')
  const direct = await db.query('SELECT * FROM records')
  assert.equal(direct.rows.length, 0, 'anon이 records를 직접 조회해도 더 이상 아무 것도 안 보여야 한다')
  // RLS는 허용 정책이 없으면 UPDATE를 에러 없이 "대상 0건"으로 처리한다 — 그래도 실제로
  // 아무 행도 바뀌지 않는지 확인한다.
  const updated = await db.query("UPDATE records SET feedback = 'hacked' WHERE id = 100 RETURNING id")
  assert.equal(updated.rows.length, 0, 'anon이 records를 직접 수정해도 반영되는 행이 없어야 한다')
  await db.exec('RESET ROLE')
  const stillOriginal = await db.query("SELECT feedback FROM records WHERE id = 100")
  assert.equal(stillOriginal.rows[0].feedback, 'fb', '실제 데이터는 변하지 않아야 한다')
})

test('parent session only sees and edits their own child\'s released records', async t => {
  const db = await setup()
  t.after(() => db.close())
  await db.exec('SET ROLE anon')

  const login = (await db.query("SELECT * FROM verify_parent_pin('01011112222','1234')")).rows[0]
  assert.ok(login.session_token, '로그인 성공 시 세션 토큰이 발급되어야 한다')
  const token = login.session_token

  // 본인 자녀 기록만 보인다 (초안(is_draft)·미공개(released_to_parent=false)는 제외)
  const own = (await db.query('SELECT * FROM client_records($1,$2)', [token, 10])).rows
  assert.equal(own.length, 1)
  assert.equal(own[0].id, 100)

  // 다른 학부모의 자녀 기록은 이 토큰으로 절대 못 본다
  const other = (await db.query('SELECT * FROM client_records($1,$2)', [token, 20])).rows
  assert.equal(other.length, 0, '다른 학부모의 자녀 기록은 보이면 안 된다')

  // 유효하지 않은 토큰으로는 아무 것도 못 본다
  const bad = (await db.query('SELECT * FROM client_records($1,$2)', ['00000000-0000-0000-0000-000000000000', 10])).rows
  assert.equal(bad.length, 0)

  // 댓글은 본인 자녀 기록에만 남길 수 있다
  const comment = (await db.query('SELECT * FROM client_send_record_comment($1,$2,$3)', [token, 100, '감사합니다'])).rows[0]
  assert.equal(comment.sender_type, 'parent')
  assert.equal(comment.record_id, 100)

  // 남의 자녀 기록에는 토큰이 있어도 댓글을 못 남긴다
  await assert.rejects(db.query('SELECT * FROM client_send_record_comment($1,$2,$3)', [token, 200, '몰래']))

  // 읽음 처리도 본인 것만 반영된다
  await db.query('SELECT client_mark_records_viewed($1,$2)', [token, [100, 200]])
  await db.exec('RESET ROLE') // anon은 이제 records를 직접 못 읽으므로, 결과 검증은 권한 있는 롤로 확인
  const rows = await db.query('SELECT id, viewed_at FROM records ORDER BY id')
  const rec100 = rows.rows.find(r => r.id === 100)
  const rec200 = rows.rows.find(r => r.id === 200)
  assert.ok(rec100.viewed_at, '본인 자녀 기록은 읽음 처리되어야 한다')
  assert.equal(rec200.viewed_at, null, '남의 자녀 기록은 절대 읽음 처리되면 안 된다')
})

test('student session sees only their own records, not another student\'s', async t => {
  const db = await setup()
  t.after(() => db.close())
  await db.exec('SET ROLE anon')

  const login = (await db.query("SELECT * FROM verify_student_pin('01033334444','0000')")).rows[0]
  const token = login.session_token
  const own = (await db.query('SELECT * FROM client_records($1,$2)', [token, 10])).rows
  assert.equal(own.length, 1)
  const other = (await db.query('SELECT * FROM client_records($1,$2)', [token, 20])).rows
  assert.equal(other.length, 0)

  // 학생 토큰으로는 댓글을 남길 수 없다 (학부모 전용 기능)
  await assert.rejects(db.query('SELECT * FROM client_send_record_comment($1,$2,$3)', [token, 100, 'test']))
})
