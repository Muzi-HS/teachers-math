import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const context = { exports: {}, require: createRequire(import.meta.url) }
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/exam-points.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, context)
const { defaultQuestionPoints } = context.exports

test('default points divide 100 exactly with two decimal places', () => {
  for (const count of [1, 3, 6, 20, 99, 100]) {
    const points = defaultQuestionPoints(count)
    assert.equal(points.length, count)
    assert.equal(Math.round(points.reduce((sum, value) => sum + value, 0) * 100), 10000)
    assert.ok(points.every(value => value >= 1 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-8))
  }
  assert.equal(defaultQuestionPoints(101).reduce((sum, value) => sum + value, 0), 101)
})
