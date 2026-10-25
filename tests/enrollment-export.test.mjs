import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'
import XLSX from 'xlsx-js-style'

const source = readFileSync(new URL('../lib/enrollment-export.ts',import.meta.url),'utf8')
const { outputText } = ts.transpileModule(source,{ compilerOptions:{ module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022 } })
const { buildEnrollmentWorkbook } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
const tenure = { asOf:'2026-10-25',total:10,eligible:8,unknownDates:2,milestones:[{ months:1,count:6,percent:75 },{ months:3,count:4,percent:50 },{ months:6,count:2,percent:25 },{ months:12,count:1,percent:12.5 }] }
function summary(count) {
  return { today:'2026-10-25',trackingStartedOn:'2024-01-01',rangeStart:'2024-10-01',rangeEnd:'2026-10-25',scope:'all',currentEnrolled:10,unknownDates:2,tenure,
    rows:Array.from({ length:count },(_,i) => ({ start:new Date(Date.UTC(2024,9+i,1)).toISOString().slice(0,10),end:new Date(Date.UTC(2024,10+i,1)).toISOString().slice(0,10),enrolled:10,registrations:5,withdrawals:2,earlyWithdrawals:1,tenure:{ ...tenure,asOf:new Date(Date.UTC(2024,9+i,1)).toISOString().slice(0,10) } })) }
}

test('Excel export includes every period, numeric ratios, cached formulas, totals and filterable styled sheets', () => {
  const wb = buildEnrollmentWorkbook(XLSX,{ month:summary(25),quarter:summary(9),year:summary(3) })
  assert.deepEqual(wb.SheetNames,['통계 요약','월별 추이','분기별 추이','연도별 추이','재원 기간 비율','집계 기준'])
  assert.equal(wb.Sheets['월별 추이'].A4.v,'2024-10')
  assert.equal(wb.Sheets['월별 추이'].A28.v,'2026-10')
  assert.equal(wb.Sheets['월별 추이'].G4.f,'E4-F4')
  assert.equal(wb.Sheets['월별 추이'].G4.v,3)
  assert.equal(wb.Sheets['월별 추이'].E29.v,125)
  assert.equal(wb.Sheets['월별 추이'].E29.f,'SUM(E4:E28)')
  assert.equal(wb.Sheets['월별 추이'].D29.v,'') // Do not sum headcount snapshots.
  assert.equal(wb.Sheets['월별 추이']['!autofilter'].ref,'A3:H28')
  assert.equal(wb.Sheets['재원 기간 비율'].G4.v,.75)
  assert.equal(wb.Sheets['재원 기간 비율'].G4.z,'0.0%')
  assert.equal(wb.Sheets['재원 기간 비율'].G4.f,'F4/D4')
  assert.ok(wb.Sheets['집계 기준'].B4.v.includes('전체 기간'))
  const bytes = XLSX.write(wb,{ bookType:'xlsx',type:'buffer' })
  const reopened = XLSX.read(bytes,{ type:'buffer',cellFormula:true,cellNF:true })
  assert.equal(reopened.Sheets['월별 추이'].G4.v,3)
  assert.equal(reopened.Sheets['월별 추이'].G4.f,'E4-F4')
  assert.equal(reopened.Sheets['재원 기간 비율'].G4.z,'0.0%')
  for (const name of reopened.SheetNames) for (const [address,cell] of Object.entries(reopened.Sheets[name])) {
    if (address.startsWith('!')) continue
    assert.notEqual(cell.t,'e',`${name}!${address}`)
  }
})

test('empty statistics export keeps zeros and leaves undefined ratios blank without division by zero', () => {
  const empty = { ...summary(0),currentEnrolled:0,tenure:{ ...tenure,total:0,eligible:0,unknownDates:0,milestones:tenure.milestones.map(m => ({ ...m,count:0,percent:null })) } }
  const wb = buildEnrollmentWorkbook(XLSX,{ month:empty,quarter:empty,year:empty })
  assert.equal(wb.Sheets['통계 요약'].B4.v,0)
  assert.equal(wb.Sheets['월별 추이'].E4.v,0)
  assert.equal(wb.Sheets['재원 기간 비율'].G4.v,'')
  assert.equal(wb.Sheets['재원 기간 비율'].G4.f,undefined)
})
