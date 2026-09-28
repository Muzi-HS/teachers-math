import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function load(path) {
  const context = { exports: {} }
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context)
  return context.exports
}
const { nextClassDate, formatClassDate } = load('../lib/nextClass.ts')

test('nextClassDate finds the next matching weekday and skips cancelled dates', () => {
  const mon = new Date(2026, 8, 28) // 2026-09-28 is a Monday
  const wedFri = nextClassDate('월,수,금', new Set(), mon)
  assert.equal(wedFri?.getTime(), mon.getTime()) // today itself counts if it matches

  const tueThu = nextClassDate('화,목', new Set(), mon)
  assert.equal(formatClassDate(tueThu), '9.29 (화)')

  // 다음 화요일(9.29)이 휴강 등록되면 그 다음 정상 수업일(목요일)로 넘어간다
  const skipped = nextClassDate('화,목', new Set(['2026-09-29']), mon)
  assert.equal(formatClassDate(skipped), '10.1 (목)')

  // 모든 후보가 휴강이면 30일 안에서 계속 찾다가 못 찾으면 null
  assert.equal(nextClassDate('', new Set(), mon), null)
})

test('formatClassDate renders month.day (weekday) in Korean', () => {
  assert.equal(formatClassDate(new Date(2026, 0, 1)), '1.1 (목)')
})
