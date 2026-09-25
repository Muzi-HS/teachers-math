import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const tick = () => new Promise(resolve => setImmediate(resolve))

function mount(path, holdClasses = false) {
  let studentId = 1
  let effects = []
  let stateIndex = 0
  const states = []
  const writes = []
  const pending = []
  const updates = []
  const supabase = {
    from(table) {
      let signal
      const query = {
        select: () => query, eq: () => query, in: () => query, order: () => query,
        abortSignal(value) { signal = value; return query },
        then(resolve, reject) {
          // 취소 후에도 늦은 응답을 전달해 화면의 응답 무시 처리를 검증한다.
          if (holdClasses && table === 'classes') {
            return new Promise(finish => pending.push({ table, signal, finish })).then(resolve, reject)
          }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject)
        },
      }
      return query
    },
    // records/record_test_items 직접 조회는 client_records/client_record_test_items RPC로 대체됐다.
    rpc(name, params) {
      let signal
      const query = {
        abortSignal(value) { signal = value; return query },
        then(resolve, reject) {
          if (name === 'client_records') {
            return new Promise(finish => pending.push({ table: 'records', signal, finish, params })).then(resolve, reject)
          }
          if (name === 'client_mark_records_viewed') { updates.push(params); return Promise.resolve({ data: null, error: null }).then(resolve, reject) }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject)
        },
      }
      return query
    },
  }
  const jsx = (type, props) => ({ type, props })
  const modules = {
    react: {
      useState(initial) {
        const index = stateIndex++
        if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
        return [states[index], next => { writes.push(index); states[index] = typeof next === 'function' ? next(states[index]) : next }]
      },
      useEffect(callback) { effects.push(callback) },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/lib/supabase': { supabase },
    '@/context/AuthContext': { useAuth: () => ({
      student: { studentId, name: 'Test', sessionToken: 'test-session-token' },
      parent: { sessionToken: 'test-session-token' },
    }) },
    '../layout': { useParentChild: () => ({ selChild: studentId, children: [{ id: 1, name: 'One' }, { id: 2, name: 'Two' }] }) },
    '@/lib/records': { groupCommentsByRecord: () => ({}) },
  }
  const placeholder = new Proxy({}, { get: (_, key) => key === '__esModule' ? true : () => null })
  const context = { exports: {}, AbortController, Date, console, require: name => modules[name] ?? placeholder }
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText, context)
  function renderEffect() {
    stateIndex = 0
    effects = []
    context.exports.default()
    return effects[0]()
  }
  let cleanup = renderEffect()
  return {
    pending, writes, updates,
    switchStudent() { cleanup(); studentId = 2; cleanup = renderEffect() },
    unmount() { cleanup() },
  }
}

for (const kind of ['parent', 'student']) {
  test(`${kind} records ignore late records from a previous identity and do not mark them read`, async () => {
    const app = mount(`../app/${kind}/records/page.tsx`)
    await tick()
    const old = app.pending.shift()
    app.switchStudent()
    await tick()
    assert.equal(old.signal.aborted, true)
    const current = app.pending.shift()
    current.finish({ data: [], error: null })
    await tick()
    const writesAfterLatest = app.writes.length
    old.finish({ data: [{ id: 11, date: '2026-09-25', class_id: null, viewed_at: null }], error: null })
    await tick()
    assert.equal(app.writes.length, writesAfterLatest)
    assert.equal(app.updates.length, 0)
    app.unmount()
  })

  test(`${kind} records ignore a late class lookup after unmount`, async () => {
    const app = mount(`../app/${kind}/records/page.tsx`, true)
    await tick()
    app.pending.shift().finish({ data: [{ id: 11, date: '2026-09-25', class_id: 1 }], error: null })
    await tick()
    const classes = app.pending.shift()
    assert.equal(classes.table, 'classes')
    app.unmount()
    assert.equal(classes.signal.aborted, true)
    const count = app.writes.length
    classes.finish({ data: [{ id: 1, name: 'Old class' }], error: null })
    await tick()
    assert.equal(app.writes.length, count)
    assert.equal(app.updates.length, 0)
  })
}
