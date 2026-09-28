export function homeworkStatusLabel(rate: number): string {
  if (rate === -1) return '지난 숙제 없음'
  if (rate === -2) return '지난 숙제 미제출'
  if (rate < 0 || !Number.isFinite(rate)) return '지난 숙제 기록 없음'
  return `지난 숙제 이행 ${rate}%`
}
