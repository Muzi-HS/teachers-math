import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const themeModule = await import('data:text/javascript;base64,' + Buffer.from(compile(readFileSync(new URL('../lib/student-theme.ts', import.meta.url), 'utf8'))).toString('base64'))
const tokenA = '11111111-1111-1111-1111-111111111111'
const tokenB = '22222222-2222-2222-2222-222222222222'
const tokenParent = '33333333-3333-3333-3333-333333333333'
const tokenExpired = '44444444-4444-4444-4444-444444444444'
const objects = new Map()
const sessions = [
  { token: tokenA, subject_id: 10, subject_type: 'student', expires_at: '2099-01-01' },
  { token: tokenB, subject_id: 20, subject_type: 'student', expires_at: '2099-01-01' },
  { token: tokenParent, subject_id: 10, subject_type: 'parent', expires_at: '2099-01-01' },
  { token: tokenExpired, subject_id: 10, subject_type: 'student', expires_at: '2000-01-01' },
]
let bucketExists = false
let failUpload = false
const db = {
  from: name => {
    assert.equal(name, 'client_sessions')
    let rows = sessions
    const query = { select: () => query, eq: (field, value) => { rows = rows.filter(row => row[field] === value); return query }, gt: (field, value) => { rows = rows.filter(row => row[field] > value); return query }, maybeSingle: async () => ({ data: rows[0] ?? null, error: null }) }
    return query
  },
  storage: {
    getBucket: async () => ({ data: bucketExists ? { public: false } : null, error: bucketExists ? null : { message: 'Bucket not found' } }),
    createBucket: async (name, options) => { assert.equal(name, 'student-preferences'); assert.equal(options.public, false); bucketExists = true; return { error: null } },
    from: name => {
      assert.equal(name, 'student-preferences')
      return {
        download: async path => objects.has(path) ? { data: new Blob([objects.get(path)]), error: null } : { error: { message: 'Object not found' } },
        upload: async (path, content) => { if (failUpload) return { error: { message: 'unavailable' } }; objects.set(path, content); return { error: null } },
      }
    },
  },
}
globalThis.__studentThemeTest = { db, ...themeModule, NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } }
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-server-key'
let routeSource = compile(readFileSync(new URL('../app/api/student-theme/route.ts', import.meta.url), 'utf8'))
routeSource = routeSource.replace(/import .*?from ['"]next\/server['"];?\n/, 'const { NextResponse } = globalThis.__studentThemeTest;\n')
routeSource = routeSource.replace(/import .*?from ['"]@supabase\/supabase-js['"];?\n/, 'const createClient = () => globalThis.__studentThemeTest.db;\n')
routeSource = routeSource.replace(/import .*?from ['"]@\/lib\/student-theme['"];?\n/, 'const { isStudentTheme, STUDENT_THEME_BUCKET, studentThemePath } = globalThis.__studentThemeTest;\n')
const { GET, POST } = await import('data:text/javascript;base64,' + Buffer.from(routeSource).toString('base64'))
function request(token, body, origin = 'https://school.example') {
  return { headers: new Headers({ ...(token ? { Authorization: `Bearer ${token}` } : {}), Origin: origin }), nextUrl: { origin: 'https://school.example' }, json: async () => body }
}
test('only recognized themes are accepted', () => {
  for (const theme of ['green', 'giants-light', 'giants-uniform']) assert.ok(themeModule.isStudentTheme(theme))
  for (const theme of [null, 'navy', {}, '../other']) assert.equal(themeModule.isStudentTheme(theme), false)
})
test('missing, expired and parent sessions cannot access student preferences', async () => {
  for (const token of [null, tokenParent, tokenExpired]) {
    assert.equal((await GET(request(token))).status, 401)
    assert.equal((await POST(request(token, { theme: 'green' }))).status, 401)
  }
})
test('preferences are private, account scoped, and survive a new request', async () => {
  assert.deepEqual(await (await GET(request(tokenA))).json(), { theme: 'green' })
  const response = await POST(request(tokenA, { theme: 'giants-light', studentId: 20 }))
  assert.equal(response.status, 200)
  assert.ok(bucketExists)
  assert.ok(objects.has('10/theme.json'))
  assert.equal(objects.has('20/theme.json'), false)
  assert.deepEqual(await (await GET(request(tokenA))).json(), { theme: 'giants-light' })
  assert.deepEqual(await (await GET(request(tokenB))).json(), { theme: 'green' })
  await POST(request(tokenB, { theme: 'giants-uniform' }))
  assert.deepEqual(await (await GET(request(tokenA))).json(), { theme: 'giants-light' })
  assert.equal((await GET(request(tokenA))).headers.get('cache-control'), 'no-store')
})
test('cross-origin writes and invalid theme values are rejected', async () => {
  assert.equal((await POST(request(tokenA, { theme: 'green' }, 'https://other.example'))).status, 403)
  assert.equal((await POST(request(tokenA, { theme: 'invalid' }))).status, 400)
})
test('failed saves report failure and preserve the saved preference', async () => {
  failUpload = true
  try { assert.equal((await POST(request(tokenA, { theme: 'green' }))).status, 503) }
  finally { failUpload = false }
  assert.deepEqual(await (await GET(request(tokenA))).json(), { theme: 'giants-light' })
})
