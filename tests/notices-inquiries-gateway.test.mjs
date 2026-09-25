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
    CREATE TABLE class_students(class_id bigint, student_id int);
    CREATE TABLE records(
      id int PRIMARY KEY, student_id int, date date NOT NULL, hw_rate int,
      is_draft boolean NOT NULL DEFAULT false, released_to_parent boolean NOT NULL DEFAULT true,
      viewed_at timestamptz, edited_at timestamptz, class_id bigint
    );
    CREATE TABLE record_comments(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, record_id bigint NOT NULL, sender_type text NOT NULL, content text NOT NULL, created_at timestamptz DEFAULT now());
    CREATE TABLE record_test_items(id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, record_id int NOT NULL, test_id int, t_total int, t_cor int, t_score int);
    CREATE TABLE student_coupons(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, student_id bigint NOT NULL, milestone int NOT NULL, streak_value int NOT NULL, code text NOT NULL UNIQUE, claimed_at timestamptz NOT NULL DEFAULT now(), used boolean NOT NULL DEFAULT false, used_at timestamptz);
    CREATE TABLE student_streak_state(student_id bigint PRIMARY KEY, last_seen_streak int NOT NULL DEFAULT 0, last_prompted_milestone int NOT NULL DEFAULT 0, last_claimed_date date, updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE fcm_tokens(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, parent_id int, student_id bigint, token text NOT NULL);
    CREATE TABLE notice_comments(
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, notice_id bigint NOT NULL, parent_comment_id bigint,
      sender_type text NOT NULL, parent_id int, sender_teacher_id uuid, is_anonymous boolean NOT NULL DEFAULT false,
      content text NOT NULL, created_at timestamptz DEFAULT now(), updated_at timestamptz
    );

    CREATE TABLE notices(
      id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, title text NOT NULL, content text,
      pinned boolean DEFAULT false, parent_visible boolean DEFAULT false, image_url text,
      created_by uuid, created_at timestamptz DEFAULT now(), target_class_id bigint
    );
    CREATE TABLE notice_target_students(notice_id bigint NOT NULL, student_id int NOT NULL);
    CREATE TABLE notice_reads(notice_id bigint NOT NULL, student_id int NOT NULL, read_at timestamptz NOT NULL, PRIMARY KEY(notice_id, student_id));
    CREATE TABLE class_notices(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, class_id bigint NOT NULL, content text NOT NULL, created_by uuid, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE inquiry_messages(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, parent_id int NOT NULL, sender_type text NOT NULL, sender_teacher_id uuid, content text NOT NULL, created_at timestamptz DEFAULT now(), updated_at timestamptz, is_read boolean DEFAULT false);
    CREATE TABLE attendance_notices(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, parent_id int NOT NULL, student_id int NOT NULL, date date NOT NULL, type text NOT NULL, reason text, created_at timestamptz DEFAULT now());

    ALTER TABLE notices ENABLE ROW LEVEL SECURITY;
    ALTER TABLE notice_target_students ENABLE ROW LEVEL SECURITY;
    ALTER TABLE notice_reads ENABLE ROW LEVEL SECURITY;
    ALTER TABLE notice_comments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE class_notices ENABLE ROW LEVEL SECURITY;
    ALTER TABLE inquiry_messages ENABLE ROW LEVEL SECURITY;
    ALTER TABLE attendance_notices ENABLE ROW LEVEL SECURITY;
    CREATE POLICY notices_select_anon ON notices FOR SELECT TO anon USING (parent_visible = true);
    CREATE POLICY notice_target_students_select_anon ON notice_target_students FOR SELECT TO anon USING (true);
    CREATE POLICY notice_reads_select_anon ON notice_reads FOR SELECT TO anon USING (true);
    CREATE POLICY notice_reads_insert_anon ON notice_reads FOR INSERT TO anon WITH CHECK (true);
    CREATE POLICY notice_comments_select_anon ON notice_comments FOR SELECT TO anon USING (true);
    CREATE POLICY notice_comments_insert_anon ON notice_comments FOR INSERT TO anon WITH CHECK (sender_type = 'parent');
    CREATE POLICY class_notices_select_anon ON class_notices FOR SELECT TO anon USING (true);
    CREATE POLICY inquiry_messages_select_anon ON inquiry_messages FOR SELECT TO anon USING (true);
    CREATE POLICY inquiry_messages_insert_anon ON inquiry_messages FOR INSERT TO anon WITH CHECK (sender_type = 'parent');
    CREATE POLICY attendance_notices_select_anon ON attendance_notices FOR SELECT TO anon USING (true);
    CREATE POLICY attendance_notices_insert_anon ON attendance_notices FOR INSERT TO anon WITH CHECK (true);
    CREATE POLICY attendance_notices_update_anon ON attendance_notices FOR UPDATE TO anon USING (true) WITH CHECK (true);
    CREATE POLICY attendance_notices_delete_anon ON attendance_notices FOR DELETE TO anon USING (true);
    GRANT SELECT ON notices, notice_target_students, notice_reads, notice_comments, class_notices, inquiry_messages, attendance_notices TO anon;
    GRANT INSERT ON notice_reads, notice_comments, inquiry_messages, attendance_notices TO anon;
    GRANT UPDATE, DELETE ON attendance_notices TO anon;

    INSERT INTO parents VALUES(1, '01011112222', extensions.crypt('1234', extensions.gen_salt('bf')));
    INSERT INTO parents VALUES(2, '01055552222', extensions.crypt('1234', extensions.gen_salt('bf')));
    INSERT INTO students VALUES(10, 'Child A', '01033334444', 'School A', 2012, extensions.crypt('0000', extensions.gen_salt('bf')));
    INSERT INTO students VALUES(20, 'Other child', '01099994444', 'School B', 2013, extensions.crypt('0000', extensions.gen_salt('bf')));
    INSERT INTO parent_students VALUES(1, 10);
    INSERT INTO parent_students VALUES(2, 20);
    INSERT INTO class_students VALUES(500, 10);
    INSERT INTO class_students VALUES(600, 20);

    -- notice 1: 전체공개
    INSERT INTO notices(title, parent_visible) VALUES ('전체공지', true);
    -- notice 2: student 10만 대상
    INSERT INTO notices(title, parent_visible) VALUES ('반 제한 공지', true);
    INSERT INTO notice_target_students VALUES (2, 10);
    -- notice 3: 비공개(관리자 전용)
    INSERT INTO notices(title, parent_visible) VALUES ('관리자 전용', false);

    INSERT INTO class_notices(class_id, content) VALUES (500, '500반 공지');
    INSERT INTO class_notices(class_id, content) VALUES (600, '600반 공지');
  `)
  for (const file of [
    '../supabase/pin_null_guard_migration.sql',
    '../supabase/parent_student_session_gateway_migration.sql',
    '../supabase/parent_student_directory_and_rewards_gateway_migration.sql',
    '../supabase/notices_inquiries_gateway_migration.sql',
  ]) {
    await db.exec(readFileSync(new URL(file, import.meta.url), 'utf8'))
  }
  return db
}

async function loginParent(db, phone, pin) {
  return (await db.query('SELECT * FROM verify_parent_pin($1,$2)', [phone, pin])).rows[0].session_token
}

test('anon can no longer read these tables directly after the migration', async t => {
  const db = await setup()
  t.after(() => db.close())
  await db.exec('SET ROLE anon')
  for (const table of ['notices', 'notice_target_students', 'notice_reads', 'notice_comments', 'class_notices', 'inquiry_messages', 'attendance_notices']) {
    const rows = await db.query(`SELECT * FROM ${table}`)
    assert.equal(rows.rows.length, 0, `${table} should not be directly readable by anon anymore`)
  }
})

test('notices are visible only when public or targeted at my own child', async t => {
  const db = await setup()
  t.after(() => db.close())
  await db.exec('SET ROLE anon')
  const token1 = await loginParent(db, '01011112222', '1234') // parent of student 10
  const token2 = await loginParent(db, '01055552222', '1234') // parent of student 20

  const visible1 = (await db.query('SELECT * FROM client_visible_notices($1)', [token1])).rows
  assert.equal(visible1.length, 2, 'parent of student 10 sees the public notice + the one targeted at student 10')
  assert.ok(visible1.some(n => n.title === '전체공지'))
  assert.ok(visible1.some(n => n.title === '반 제한 공지'))
  assert.ok(!visible1.some(n => n.title === '관리자 전용'))

  const visible2 = (await db.query('SELECT * FROM client_visible_notices($1)', [token2])).rows
  assert.equal(visible2.length, 1, 'parent of student 20 only sees the public notice, not the one targeted at student 10')
  assert.equal(visible2[0].title, '전체공지')
})

test('notice comments follow the same visibility and only parents can post', async t => {
  const db = await setup()
  t.after(() => db.close())
  await db.exec('SET ROLE anon')
  const token1 = await loginParent(db, '01011112222', '1234')
  const token2 = await loginParent(db, '01055552222', '1234')

  const posted = (await db.query('SELECT * FROM client_post_notice_comment($1,$2,$3,$4)', [token1, 2, '감사합니다', false])).rows[0]
  assert.equal(posted.parent_id, 1)

  const canSee = (await db.query('SELECT * FROM client_notice_comments($1,$2)', [token1, 2])).rows
  assert.equal(canSee.length, 1)
  const cannotSee = await db.query('SELECT * FROM client_notice_comments($1,$2)', [token2, 2])
  assert.equal(cannotSee.rows.length, 0, '대상이 아닌 학부모는 그 공지의 댓글도 못 봐야 한다')

  // 대상이 아닌 공지에는 댓글도 못 남긴다 (notice 2는 student 20 학부모의 대상이 아님)
  await assert.rejects(
    db.query('SELECT * FROM client_post_notice_comment($1,$2,$3,$4)', [token2, 2, '몰래', false]),
    '대상이 아닌 학부모는 댓글 작성 자체가 거부되어야 한다',
  )
})

test('class notices only reach students actually in that class', async t => {
  const db = await setup()
  t.after(() => db.close())
  await db.exec('SET ROLE anon')
  const token = (await db.query("SELECT * FROM verify_student_pin('01033334444','0000')")).rows[0].session_token
  const own = await db.query('SELECT * FROM client_class_notices($1,$2)', [token, [500]])
  assert.equal(own.rows.length, 1)
  const other = await db.query('SELECT * FROM client_class_notices($1,$2)', [token, [600]])
  assert.equal(other.rows.length, 0, '다른 반 공지는 절대 보이면 안 된다')
})

test('inquiry messages are private to the sending parent', async t => {
  const db = await setup()
  t.after(() => db.close())
  await db.exec('SET ROLE anon')
  const token1 = await loginParent(db, '01011112222', '1234')
  const token2 = await loginParent(db, '01055552222', '1234')
  await db.query('SELECT client_send_inquiry_message($1,$2)', [token1, '문의합니다'])
  const mine = await db.query('SELECT * FROM client_inquiry_messages($1)', [token1])
  assert.equal(mine.rows.length, 1)
  const others = await db.query('SELECT * FROM client_inquiry_messages($1)', [token2])
  assert.equal(others.rows.length, 0, '다른 학부모의 문의는 절대 보이면 안 된다')
})

test('attendance notices can only be created/edited/deleted for my own child', async t => {
  const db = await setup()
  t.after(() => db.close())
  await db.exec('SET ROLE anon')
  const token1 = await loginParent(db, '01011112222', '1234')
  const token2 = await loginParent(db, '01055552222', '1234')

  // 남의 자녀 이름으로는 등록 자체가 거부된다
  await assert.rejects(db.query(
    'SELECT * FROM client_upsert_attendance_notice($1,$2,$3,$4,$5,$6)',
    [token1, null, 20, '2026-03-02', 'absence', null],
  ))

  const created = (await db.query(
    'SELECT * FROM client_upsert_attendance_notice($1,$2,$3,$4,$5,$6)',
    [token1, null, 10, '2026-03-02', 'absence', '몸살'],
  )).rows[0]
  assert.equal(created.student_id, 10)

  // 다른 학부모는 이 항목을 수정/삭제할 수 없다
  await assert.rejects(db.query(
    'SELECT * FROM client_upsert_attendance_notice($1,$2,$3,$4,$5,$6)',
    [token2, created.id, 20, '2026-03-03', 'late', null],
  ))
  await db.query('SELECT client_delete_attendance_notice($1,$2)', [token2, created.id])
  const stillThere = await db.query('SELECT * FROM client_attendance_notices($1)', [token1])
  assert.equal(stillThere.rows.length, 1, '다른 학부모의 삭제 시도는 조용히 무시되고 내 기록은 남아있어야 한다')

  await db.query('SELECT client_delete_attendance_notice($1,$2)', [token1, created.id])
  const afterOwnDelete = await db.query('SELECT * FROM client_attendance_notices($1)', [token1])
  assert.equal(afterOwnDelete.rows.length, 0)
})
