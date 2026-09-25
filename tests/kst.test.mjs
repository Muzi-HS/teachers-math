import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const context = { exports: {} }
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/kst.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, context)
const { kstDateOf, kstTimeOf, kstDateTimeOf } = context.exports

test('KST formatting preserves explicit offsets and rolls dates across midnight', () => {
  for (const value of ['2026-01-31T15:30:00Z', '2026-02-01T00:30:00+09:00', '2026-01-31T10:30:00-05:00']) {
    assert.equal(kstDateOf(value), '2026-02-01')
    assert.equal(kstTimeOf(value), '00:30')
    assert.equal(kstDateTimeOf(value), '2026-02-01 00:30')
  }
})

test('timezone-free database timestamps still use UTC and date-only values stay unchanged', () => {
  assert.equal(kstDateTimeOf('2026-01-31T15:30:00'), '2026-02-01 00:30')
  assert.equal(kstDateTimeOf('2026-01-31 15:30:00'), '2026-02-01 00:30')
  assert.equal(kstDateOf('2026-01-31'), '2026-01-31')
})

