import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import ts from 'typescript'
import vm from 'node:vm'

test('internal calendar CRUD is restricted to approved administrators by actual RLS', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  const ids = Array.from({ length: 5 }, (_, i) => `00000000-0000-0000-0000-00000000000${i + 1}`)
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    CREATE TABLE teachers(user_id uuid PRIMARY KEY, role text, approved boolean);
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT SELECT ON teachers TO authenticated;
    INSERT INTO teachers VALUES ('${ids[0]}','admin',true), ('${ids[1]}','teacher',true),
      ('${ids[2]}','assistant',true), ('${ids[3]}','admin',false);`)
  const migration = readFileSync(new URL('../supabase/admin_schedule_migration.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  await db.exec(migration)
  await db.query("SELECT set_config('test.uid', $1, false)", [ids[0]])
  await db.exec('SET ROLE authenticated')
  await db.query("INSERT INTO admin_schedule_events(title,start_date,end_date) VALUES ('회의','2026-10-02','2026-10-03')")
  await db.query("UPDATE admin_schedule_events SET completed = true WHERE id = 1")
  assert.equal((await db.query('SELECT completed FROM admin_schedule_events')).rows[0].completed, true)
  for (const id of ids.slice(1)) {
    await db.query("SELECT set_config('test.uid', $1, false)", [id])
    assert.equal((await db.query('SELECT * FROM admin_schedule_events')).rows.length, 0)
    await assert.rejects(db.query("INSERT INTO admin_schedule_events(title,start_date,end_date) VALUES ('금지','2026-10-02','2026-10-02')"), /row-level security/)
    assert.equal((await db.query("UPDATE admin_schedule_events SET title = '금지' RETURNING id")).rows.length, 0)
    assert.equal((await db.query('DELETE FROM admin_schedule_events RETURNING id')).rows.length, 0)
  }
  await db.exec('RESET ROLE; SET ROLE anon')
  await assert.rejects(db.query('SELECT * FROM admin_schedule_events'), /permission denied/)
  await db.exec('RESET ROLE; SET ROLE authenticated')
  await db.query("SELECT set_config('test.uid', $1, false)", [ids[0]])
  for (const values of ["'','2026-10-02','2026-10-02',null,null", "'잘못된 기간','2026-10-03','2026-10-02',null,null", "'잘못된 시간','2026-10-02','2026-10-02','10:00','09:00'"]) {
    await assert.rejects(db.query(`INSERT INTO admin_schedule_events(title,start_date,end_date,start_time,end_time) VALUES (${values})`), /check constraint/)
  }
  assert.equal((await db.query('DELETE FROM admin_schedule_events RETURNING id')).rows.length, 1)
})

function holidayRoute(key, fetch) {
  const context = { exports: {}, require: () => ({}), Response, URL, AbortSignal, process: { env: { KASI_HOLIDAY_API_KEY: key } }, fetch }
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../app/api/public-holidays/route.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context)
  return year => context.exports.GET({ nextUrl: new URL(`https://example.test/api/public-holidays?year=${year}`) })
}

test('internal calendar keeps month-first layout and filters the existing list through today/week/date controls', () => {
  let cursor = 0
  const states = []
  const sample = (id, title, start_date, end_date = start_date) => ({ id, title, start_date, end_date, start_time: null, end_time: null, category: '업무', owner: '', location: '', memo: '', completed: false })
  const fixtures = [sample(1, '오늘 회의', '2026-10-02'), sample(2, '다음 주 준비', '2026-10-06'), sample(3, '지난 달부터 이어지는 일정', '2026-09-30', '2026-10-03')]
  const jsx = (type, props) => ({ type, props })
  const context = {
    exports: {}, Date,
    require: name => {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' }
      if (name === 'react') return {
        useState: initial => {
          const i = cursor++
          if (!(i in states)) states[i] = i === 3 ? fixtures : i === 4 ? false : initial
          return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value }]
        },
        useRef: () => ({ current: null }), useCallback: fn => fn, useEffect: () => {},
      }
      if (name.includes('use-mobile')) return { useMobileMode: () => ({ mobileMode: false }) }
      if (name.includes('MobileModeContext')) return { useMobileMode: () => ({ mobileMode: false }) }
      if (name.includes('use-public-holidays')) return { usePublicHolidays: () => ({ holidays: [], fallback: false }) }
      if (name.includes('/kst')) return { kstDateStr: () => '2026-10-02' }
      return {}
    },
  }
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../app/(admin)/schedule/AdminScheduleCalendar.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText, context)
  const render = () => { cursor = 0; return context.exports.default() }
  const nodes = root => !root || typeof root !== 'object' ? [] : Array.isArray(root) ? root.flatMap(nodes) : [root, ...nodes(root.props?.children)]
  const textOf = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(textOf).join('') : node?.props ? textOf(node.props.children) : ''
  const button = (root, prefix) => nodes(root).find(node => node.type === 'button' && textOf(node).startsWith(prefix))
  const titles = root => nodes(root).filter(node => node.props?.className === 'internal-event').map(node => textOf(node))
  let root = render()
  assert.equal(titles(root).length, 3)
  assert.equal(nodes(root).filter(node => node.props?.className?.split(' ').includes('cd')).length, 35)
  assert.ok(textOf(root).includes('10월 전체 일정 목록'))
  button(root, '오늘 ·').props.onClick()
  root = render()
  assert.equal(titles(root).length, 2)
  button(root, '이번 주 ·').props.onClick()
  root = render()
  assert.equal(titles(root).length, 2)
  nodes(root).find(node => node.props?.['aria-label']?.startsWith('10월 6일')).props.onClick()
  root = render()
  assert.equal(titles(root).length, 1)
  assert.ok(titles(root)[0].includes('다음 주 준비'))
  button(root, '월 전체 보기').props.onClick()
  root = render()
  assert.equal(titles(root).length, 3)
  assert.equal(nodes(root).filter(node => node.type === 'button' && textOf(node) === '수정').length, 3)
  assert.equal(nodes(root).filter(node => node.type === 'button' && textOf(node) === '삭제').length, 3)
})

test('holiday route validates year, keeps key on server and handles upstream failures', async () => {
  assert.equal((await holidayRoute(undefined, () => assert.fail('no fetch'))('bad')).status, 400)
  assert.equal((await holidayRoute(undefined, () => assert.fail('no fetch'))('2026')).status, 503)
  const route = holidayRoute('secret+key', async url => {
    assert.equal(url.searchParams.get('ServiceKey'), 'secret+key')
    assert.equal(url.searchParams.get('solYear'), '2026')
    return new Response('<response><resultCode>00</resultCode><items><item><locdate>20261003</locdate><dateName>개천절 &amp; 휴일</dateName><isHoliday>Y</isHoliday></item><item><locdate>20261004</locdate><dateName>기념일</dateName><isHoliday>N</isHoliday></item></items></response>')
  })
  const response = await route('2026')
  assert.deepEqual(await response.json(), { holidays: [{ date: '2026-10-03', name: '개천절 & 휴일' }] })
  assert.ok(response.headers.get('Cache-Control'))
  assert.equal((await holidayRoute('key', async () => { throw new Error('offline') })('2026')).status, 502)
  assert.equal((await holidayRoute('key', async () => new Response('<resultCode>30</resultCode>'))('2026')).status, 502)
})
