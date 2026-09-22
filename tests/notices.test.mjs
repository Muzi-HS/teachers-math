import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function loadTS(path) {
  const context = { exports: {}, require: createRequire(import.meta.url), Buffer }
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context)
  return context.exports
}

const mod = loadTS('../lib/notices.ts')
// vm.runInNewContext 결과는 별도의 realm이라 Array가 다른 생성자를 가진다.
// deepEqual이 cross-realm 배열을 reference-equal이 아니라고 오판하지 않도록 항상 Array.from으로 감싼다.
const studentIdsOfClass = (...args) => Array.from(mod.studentIdsOfClass(...args))
const resolveNoticeTargetIds = (...args) => Array.from(mod.resolveNoticeTargetIds(...args))

const members = [
  { class_id: 1, student_id: 101 }, { class_id: 1, student_id: 102 }, { class_id: 1, student_id: 103 },
  { class_id: 2, student_id: 201 },
]

test('studentIdsOfClass returns only members of the given class', () => {
  assert.deepEqual(studentIdsOfClass(members, 1), [101, 102, 103])
  assert.deepEqual(studentIdsOfClass(members, 2), [201])
  assert.deepEqual(studentIdsOfClass(members, 999), [])
})

test('resolveNoticeTargetIds: "all" mode never targets specific students (visible to everyone)', () => {
  assert.deepEqual(resolveNoticeTargetIds('all', [101, 102]), [])
})

test('resolveNoticeTargetIds: "selected" mode passes through the chosen student ids untouched, including ids added via a class quick-pick', () => {
  assert.deepEqual(resolveNoticeTargetIds('selected', [101, 201]), [101, 201])
  assert.deepEqual(resolveNoticeTargetIds('selected', []), [])
  // 반 전체를 눌러 선택된 경우도 selected 모드에서 동일하게 처리된다.
  assert.deepEqual(resolveNoticeTargetIds('selected', studentIdsOfClass(members, 1)), [101, 102, 103])
})
