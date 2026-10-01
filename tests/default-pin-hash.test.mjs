import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

test('new students and automatically created parents receive usable unique default PIN hashes', async t => {
  const db = new PGlite({ extensions: { pgcrypto } })
  t.after(() => db.close())
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE SCHEMA extensions;
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    CREATE TABLE students(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, parent_phone text, pin_hash text NOT NULL);
    CREATE TABLE parents(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, phone text UNIQUE, pin_hash text NOT NULL);
    CREATE FUNCTION auto_create_parent() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.parent_phone <> '' THEN
        INSERT INTO parents(phone) VALUES (NEW.parent_phone) ON CONFLICT (phone) DO NOTHING;
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER auto_create_parent AFTER INSERT ON students
      FOR EACH ROW EXECUTE FUNCTION auto_create_parent();
    GRANT INSERT, SELECT ON students, parents TO authenticated;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
  `)
  const sql = readFileSync(new URL('../supabase/default_pin_hash_migration.sql', import.meta.url), 'utf8')
  await db.exec(sql)
  await db.exec(sql)
  await db.exec('SET ROLE authenticated')
  await db.query("INSERT INTO students(parent_phone) VALUES ('01011112222'), ('01033334444')")
  await db.exec('RESET ROLE')
  const students = (await db.query('SELECT pin_hash FROM students ORDER BY id')).rows
  const parents = (await db.query('SELECT pin_hash FROM parents ORDER BY id')).rows
  assert.equal(students.length, 2)
  assert.equal(parents.length, 2)
  for (const row of [...students, ...parents]) {
    assert.equal((await db.query("SELECT extensions.crypt('0000', $1) = $1 AS valid", [row.pin_hash])).rows[0].valid, true)
  }
  assert.notEqual(students[0].pin_hash, students[1].pin_hash)
  assert.notEqual(parents[0].pin_hash, parents[1].pin_hash)
})
