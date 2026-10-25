import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
function load(file, dependencies, globals = {}) {
  const context = { exports: {}, Response, URL, Uint8Array, process: { env: {} },
    require: name => {
      if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`)
      return dependencies[name]
    }, ...globals }
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, context)
  return context.exports
}
const { requireAdmin } = load('../lib/admin-api-auth.ts', {})

function fixture({ role = 'admin', approved = true, valid = true, configured = true, runs = [], artifact = true } = {}) {
  const calls = []
  const db = {
    auth: { getUser: async () => ({ data: { user: valid ? { id: 'user' } : null }, error: null }) },
    from() {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { role, approved }, error: null }) }
      return q
    },
  }
  const github = {
    BACKUP_ARTIFACT: 'teachers-math-encrypted-backup', BACKUP_WORKFLOW: 'supabase-backup.yml',
    backupGitHubConfig: () => configured ? { ref: 'main' } : null,
    backupRuns: async () => { calls.push('runs'); return runs },
    backupGitHub: async (path, init) => {
      calls.push({ path, init })
      if (path.endsWith('/dispatches')) return new Response(null, { status: 204 })
      if (path.endsWith('/zip')) return new Response(null, { status: 302, headers: { location: 'https://artifact.example/backup.zip' } })
      return Response.json({ artifacts: artifact ? [{ id: 23, name: 'teachers-math-encrypted-backup', expired: false }] : [] })
    },
  }
  const route = load('../app/api/backups/route.ts', {
    '@supabase/supabase-js': { createClient: () => db }, '@/lib/admin-api-auth': { requireAdmin },
    '@/lib/backup-github': github, 'node:fs/promises': { readFile: async path => { calls.push({ file: path }); return Buffer.from('toolkit file') } },
    'node:path': require('node:path'), jszip: require('jszip'),
  }, {
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server-secret' }, cwd: () => 'C:/repo' },
    fetch: async (url, init) => { calls.push({ download: url, init }); return new Response('encrypted archive') },
    AbortSignal,
  })
  return { route, calls }
}
function request(action = 'status', token = true) {
  return new Request(`http://localhost/api/backups?action=${action}`, { headers: token ? { Authorization: 'Bearer token' } : {} })
}

test('backup API rejects anonymous, teacher, assistant and unapproved callers before any file or cloud access', async () => {
  for (const setup of [{ valid: false }, { role: 'teacher' }, { role: 'assistant' }, { approved: false }]) {
    const { route, calls } = fixture(setup)
    for (const action of ['status', 'toolkit', 'guide', 'download']) {
      const response = await route.GET(request(action))
      assert.ok([401, 403].includes(response.status))
      assert.match(response.headers.get('Cache-Control'), /no-store/)
    }
    const response = await route.POST(new Request('http://localhost/api/backups', { method: 'POST', headers: { Authorization: 'Bearer token' }, body: JSON.stringify({ action: 'run-google' }) }))
    assert.ok([401, 403].includes(response.status))
    assert.deepEqual(calls, [])
  }
  const { route } = fixture()
  assert.equal((await route.GET(request('toolkit', false))).status, 401)
})

test('toolkit is available without cloud credentials and contains only an explicit public file allowlist', async () => {
  const { route, calls } = fixture({ configured: false })
  const response = await route.GET(request('toolkit'))
  assert.equal(response.status, 200)
  const zip = await require('jszip').loadAsync(await response.arrayBuffer())
  assert.deepEqual(Object.keys(zip.files).sort(), ['Run-Backup.ps1', 'backup-recovery.md', 'backup.py', 'config.example.json', 'verify.py'].sort())
  assert.equal(calls.filter(c => c.file).length, 5)
  assert.equal(calls.includes('runs'), false)
  const status = await route.GET(request())
  assert.deepEqual(await status.json(), { configured: false, runs: [] })
})

test('dispatch requests are fixed to the backup workflow, block active work and do not claim completion', async () => {
  const post = () => new Request('http://localhost/api/backups', { method: 'POST', headers: { Authorization: 'Bearer token' }, body: JSON.stringify({ action: 'run-google', ref: 'evil' }) })
  const { route, calls } = fixture()
  assert.equal((await route.POST(post())).status, 202)
  const dispatch = calls.find(c => c.path)
  assert.equal(dispatch.path, 'actions/workflows/supabase-backup.yml/dispatches')
  assert.deepEqual(JSON.parse(dispatch.init.body), { ref: 'main' })
  const active = fixture({ runs: [{ status: 'in_progress' }] })
  assert.equal((await active.route.POST(post())).status, 409)
  assert.equal(active.calls.some(c => c.path), false)
})

test('downloads are resolved only from successful backup runs and never forward credentials to the artifact host', async () => {
  const { route, calls } = fixture({ runs: [{ id: 5, status: 'completed', conclusion: 'success' }] })
  const response = await route.GET(request('download'))
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'encrypted archive')
  assert.equal(calls.find(c => c.download).init.headers, undefined)
  assert.ok(calls.some(c => c.path === 'actions/runs/5/artifacts'))
  assert.ok(calls.some(c => c.path === 'actions/artifacts/23/zip'))
  const missing = fixture({ runs: [{ id: 6, status: 'completed', conclusion: 'failure' }] })
  assert.equal((await missing.route.GET(request('download'))).status, 404)
})

test('status checks artifact availability rather than claiming a skipped or empty workflow made a backup', async () => {
  const { route } = fixture({ runs: [{ id: 9, status: 'completed', conclusion: 'success', created_at: '2026-10-25T00:00:00Z' }], artifact: false })
  const data = await (await route.GET(request())).json()
  assert.equal(data.runs[0].downloadable, false)
  assert.equal(JSON.stringify(data).includes('server-secret'), false)
})

test('backup POST rejects malformed JSON without dispatching a workflow', async () => {
  const { route, calls } = fixture()
  for (const body of ['null', '{broken', '{}']) {
    const response = await route.POST(new Request('http://localhost/api/backups', { method: 'POST', headers: { Authorization: 'Bearer token' }, body }))
    assert.equal(response.status, 400)
  }
  assert.deepEqual(calls, [])
})

test('backup settings render all three destinations and recovery instructions only for administrators', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  let role = 'admin'
  const component = load('../app/(admin)/site-settings/BackupTab.tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    '@/context/AuthContext': { useAuth: () => ({ role }) },
    '@/lib/staff-fetch': { staffFetch: () => { throw new Error('Rendering should not start side effects') } },
    './BackupTab.module.css': new Proxy({}, { get: (_target, key) => key === '__esModule' ? false : String(key) }),
  })
  const html = renderToStaticMarkup(React.createElement(component.default))
  for (const label of ['로컬 백업', '네이버 MYBOX', '개인 Google Drive', '데이터가 사라졌을 때', 'PC 실행 도구 다운로드']) assert.ok(html.includes(label))
  assert.match(html, /disabled/)
  role = 'teacher'
  const denied = renderToStaticMarkup(React.createElement(component.default))
  assert.ok(denied.includes('승인된 관리자'))
  assert.equal(denied.includes('Google Drive'), false)
})
