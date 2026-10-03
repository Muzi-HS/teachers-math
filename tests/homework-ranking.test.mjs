import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'
import vm from 'node:vm'
const context = { exports: {} }
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/homework-ranking.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, context)
const { homeworkRanking, studentGrade } = context.exports
test('monthly ranking prioritizes unrounded averages, distinct class days, then accuracy', () => {
  const students = [1, 2, 3, 4, 5].map(id => ({ id, name: String(id), school: '학교', school_type: '중등', birth_year: 2012 }))
  const rec = (student_id, date, hw_rate, hw_cor) => ({ student_id, date, hw_rate, hw_cor })
  const rows = homeworkRanking(students, [
    rec(1, '2026-10-01', 90, 100), rec(1, '2026-10-01', 90, 100),
    rec(2, '2026-10-01', 90, 60), rec(2, '2026-10-02', 90, 60),
    rec(3, '2026-10-01', 90, 80), rec(3, '2026-10-02', 90, 80),
    rec(4, '2026-10-01', 90.1, null), rec(4, '2026-10-02', -1, -1),
    rec(5, '2026-10-01', null, null),
  ])
  assert.deepEqual(Array.from(rows, row => row.id), [4, 3, 2, 1])
  assert.equal(rows[0].rate, 90.1)
  assert.equal(rows[0].correct, null)
  assert.equal(rows[3].days, 1)
})
test('grade filters follow school type and selected calendar year', () => {
  assert.equal(studentGrade({ school_type: '초등', birth_year: 2019 }, 2026), 1)
  assert.equal(studentGrade({ school_type: '중등', birth_year: 2012 }, 2026), 2)
  assert.equal(studentGrade({ school_type: '고등', birth_year: 2008 }, 2026), 3)
  assert.equal(studentGrade({ school_type: null, birth_year: 2012 }, 2026), null)
})
