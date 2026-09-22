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

test('studentIdsOfClass returns only members of the given class, in no particular guaranteed order beyond membership rows', () => {
  assert.deepEqual(studentIdsOfClass(members, 1), [101, 102, 103])
  assert.deepEqual(studentIdsOfClass(members, 2), [201])
  assert.deepEqual(studentIdsOfClass(members, 999), [])
})

test('resolveNoticeTargetIds: "all" mode never targets specific students (visible to everyone)', () => {
  assert.deepEqual(resolveNoticeTargetIds(true, 'all', [101], 1, members), [])
})

test('resolveNoticeTargetIds: "selected" mode passes through the manually chosen student ids untouched', () => {
  assert.deepEqual(resolveNoticeTargetIds(true, 'selected', [101, 201], null, members), [101, 201])
  assert.deepEqual(resolveNoticeTargetIds(true, 'selected', [], null, members), [])
})

test('resolveNoticeTargetIds: "class" mode resolves to every student currently in that class', () => {
  assert.deepEqual(resolveNoticeTargetIds(true, 'class', [], 1, members), [101, 102, 103])
  assert.deepEqual(resolveNoticeTargetIds(true, 'class', [], 2, members), [201])
})

test('resolveNoticeTargetIds: "class" mode with no class chosen, or a class with no members, targets nobody', () => {
  assert.deepEqual(resolveNoticeTargetIds(true, 'class', [], null, members), [])
  assert.deepEqual(resolveNoticeTargetIds(true, 'class', [], 999, members), [])
})

test('resolveNoticeTargetIds: parent_visible=false always targets nobody regardless of mode (notice is not shown to any parent)', () => {
  assert.deepEqual(resolveNoticeTargetIds(false, 'selected', [101], null, members), [])
  assert.deepEqual(resolveNoticeTargetIds(false, 'class', [], 1, members), [])
  assert.deepEqual(resolveNoticeTargetIds(false, 'all', [], null, members), [])
})
