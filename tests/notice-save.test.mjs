import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { PGlite } from '@electric-sql/pglite'

function load(path, dependencies = {}) {
  const context = { exports: {}, require: name => dependencies[name] }
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context)
  return context.exports
}
const { saveNotice } = load('../lib/notice-save.ts', { './notices': load('../lib/notices.ts') })
const form = { id: null, title: 'Test', content: 'Body', pinned: false, targetMode: 'selected', studentIds: [1,1,2] }

test('notice save rejects empty selected audiences and uses exactly one atomic RPC', async () => {
  const calls = []
  const db = { rpc: async (name, args) => { calls.push({ name, args }); return { data: 12, error: null } } }
  await assert.rejects(saveNotice(db, { ...form, studentIds: [] }), /대상 학생/)
  await assert.rejects(saveNotice(db, { ...form, title: '  ' }), /제목/)
  assert.equal(calls.length, 0)
  assert.equal(await saveNotice(db, form), 12)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, 'save_notice_with_targets')
  assert.deepEqual(Array.from(calls[0].args.p_student_ids), [1,2])
  await saveNotice(db, { ...form, targetMode: 'all' })
  assert.deepEqual(Array.from(calls[1].args.p_student_ids), [])
})

test('notice RPC failure, missing migration and invalid results never fall back to partial writes', async () => {
  for (const result of [{ error: { code: 'PGRST202' } }, { error: { code: '42501', message: '권한 없음' } }, { data: null }, { data: -1 }]) {
    let calls = 0
    const db = { rpc: async () => { calls++; return result }, from: () => assert.fail('unsafe fallback') }
    await assert.rejects(saveNotice(db, form))
    assert.equal(calls, 1)
  }
})

test('notice transaction preserves audiences and bodies on failures and checks administrator approval', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  const admin = '00000000-0000-0000-0000-000000000001'
  const teacher = '00000000-0000-0000-0000-000000000002'
  const unapproved = '00000000-0000-0000-0000-000000000003'
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE TABLE teachers(user_id uuid PRIMARY KEY,role text,approved boolean);
    INSERT INTO teachers VALUES('${admin}','admin',true),('${teacher}','teacher',true),('${unapproved}','admin',false);
    CREATE TABLE students(id int PRIMARY KEY);
    INSERT INTO students VALUES(1),(2);
    CREATE TABLE notices(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,title text,content text,pinned boolean,parent_visible boolean,created_by uuid,created_at timestamptz);
    CREATE TABLE notice_target_students(notice_id bigint REFERENCES notices(id) ON DELETE CASCADE,student_id int REFERENCES students(id),PRIMARY KEY(notice_id,student_id));
    CREATE FUNCTION fail_target_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF current_setting('test.fail',true) = 'yes' THEN RAISE EXCEPTION 'simulated insert failure'; END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER simulate_failure BEFORE INSERT ON notice_target_students FOR EACH ROW EXECUTE FUNCTION fail_target_insert();
  `)
  const sql = readFileSync(new URL('../supabase/notice_atomic_save_migration.sql', import.meta.url), 'utf8')
  await db.exec(sql)
  await db.exec(sql)
  const save = (id = null, ids = [1], mode = 'selected', title = 'Original') => db.query(
    'SELECT save_notice_with_targets($1,$2,$3,$4,$5,$6) AS id', [id, title, 'Body', false, mode, ids])
  for (const user of ['', teacher, unapproved]) {
    await db.query("SELECT set_config('test.uid',$1,false)", [user])
    await assert.rejects(save(), /승인된 관리자/)
  }
  await db.query("SELECT set_config('test.uid',$1,false)", [admin])
  await db.exec('SET ROLE anon')
  await assert.rejects(save(), /permission denied/)
  await db.exec('SET ROLE authenticated')
  const id = (await save(null, [1,1])).rows[0].id
  await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT * FROM notice_target_students')).rows.length, 1)

  for (const invalid of [[], [null], [0], [999]]) await assert.rejects(save(id, invalid))
  await assert.rejects(save(id, [1], 'invalid'))
  await assert.rejects(save(999))
  await db.exec("SET test.fail = 'yes'")
  await assert.rejects(save(id, [2], 'selected', 'Changed'), /simulated/)
  await assert.rejects(save(null, [2]), /simulated/)
  assert.deepEqual((await db.query('SELECT title FROM notices')).rows, [{ title: 'Original' }])
  assert.deepEqual((await db.query('SELECT student_id FROM notice_target_students')).rows, [{ student_id: 1 }])
  await db.exec("SET test.fail = 'no'")
  await save(id, [2], 'selected', 'Changed')
  assert.deepEqual((await db.query('SELECT student_id FROM notice_target_students')).rows, [{ student_id: 2 }])
  await save(id, [], 'all')
  assert.equal((await db.query('SELECT * FROM notice_target_students')).rows.length, 0)

  // 점검 SQL도 같은 PostgreSQL 엔진에서 실행 가능하며, 데이터 본문은 반환하지 않는다.
  const audit = await db.exec(readFileSync(new URL('../supabase/security_audit_readonly.sql', import.meta.url), 'utf8'))
  const result = audit.find(part => part.rows?.[0]?.security_audit)?.rows[0].security_audit
  assert.ok(result.tables.some(table => table.table === 'notices'))
  assert.ok(result.policies !== undefined)
  assert.ok(!JSON.stringify(result).includes('Original'))
})
