import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('class assignments restrict staff to their classes and keep admin control', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  const admin = '00000000-0000-0000-0000-000000000001'
  const teacher = '00000000-0000-0000-0000-000000000002'
  const assistant = '00000000-0000-0000-0000-000000000003'
  const otherTeacher = '00000000-0000-0000-0000-000000000004'

  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES ('${admin}'), ('${teacher}'), ('${assistant}'), ('${otherTeacher}');
    CREATE TABLE teachers(user_id uuid PRIMARY KEY, role text NOT NULL, approved boolean NOT NULL);
    INSERT INTO teachers VALUES ('${admin}', 'admin', true), ('${teacher}', 'teacher', true),
      ('${assistant}', 'assistant', true), ('${otherTeacher}', 'teacher', true);
    CREATE TABLE classes(id bigint PRIMARY KEY, name text NOT NULL);
    INSERT INTO classes VALUES (1, 'Alpha'), (2, 'Beta'), (3, 'Gamma');
    CREATE TABLE students(id bigint PRIMARY KEY, name text NOT NULL);
    INSERT INTO students VALUES (10, 'A'), (20, 'B'), (30, 'C');
    CREATE TABLE class_students(class_id bigint REFERENCES classes(id), student_id bigint REFERENCES students(id));
    INSERT INTO class_students VALUES (1, 10), (2, 20), (3, 30);
    CREATE TABLE records(id bigint PRIMARY KEY, class_id bigint REFERENCES classes(id),
      student_id bigint REFERENCES students(id), date date NOT NULL);
    INSERT INTO records VALUES (100, 1, 10, '2026-09-29'), (200, 2, 20, '2026-09-29'),
      (300, 3, 30, '2026-09-29');
    CREATE TABLE record_test_items(id bigint PRIMARY KEY, record_id bigint REFERENCES records(id));
    CREATE TABLE record_comments(id bigint PRIMARY KEY, record_id bigint REFERENCES records(id));
    CREATE TABLE class_bulk_sends(class_id bigint REFERENCES classes(id), date date);
    CREATE TABLE class_notices(id bigint PRIMARY KEY, class_id bigint REFERENCES classes(id));
    CREATE TABLE class_prep_progress(id bigint PRIMARY KEY, student_id bigint REFERENCES students(id));
    CREATE TABLE student_checkins(id bigint PRIMARY KEY, student_id bigint REFERENCES students(id));
    CREATE TABLE attendance_notices(id bigint PRIMARY KEY, student_id bigint REFERENCES students(id));
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT SELECT ON teachers TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON classes, students, class_students, records,
      record_test_items, record_comments, class_bulk_sends, class_notices,
      class_prep_progress, student_checkins, attendance_notices TO authenticated;
  `)
  for (const table of ['classes', 'students', 'class_students', 'records', 'record_test_items',
    'record_comments', 'class_bulk_sends', 'class_notices', 'class_prep_progress',
    'student_checkins', 'attendance_notices']) {
    await db.exec(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
      CREATE POLICY existing_staff ON ${table} FOR ALL TO authenticated USING (true) WITH CHECK (true);`)
  }

  const migration = readFileSync(new URL('../supabase/class_staff_assignments_migration.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  assert.equal((await db.query('SELECT * FROM class_staff_assignments')).rows.length, 9)
  await db.exec(migration)
  assert.equal((await db.query('SELECT * FROM class_staff_assignments')).rows.length, 9)
  await db.query("SELECT set_config('test.uid', $1, false)", [admin])
  await db.exec('SET ROLE authenticated')
  await db.query(`SELECT set_class_staff_assignments(1, ARRAY['${teacher}', '${assistant}']::uuid[])`)
  await db.query(`SELECT set_class_staff_assignments(2, ARRAY['${teacher}']::uuid[])`)
  await db.query('SELECT set_class_staff_assignments(3, ARRAY[]::uuid[])')
  assert.equal((await db.query('SELECT * FROM class_staff_assignments')).rows.length, 3)
  assert.equal((await db.query('SELECT * FROM classes')).rows.length, 3)

  const rolesMigration = readFileSync(new URL('../supabase/class_staff_roles_migration.sql', import.meta.url), 'utf8')
  await db.exec('RESET ROLE')
  await db.exec(rolesMigration)
  await db.exec(rolesMigration)
  await db.exec('SET ROLE authenticated')
  await db.query(`SELECT set_class_staff_roles(1, ARRAY['${admin}']::uuid[], ARRAY['${teacher}']::uuid[])`)
  assert.deepEqual((await db.query('SELECT teacher_user_id, assignment_role FROM class_staff_assignments WHERE class_id = 1 ORDER BY teacher_user_id')).rows,
    [{ teacher_user_id: admin, assignment_role: 'teacher' }, { teacher_user_id: teacher, assignment_role: 'assistant' }])
  assert.equal((await db.query('SELECT * FROM classes')).rows.length, 3)
  await assert.rejects(db.query(`SELECT set_class_staff_roles(1, ARRAY['${assistant}']::uuid[], ARRAY[]::uuid[])`), /Invalid staff role/)
  await assert.rejects(db.query(`SELECT set_class_staff_roles(1, ARRAY['${teacher}']::uuid[], ARRAY['${teacher}']::uuid[])`), /one assignment role/)
  await db.query(`SELECT set_class_staff_roles(1, ARRAY['${teacher}']::uuid[], ARRAY['${assistant}']::uuid[])`)

  await db.query("SELECT set_config('test.uid', $1, false)", [teacher])
  assert.deepEqual((await db.query('SELECT id FROM classes ORDER BY id')).rows.map(r => r.id), [1, 2])
  assert.deepEqual((await db.query('SELECT id FROM records ORDER BY id')).rows.map(r => r.id), [100, 200])
  assert.equal((await db.query('SELECT * FROM class_staff_assignments')).rows.length, 2)
  await assert.rejects(db.query(`SELECT set_class_staff_assignments(3, ARRAY['${teacher}']::uuid[])`), /administrator/)
  await assert.rejects(db.query(`SELECT set_class_staff_roles(3, ARRAY['${teacher}']::uuid[], ARRAY[]::uuid[])`), /administrator/)
  await assert.rejects(db.query("INSERT INTO records VALUES (400, 3, 30, '2026-09-29')"), /row-level security/)
  await db.query("INSERT INTO records VALUES (400, 1, 10, '2026-09-29')")
  await assert.rejects(db.query('UPDATE records SET class_id = 3 WHERE id = 400'), /administrator|row-level security/)

  await db.query("SELECT set_config('test.uid', $1, false)", [assistant])
  assert.deepEqual((await db.query('SELECT id FROM classes ORDER BY id')).rows.map(r => r.id), [1])
  assert.deepEqual((await db.query('SELECT id FROM students ORDER BY id')).rows.map(r => r.id), [10])

  await db.exec('RESET ROLE')
  await db.query('DELETE FROM class_students WHERE class_id = 1 AND student_id = 10')
  await db.exec('SET ROLE authenticated')
  assert.deepEqual((await db.query('SELECT id FROM records WHERE class_id = 1 ORDER BY id')).rows.map(r => r.id), [100, 400])

  await db.query("SELECT set_config('test.uid', $1, false)", [otherTeacher])
  assert.equal((await db.query('SELECT * FROM classes')).rows.length, 0)
  assert.equal((await db.query('SELECT * FROM records')).rows.length, 0)
})
