import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function load(path, dependencies = {}, extra = {}) {
  const context = { exports: {}, Response, Headers, Date, process: { env: {} },
    require: name => { if (!(name in dependencies)) throw new Error(name); return dependencies[name] }, ...extra }
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context)
  return context.exports
}
const auth = load('../lib/admin-api-auth.ts')

function fixture({ role = 'admin', approved = true, valid = true, deleteError = null, profileError = null } = {}) {
  const writes = []
  const lookups = []
  const db = {
    auth: {
      getUser: async token => ({ data: { user: valid && token === 'valid-token' ? { id: 'verified-admin' } : null }, error: null }),
      admin: { deleteUser: async id => { writes.push({ operation: 'deleteUser', id }); return { error: deleteError } } },
    },
    from(table) {
      const query = {
        select() { return query },
        eq(key, value) { lookups.push({ table, key, value }); return query },
        maybeSingle: async () => ({ data: { id: 2, role, approved }, error: profileError }),
        update(value) { writes.push({ operation: 'update', table, value }); return query },
        delete() { writes.push({ operation: 'delete', table }); return query },
        then(resolve) { return Promise.resolve({ error: null }).then(resolve) },
      }
      return query
    },
  }
  return { db, writes, lookups }
}
function request(body = {}, token = 'valid-token', method = 'POST') {
  return new Request('http://localhost/api/test', {
    method, headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {},
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
  })
}
function route(path, db) {
  return load(path, { 'next/server': { NextResponse: Response }, '@supabase/supabase-js': { createClient: () => db }, '@/lib/admin-api-auth': auth })
}

test('admin guard rejects missing/invalid sessions, teachers, assistants and unapproved admins', async () => {
  for (const [options, token, status] of [
    [{}, null, 401], [{}, 'forged', 401], [{ role: 'teacher' }, 'valid-token', 403],
    [{ role: 'assistant' }, 'valid-token', 403], [{ approved: false }, 'valid-token', 403],
    [{ profileError: { message: 'offline' } }, 'valid-token', 503],
  ]) {
    const { db } = fixture(options)
    assert.equal((await auth.requireAdmin(request({}, token), db)).response.status, status)
  }
  const { db, lookups } = fixture()
  assert.equal((await auth.requireAdmin(request({ requesterId: 'forged-id' }), db)).userId, 'verified-admin')
  assert.equal(lookups[0].value, 'verified-admin')
})

test('all protected API handlers reject anonymous calls before performing mutations', async () => {
  for (const [path, method] of [
    ['../app/api/teachers/route.ts', 'GET'], ['../app/api/teachers/route.ts', 'POST'], ['../app/api/teachers/route.ts', 'DELETE'],
    ['../app/api/attendance/approve/route.ts', 'POST'], ['../app/api/attendance/update/route.ts', 'POST'],
  ]) {
    const { db, writes, lookups } = fixture()
    const response = await route(path, db)[method](request({ logId: 1, requesterId: 'admin', approvedBy: 'admin' }, null, method))
    assert.equal(response.status, 401, `${path} ${method}`)
    assert.equal(writes.length, 0)
    assert.equal(lookups.length, 0)
  }
})

test('attendance approval and editing record the verified actor and clear cancelled approvals', async () => {
  for (const path of ['../app/api/attendance/approve/route.ts', '../app/api/attendance/update/route.ts']) {
    for (const approved of [true, false]) {
      const { db, writes } = fixture()
      const response = await route(path, db).POST(request({ logId: 12, approved, approvedBy: 'forged-id' }))
      assert.equal(response.status, 200)
      assert.equal(writes[0].value.approved_by, approved ? 'verified-admin' : null)
      assert.equal(writes[0].value.approved, approved)
      assert.equal(writes[0].value.approved_at === null, !approved)
    }
  }
})

test('teacher deletion blocks self deletion, reports Auth failures and cleans profile only after success', async () => {
  for (const [target, deleteError, status, expected] of [
    ['verified-admin', null, 400, []],
    ['other-teacher', { message: 'failure' }, 500, ['deleteUser']],
    ['other-teacher', null, 200, ['deleteUser', 'delete']],
  ]) {
    const { db, writes } = fixture({ deleteError })
    const response = await route('../app/api/teachers/route.ts', db).DELETE(request({ targetUserId: target }, 'valid-token', 'DELETE'))
    assert.equal(response.status, status)
    assert.deepEqual(writes.map(w => w.operation), expected)
  }
})

test('staff requests attach the current session, preserve payloads and never retry writes', async () => {
  const calls = []
  let session = { access_token: 'current-token' }
  const { staffFetch } = load('../lib/staff-fetch.ts', {
    './supabase': { supabase: { auth: { getSession: async () => ({ data: { session }, error: null }) } } },
  }, { fetch: async (path, init) => { calls.push({ path, init }); throw new Error('offline') } })
  assert.equal((await staffFetch('/api/attendance/approve', { method: 'POST', body: '{"logId":1}', headers: { 'Content-Type': 'application/json' } })).status, 503)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].init.headers.get('authorization'), 'Bearer current-token')
  assert.equal(calls[0].init.headers.get('content-type'), 'application/json')
  assert.equal(calls[0].init.body, '{"logId":1}')
  session = null
  assert.equal((await staffFetch('/api/teachers')).status, 401)
  await assert.rejects(staffFetch('https://example.com/api/teachers'))
  assert.equal(calls.length, 1)
})
