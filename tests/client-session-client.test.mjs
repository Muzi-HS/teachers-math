import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'

test('client renews only matching saved auto-login tokens and distinguishes expiry from network failure', async () => {
  const saved = new Map()
  let response = { data: [{ subject_type: 'parent', subject_id: 200 }], error: null }
  let params
  const storage = { getItem: key => saved.get(key) ?? null, removeItem: key => saved.delete(key) }
  const context = { exports: {}, localStorage: storage, sessionStorage: storage,
    require: () => ({ supabase: { rpc: async (_name, args) => { params = args; return response } } }) }
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/client-session.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context)
  const { validateClientSession, clearClientSession } = context.exports
  assert.equal(await validateClientSession('parent', 200, 'valid'), true)
  assert.equal(params.p_extend, false)
  saved.set('parent_auto_login', JSON.stringify({ session: { sessionToken: 'valid' } }))
  assert.equal(await validateClientSession('parent', 200, 'valid'), true)
  assert.equal(params.p_extend, true)
  await validateClientSession('parent', 200, 'different')
  assert.equal(params.p_extend, false)
  assert.equal(await validateClientSession('parent', 201, 'valid'), false)
  response = { data: [], error: null }
  assert.equal(await validateClientSession('parent', 200, 'valid'), false)
  response = { data: null, error: new Error('offline') }
  await assert.rejects(validateClientSession('parent', 200, 'valid'))
  assert.ok(saved.has('parent_auto_login'))
  clearClientSession('parent')
  assert.equal(saved.has('parent_auto_login'), false)
})
