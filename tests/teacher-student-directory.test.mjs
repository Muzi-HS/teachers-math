import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import ts from 'typescript'

test('student menu allows teachers to read without granting administrative actions', async () => {
  const source = readFileSync(new URL('../lib/permissions.ts',import.meta.url),'utf8')
  const { outputText } = ts.transpileModule(source,{ compilerOptions:{ module:ts.ModuleKind.ESNext } })
  const { can,menuAccess } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
  assert.equal(menuAccess.students('admin'),true)
  assert.equal(menuAccess.students('teacher'),true)
  for (const role of ['assistant','parent','student']) assert.equal(menuAccess.students(role),false)
  assert.equal(can.manageStudents('teacher'),false)
  assert.equal(can.viewFullStudent('teacher'),false)
  assert.equal(can.viewBasicStudent('teacher'),true)
})

test('teacher directory returns only assigned students and class memberships, without contacts or PINs', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  const teacher = '00000000-0000-0000-0000-000000000001'
  const other = '00000000-0000-0000-0000-000000000002'
  const assistant = '00000000-0000-0000-0000-000000000003'
  const pending = '00000000-0000-0000-0000-000000000004'
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE TABLE teachers(user_id uuid,role text,approved boolean);
    INSERT INTO teachers VALUES('${teacher}','teacher',true),('${other}','teacher',true),('${assistant}','assistant',true),('${pending}','teacher',false);
    CREATE TABLE classes(id bigint,name text,active boolean);
    INSERT INTO classes VALUES(1,'Assigned',true),(2,'Unassigned',true),(3,'Assigned second',false);
    CREATE TABLE class_staff_assignments(class_id bigint,teacher_user_id uuid);
    INSERT INTO class_staff_assignments VALUES(1,'${teacher}'),(3,'${teacher}'),(2,'${other}');
    CREATE TABLE students(id bigint,name text,birth_year integer,school text,school_type text,reg_date date,phone text,parent_phone text,pin_hash text);
    INSERT INTO students VALUES(1,'Shared',2010,'School A','고등','2026-01-01','private student','private parent','secret'),(2,'Other only',2011,'School B','중등','2026-01-02','private','private','secret'),(3,'No class',2012,'School C','중등','2026-01-03','private','private','secret');
    CREATE TABLE class_students(student_id bigint,class_id bigint);
    INSERT INTO class_students VALUES(1,1),(1,2),(1,3),(2,2);
    CREATE TABLE student_schools(student_id bigint,school_type text,school_name text);
    INSERT INTO student_schools VALUES(1,'고등','School A'),(2,'중등','School B'),(3,'중등','School C');
  `)
  const sql = readFileSync(new URL('../supabase/teacher_student_directory_migration.sql',import.meta.url),'utf8')
  await db.exec(sql); await db.exec(sql)
  const get = async () => (await db.query('SELECT teacher_student_directory() AS directory')).rows[0].directory
  for (const uid of ['',assistant,pending]) {
    await db.query("SELECT set_config('test.uid',$1,false)",[uid])
    await assert.rejects(get(),/승인된 선생님/)
  }
  await db.query("SELECT set_config('test.uid',$1,false)",[teacher])
  await db.exec('SET ROLE authenticated')
  let data = await get()
  assert.deepEqual(data.students.map(s => s.id),[1])
  assert.deepEqual(data.classes.map(c => c.id).sort(),[1,3])
  assert.deepEqual(data.memberships,[{ student_id:1,class_id:1 },{ student_id:1,class_id:3 }])
  assert.deepEqual(data.schools,[{ student_id:1,school_type:'고등',school_name:'School A' }])
  assert.deepEqual(Object.keys(data.students[0]).sort(),['id','name','birth_year','school','school_type','reg_date'].sort())
  assert.ok(!JSON.stringify(data).includes('private'))
  assert.ok(!JSON.stringify(data).includes('secret'))
  await db.exec('SET ROLE anon')
  await assert.rejects(get(),/permission denied/)
  await db.exec('RESET ROLE')
  // The aggregate is not limited by the PostgREST default 1000-row result cap.
  await db.exec(`INSERT INTO students(id,name,birth_year) SELECT i,'Bulk',2010 FROM generate_series(10,1209) i;
    INSERT INTO class_students SELECT i,1 FROM generate_series(10,1209) i;`)
  assert.equal((await get()).students.length,1201)
  // Scope changes apply on the next request, including when all assignments are removed.
  await db.exec(`DELETE FROM class_staff_assignments WHERE teacher_user_id='${teacher}';`)
  assert.deepEqual(await get(),{ students:[],classes:[],memberships:[],schools:[] })
  await db.query("SELECT set_config('test.uid',$1,false)",[other])
  data = await get()
  assert.deepEqual(data.students.map(s => s.id).sort(),[1,2])
  assert.deepEqual(data.classes.map(c => c.id),[2])
})
