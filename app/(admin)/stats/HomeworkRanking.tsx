'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { kstDateStr } from '@/lib/kst'
import { loadStudentClassNames } from '@/lib/student-class-names'
import { homeworkRanking, studentGrade, RankingStudent, RankingRecord } from '@/lib/homework-ranking'

export default function HomeworkRanking() {
  const [month, setMonth] = useState(() => kstDateStr().slice(0, 7))
  const [type, setType] = useState('전체')
  const [school, setSchool] = useState('전체')
  const [grade, setGrade] = useState('전체')
  const [students, setStudents] = useState<RankingStudent[]>([])
  const [records, setRecords] = useState<RankingRecord[]>([])
  const [classNames, setClassNames] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true); setError('')
      try {
        const studentRows: RankingStudent[] = []
        for (let offset = 0; ; offset += 1000) {
          const result = await supabase.from('students').select('id,name,school,school_type,birth_year').order('id').range(offset, offset + 999)
          if (result.error) throw result.error
          studentRows.push(...(result.data ?? []))
          if (!active) return
          if ((result.data?.length ?? 0) < 1000) break
        }
        const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1)).toISOString().slice(0, 10)
        const rows: RankingRecord[] = []
        // Paginate to avoid silently truncating academy-wide monthly records.
        for (let offset = 0; ; offset += 1000) {
          const result = await supabase.from('records').select('student_id,date,hw_rate,hw_cor').eq('is_draft', false)
            .gte('date', month + '-01').lt('date', end).order('id').range(offset, offset + 999)
          if (result.error) throw result.error
          rows.push(...(result.data ?? []))
          if (!active) return
          if ((result.data?.length ?? 0) < 1000) break
        }
        const names = await loadStudentClassNames()
        if (active) { setStudents(studentRows); setRecords(rows); setClassNames(names) }
      } catch { if (active) setError('순위를 불러오지 못했습니다. 다시 시도해주세요.') }
      finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [month, retry])
  const schools = [...new Set(students.filter(s => type === '전체' || s.school_type === type).map(s => s.school).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'))
  const rows = useMemo(() => homeworkRanking(students.filter(s =>
    (type === '전체' || s.school_type === type) && (school === '전체' || s.school === school) &&
    (grade === '전체' || studentGrade(s, Number(month.slice(0, 4))) === Number(grade))), records), [students, records, type, school, grade, month])
  const ranked = rows.reduce<(typeof rows[number] & { rank: number })[]>((result, row, index) => {
    const previous = rows[index - 1]
    const tied = previous && row.rate === previous.rate && row.days === previous.days && row.correct === previous.correct
    result.push({ ...row, rank: tied ? result[index - 1].rank : index + 1 })
    return result
  }, [])
  const percent = (value: number | null) => value === null ? '—' : `${value.toFixed(1)}%`
  return <section className="homework-ranking">
    <style>{`
      .homework-ranking{background:var(--ui-surface);border:1px solid var(--ui-border);border-radius:14px;padding:22px;min-width:0}
      .ranking-filters{display:flex;gap:14px;flex-wrap:wrap;margin:20px 0}.ranking-filters label{font-size:12px;color:var(--ui-text-2);display:flex;flex-direction:column;gap:6px}
      .ranking-filters input,.ranking-filters select{padding:9px 12px;border:1px solid var(--ui-border);border-radius:8px;background:var(--ui-surface);color:var(--ui-text);font:inherit;min-width:120px}
      .ranking-table{width:100%;border-collapse:collapse;font-size:13px;white-space:nowrap}.ranking-table th{background:var(--ui-surface-2);font-weight:500;color:var(--ui-text-2);text-align:left;font-size:12px}.ranking-table th,.ranking-table td{padding:14px 12px;border-bottom:1px solid var(--ui-border)}
      .ranking-table td:nth-child(n+5),.ranking-table th:nth-child(n+5){text-align:right;font-variant-numeric:tabular-nums}.ranking-table tbody tr:hover{background:var(--ui-bg)}
      .ranking-number{display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:30px;border-radius:9px;font-weight:700}.ranking-top{color:var(--ui-primary);background:var(--ui-surface-2)}
      @media(max-width:700px){.homework-ranking{padding:16px}.ranking-filters{gap:10px}.ranking-filters label{flex:1;min-width:125px}.ranking-table th,.ranking-table td{padding:12px 9px}}
    `}</style>
    <h2 style={{ fontSize: 16, fontWeight: 700 }}>월별 숙제 이행률 순위</h2>
    <p style={{ fontSize: 12, color: 'var(--ui-text-2)', marginTop: 6 }}>평균 숙제 이행률 → 수업일수 → 평균 숙제 정답률 순으로 정렬합니다.</p>
    <div className="ranking-filters">
      <label>조회 월<input aria-label="조회 월" type="month" value={month} onChange={e => { if (e.target.value) setMonth(e.target.value) }} /></label>
      <label>학교급<select value={type} onChange={e => { setType(e.target.value); setSchool('전체'); setGrade('전체') }}>{[['전체','전체'],['고등','고등학교'],['중등','중학교'],['초등','초등학교']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>학교<select value={school} onChange={e => setSchool(e.target.value)}><option>전체</option>{schools.map(name => <option key={name}>{name}</option>)}</select></label>
      <label>학년<select value={grade} disabled={type === '전체'} onChange={e => setGrade(e.target.value)}><option>전체</option>{Array.from({ length: type === '초등' ? 6 : 3 }, (_, i) => <option key={i} value={i + 1}>{i + 1}학년</option>)}</select></label>
    </div>
    {loading ? <p role="status" style={{ padding: '40px 0', textAlign: 'center' }}>순위를 불러오는 중…</p> : error ? <p role="alert">{error} <button className="bout" onClick={() => setRetry(v => v + 1)}>다시 시도</button></p> : <>
      <p style={{ fontSize: 12, color: 'var(--ui-text-3)', marginBottom: 12 }}>{month.replace('-', '년 ')}월 · {rows.length}명</p>
      <div style={{ overflowX: 'auto' }}><table className="ranking-table"><thead><tr><th scope="col">순위</th><th scope="col">이름</th><th scope="col">반</th><th scope="col">학교</th><th scope="col">평균 숙제 이행률</th><th scope="col">수업일수</th><th scope="col">평균 숙제 정답률</th></tr></thead><tbody>
        {ranked.map(row => <tr key={row.id}><td><span className={`ranking-number${row.rank <= 3 ? ' ranking-top' : ''}`}>{row.rank}</span></td><td style={{ fontWeight: 600 }}>{row.name}</td><td style={{ whiteSpace: 'normal', minWidth: 100, maxWidth: 220 }}>{classNames[row.id] || '미배정'}</td><td>{row.school || '미등록'}<small style={{ display: 'block', color: 'var(--ui-text-3)', marginTop: 3 }}>{row.school_type ?? ''}{studentGrade(row, Number(month.slice(0, 4))) ? ` · ${studentGrade(row, Number(month.slice(0, 4)))}학년` : ''}</small></td><td style={{ fontWeight: 700, color: 'var(--ui-primary)' }}>{percent(row.rate)}</td><td>{row.days}일</td><td>{percent(row.correct)}</td></tr>)}
        {!rows.length && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '48px 12px', color: 'var(--ui-text-3)' }}>해당 조건의 숙제 이행률 기록이 없습니다.</td></tr>}
      </tbody></table></div>
    </>}
    <p style={{ fontSize: 11, lineHeight: 1.7, color: 'var(--ui-text-3)', marginTop: 16 }}>임시저장 기록은 제외하며, 숙제 없음·미기록 값은 평균에서 제외합니다. 수업일수는 같은 날짜의 기록을 1일로 계산합니다. 모든 기준이 같으면 공동 순위입니다. 학년은 등록된 학교급과 출생연도로 추정합니다.</p>
  </section>
}
