import type * as XLSXTypes from 'xlsx-js-style'
import type { EnrollmentExport, EnrollmentGrain, EnrollmentSummary } from './enrollment-stats'
import type { TenureSnapshot } from '@/components/EnrollmentTenure'

type Cell = string | number | null
type Xlsx = typeof import('xlsx-js-style')
const labels:Record<EnrollmentGrain,string> = { month:'월별',quarter:'분기별',year:'연도별' }
const total = (summary:EnrollmentSummary,key:'registrations' | 'withdrawals' | 'earlyWithdrawals') => summary.rows.reduce((sum,row) => sum+row[key],0)
const label = (date:string,grain:EnrollmentGrain) => grain === 'month' ? date.slice(0,7) : grain === 'quarter' ? `${date.slice(0,4)}년 ${Math.ceil(Number(date.slice(5,7))/3)}분기` : `${date.slice(0,4)}년`

export function buildEnrollmentWorkbook(XLSX:Xlsx,data:EnrollmentExport) {
  const wb = XLSX.utils.book_new()
  const current = data.month
  const range = `${current.rangeStart ?? '기록 없음'} ~ ${current.rangeEnd} · 전체 보관 기간 · 테스트 학생 제외`
  function sheet(name:string,title:string,subtitle:string,headers:string[],rows:Cell[][],widths:number[],isTotal = false) {
    const ws = XLSX.utils.aoa_to_sheet([[title],[subtitle],headers,...rows])
    const last = headers.length-1
    ws['!merges'] = [{ s:{ r:0,c:0 },e:{ r:0,c:last } },{ s:{ r:1,c:0 },e:{ r:1,c:last } }]
    ws['!cols'] = widths.map(wch => ({ wch }))
    ws['!rows'] = [{ hpt:30 },{ hpt:32 },{ hpt:32 },...rows.map(() => ({ hpt:name === '집계 기준' ? 46 : 25 }))]
    if (rows.length) ws['!autofilter'] = { ref:XLSX.utils.encode_range({ s:{ r:2,c:0 },e:{ r:2+rows.length-(isTotal ? 1 : 0),c:last } }) }
    for (let r=0;r<rows.length+3;r++) for (let c=0;c<headers.length;c++) {
      const address = XLSX.utils.encode_cell({ r,c })
      const cell = ws[address] ??= { t:'s',v:'' }
      const special = r === 0 || r === 2 || (isTotal && r === rows.length+2)
      cell.s = {
        font:{ name:'맑은 고딕',sz:r === 0 ? 13 : 10,bold:special,color:{ rgb:r <= 2 ? '0D2A5E' : '243B32' } },
        fill:{ patternType:'solid',fgColor:{ rgb:r === 0 || r === 2 ? 'E8EEF8' : isTotal && r === rows.length+2 ? 'FEF3E2' : r > 2 && r%2 === 0 ? 'F5F7FA' : 'FFFFFF' } },
        alignment:{ horizontal:r < 2 ? 'left' : r === 2 ? 'center' : cell.t === 'n' ? 'right' : 'left',vertical:'center',wrapText:true },
        ...(r >= 2 ? { border:Object.fromEntries(['top','bottom','left','right'].map(side => [side,{ style:'thin',color:{ rgb:'DEE7E1' } }])) as XLSXTypes.CellStyle['border'] } : {}),
      }
      if (cell.t === 'n') cell.z = '#,##0'
    }
    XLSX.utils.book_append_sheet(wb,ws,name)
    return ws
  }
  sheet('통계 요약','티처스 수학학원 — 학생 추이 통계',range,['지표','인원(명)','기준','비고'],[
    ['현재 재원생',current.currentEnrolled,current.today,'현재 현황'],
    ['신규 등록',total(current,'registrations'),'전체 보관 기간','월별 등록 합계'],
    ['퇴원',total(current,'withdrawals'),'전체 보관 기간','월별 퇴원 합계'],
    ['순증감',total(current,'registrations')-total(current,'withdrawals'),'전체 보관 기간','신규 등록 − 퇴원'],
    ['30일 이내 퇴원',total(current,'earlyWithdrawals'),'전체 보관 기간','등록 후 0~30일, 퇴원일 기준'],
    ['등록일 미입력 재원생',current.tenure.unknownDates,current.today,'재원 기간 비율에서 제외'],
    ['퇴원 기록 수집 시작일',null,current.trackingStartedOn,'이전에 삭제된 학생 기록은 미포함'],
  ],[26,16,26,54])
  for (const grain of ['month','quarter','year'] as const) {
    const summary = data[grain]
    const rows:Cell[][] = summary.rows.map(row => [label(row.start,grain),row.start,row.end,row.enrolled,row.registrations,row.withdrawals,row.registrations-row.withdrawals,row.earlyWithdrawals])
    rows.push(['합계',null,null,null,total(summary,'registrations'),total(summary,'withdrawals'),total(summary,'registrations')-total(summary,'withdrawals'),total(summary,'earlyWithdrawals')])
    const ws = sheet(`${labels[grain]} 추이`,`티처스 수학학원 — ${labels[grain]} 학생 추이`,range,
      ['기간','기간 시작일','다음 기간 시작일','첫날 재원(명)','신규 등록(명)','퇴원(명)','순증감(명)','30일 이내 퇴원(명)'],rows,[20,16,18,17,17,17,17,23],true)
    summary.rows.forEach((row,i) => { ws[`G${i+4}`] = { ...ws[`G${i+4}`],t:'n',v:row.registrations-row.withdrawals,f:`E${i+4}-F${i+4}` } })
    const end = summary.rows.length+3
    const totalRow = end+1
    for (const col of ['E','F','G','H']) if (summary.rows.length) ws[`${col}${totalRow}`].f = `SUM(${col}4:${col}${end})`
  }
  const snapshots:{ group:string; snapshot:TenureSnapshot }[] = [{ group:'현재',snapshot:current.tenure }]
  for (const grain of ['month','quarter','year'] as const) snapshots.push(...data[grain].rows.map(row => ({ group:labels[grain],snapshot:row.tenure })))
  const tenureRows:Cell[][] = snapshots.map(({ group,snapshot:s }) => [group,s.asOf,s.total,s.eligible,s.unknownDates,...[1,3,6,12].flatMap(months => {
    const item = s.milestones.find(m => m.months === months)
    return [item?.count ?? 0,s.eligible ? (item?.count ?? 0)/s.eligible : null]
  })])
  const wsTenure = sheet('재원 기간 비율','티처스 수학학원 — 재원 기간별 학생 수·비율',range,
    ['집계 구분','기준일','전체 재원(명)','등록일 확인(명)','등록일 미입력(명)','1개월 이상(명)','1개월 이상 비율','3개월 이상(명)','3개월 이상 비율','6개월 이상(명)','6개월 이상 비율','1년 이상(명)','1년 이상 비율'],tenureRows,[12,16,17,19,22,19,21,19,21,19,21,19,21])
  snapshots.forEach(({ snapshot },i) => {
    for (const [countCol,ratioCol] of [['F','G'],['H','I'],['J','K'],['L','M']]) {
      const row = i+4
      const cell = wsTenure[`${ratioCol}${row}`]
      cell.z = '0.0%'
      if (snapshot.eligible) { cell.t = 'n'; cell.f = `${countCol}${row}/D${row}` }
    }
  })
  sheet('집계 기준','티처스 수학학원 — 통계 집계 기준',`통계 기준일: ${current.today}`,['항목','설명'],[
    ['다운로드 범위','최근 12기간으로 제한하지 않고, 보관 중인 전체 기간의 월별·분기별·연도별 집계 데이터를 포함합니다. 학생 이름·연락처 등 개인 정보는 포함하지 않습니다.'],
    ['재원생 기준','월별은 매월 1일, 분기별은 각 분기 첫날, 연도별은 1월 1일입니다. 해당일 등록자는 포함하고 해당일 퇴원자는 제외합니다.'],
    ['현재 재원생',`${current.today} 기준입니다. 기간별 첫날 재원생 수를 합산하지 않습니다.`],
    ['기간 시작·종료','기간 시작일부터 다음 기간 시작일 전까지입니다. 진행 중인 기간은 통계 기준일까지만 집계합니다.'],
    ['신규·퇴원·순증감','신규·퇴원은 각 기간 발생 인원이며 순증감은 신규 등록 − 퇴원입니다. 재등록은 별도로 구분하지 않습니다.'],
    ['30일 이내 퇴원','등록일부터 퇴원일까지 0~30일인 학생을 퇴원일 기준으로 집계합니다.'],
    ['재원 기간 비율','기준일에 재원 중이며 등록일이 확인된 학생이 분모입니다. 비율은 소수점 한 자리까지 표시합니다.'],
    ['재원 기간 중복','1·3·6개월·1년 이상은 누적 기준입니다. 1년 이상 학생은 나머지 기준에도 포함되므로 인원·비율을 합산하지 않습니다.'],
    ['개월 계산','30일 단위가 아닌 등록일의 달력상 개월 기념일을 기준으로 합니다.'],
    ['테스트 학생','테스트로 지정한 학생은 모든 집계에서 제외합니다.'],
    ['과거 기록',`퇴원 기록 수집 시작일: ${current.trackingStartedOn}. 이전에 삭제된 학생은 복원되지 않아 과거 수치가 실제와 다를 수 있습니다.`],
    ['등록일 미입력','등록일이 없는 학생은 날짜별 집계와 재원 기간 비율에서 제외합니다. 현재 재원생 수에는 포함합니다.'],
  ],[24,115])
  return wb
}

export async function downloadEnrollmentWorkbook(data:EnrollmentExport) {
  const XLSX = (await import('xlsx-js-style')).default
  const wb = buildEnrollmentWorkbook(XLSX,data)
  XLSX.writeFile(wb,`티처스 수학학원_학생추이_전체_${data.month.today}.xlsx`)
}
