export type RankingStudent = { id: number; name: string; school: string; school_type: string | null; birth_year: number }
export type RankingRecord = { student_id: number; date: string; hw_rate: number | null; hw_cor: number | null }
export function studentGrade(student: RankingStudent, year: number) {
  const firstAge = student.school_type === '초등' ? 8 : student.school_type === '중등' ? 14 : student.school_type === '고등' ? 17 : null
  if (firstAge === null) return null
  const grade = year - student.birth_year + 2 - firstAge
  return grade >= 1 && grade <= (student.school_type === '초등' ? 6 : 3) ? grade : null
}
export function homeworkRanking(students: RankingStudent[], records: RankingRecord[]) {
  const grouped = new Map<number, RankingRecord[]>()
  for (const record of records) {
    const rows = grouped.get(record.student_id) ?? []
    rows.push(record); grouped.set(record.student_id, rows)
  }
  return students.flatMap(student => {
    const rows = grouped.get(student.id) ?? []
    const rates = rows.filter(row => row.hw_rate !== null && row.hw_rate >= 0)
    if (!rates.length) return []
    const correct = rows.filter(row => row.hw_cor !== null && row.hw_cor >= 0)
    return [{ ...student, rate: rates.reduce((sum, row) => sum + row.hw_rate!, 0) / rates.length,
      correct: correct.length ? correct.reduce((sum, row) => sum + row.hw_cor!, 0) / correct.length : null,
      days: new Set(rows.map(row => row.date)).size }]
  }).sort((a, b) => b.rate - a.rate || b.days - a.days || (b.correct ?? -1) - (a.correct ?? -1) || a.name.localeCompare(b.name, 'ko') || a.id - b.id)
}
