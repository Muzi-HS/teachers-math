import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

test('PIN migration blocks NULL bypasses while preserving parent/student login and PIN changes', async t => {
  const db = new PGlite({ extensions: { pgcrypto } })
  t.after(() => db.close())
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA extensions;
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    CREATE TABLE parents(id int PRIMARY KEY, phone text, pin_hash text NOT NULL);
    CREATE TABLE students(id int PRIMARY KEY, name text, phone text, birth_year int, school text, pin_hash text NOT NULL);
    CREATE TABLE parent_students(parent_id int, student_id int);
    INSERT INTO parents VALUES(1, '01011112222', extensions.crypt('1234', extensions.gen_salt('bf')));
    INSERT INTO students VALUES(2, 'Test student', '01033334444', 2010, 'Test school', extensions.crypt('0000', extensions.gen_salt('bf')));
    INSERT INTO parent_students VALUES(1,2);
  `)
  const migration = readFileSync(new URL('../supabase/pin_null_guard_migration.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  await db.exec(migration) // operational retry must be safe
  await db.exec('SET ROLE anon')
  for (const [kind, id, phone, pin] of [['parent', 1, '01011112222', '1234'], ['student', 2, '01033334444', '0000']]) {
    for (const invalid of [null, '', '123', '12345', 'abcd', '9999']) {
      await assert.rejects(db.query(`SELECT * FROM verify_${kind}_pin($1,$2)`, [phone, invalid]))
      await assert.rejects(db.query(`SELECT update_${kind}_pin($1,$2,$3)`, [id, invalid, '5678']))
    }
    for (const invalid of [null, '', '123', 'abcd']) {
      await assert.rejects(db.query(`SELECT update_${kind}_pin($1,$2,$3)`, [id, pin, invalid]))
    }
    const original = (await db.query(`SELECT * FROM verify_${kind}_pin($1,$2)`, [phone, pin])).rows[0]
    assert.equal(original[`${kind}_id`], id)
    assert.equal(original.is_default_pin, pin === '0000')
    if (kind === 'parent') assert.equal(original.children[0].id, 2)
    await db.query(`SELECT update_${kind}_pin($1,$2,$3)`, [id, pin, '5678'])
    await assert.rejects(db.query(`SELECT * FROM verify_${kind}_pin($1,$2)`, [phone, pin]))
    assert.equal((await db.query(`SELECT * FROM verify_${kind}_pin($1,$2)`, [phone, '5678'])).rows[0].is_default_pin, false)
  }
  await db.exec('SET ROLE authenticated')
  assert.equal((await db.query("SELECT * FROM verify_student_pin('01033334444','5678')")).rows[0].student_id, 2)
})
