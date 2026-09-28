// classes.days는 "월,수,금"처럼 쉼표로 구분된 요일 문자 목록이다. 휴강 등록(class_cancellations)된
// 날짜는 건너뛰고, 가장 가까운 다음 정상 수업일을 계산한다.
const DOW_INDEX: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 }

export function nextClassDate(days: string, cancelledDates: Set<string>, from: Date, maxDaysAhead = 30): Date | null {
  const dayNums = (days ?? '').split(',').map(d => d.trim()).filter(Boolean).map(d => DOW_INDEX[d]).filter(n => n !== undefined)
  if (dayNums.length === 0) return null
  for (let i = 0; i <= maxDaysAhead; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i)
    if (!dayNums.includes(d.getDay())) continue
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (cancelledDates.has(ds)) continue
    return d
  }
  return null
}

const DOW_LABEL = ['일', '월', '화', '수', '목', '금', '토']
export function formatClassDate(d: Date): string {
  return `${d.getMonth() + 1}.${d.getDate()} (${DOW_LABEL[d.getDay()]})`
}
