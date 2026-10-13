'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { kstDateTimeOf } from '@/lib/kst'
import { StudyReport, StudyPeriod, studyDuration, studyPeriods } from '@/lib/study'
import styles from './Study.module.css'

export default function StudyRecords({ token, studentId, refresh = 0, initialPeriod = 'today' }: { token?: string; studentId?: number; refresh?: number; initialPeriod?: StudyPeriod }) {
 const [report, setReport] = useState<StudyReport | null>(null)
 const [period, setPeriod] = useState<StudyPeriod>(initialPeriod)
 const [error, setError] = useState('')
 const [retry, setRetry] = useState(0)
 useEffect(() => {
  let active = true
  supabase.rpc('study_report', { p_token: token ?? null, p_student_id: studentId ?? null }).then(({ data, error }) => {
   if (!active) return
   setError(error ? '공부 기록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' : '')
   setReport(error ? null : data as StudyReport)
  })
  return () => { active = false }
 }, [token, studentId, refresh, retry])
 const total = report?.totals.find(t => t.student_id === studentId) ?? report?.totals[0]
 const rows = report?.history.filter(s => s[`${period}_seconds`] > 0) ?? []
 return <section className={styles.card}>
  <h3 className={styles.title}>{token ? '나의 집중 기록' : '학생 집중 기록'}</h3>
  <div className={styles.totals}>{studyPeriods.map(p => <button key={p.id} className={period === p.id ? styles.selected : ''} onClick={() => setPeriod(p.id)} aria-pressed={period === p.id}><span>{p.label}</span><strong>{report ? studyDuration(total?.[p.id] ?? 0) : '—'}</strong></button>)}</div>
  <p className={styles.hint}>한국 시간 기준 · 주간은 월요일부터 · 휴식과 일시정지 제외</p>
  {token && report && <div className={styles.growth}><span>{(total?.today ?? 0) >= 3600 ? '🌳 오늘의 집중 나무 완성!' : (total?.today ?? 0) >= 1800 ? '🌿 집중 새싹이 자라고 있어요' : '🌱 작은 집중이 쌓여 큰 실력이 돼요'}</span><progress max={3600} value={Math.min(total?.today ?? 0, 3600)} /><small>오늘의 60분 도전 · {studyDuration(total?.today ?? 0)}</small></div>}
  {error ? <p role="alert">{error} <button className={styles.secondary} onClick={() => setRetry(v => v + 1)}>다시 불러오기</button></p> : !report ? <p className={styles.hint}>기록 불러오는 중…</p> : <>
   <h4 className={styles.title}>{studyPeriods.find(p => p.id === period)?.label} 공부 목록 <small>{rows.length}개</small></h4>
   {rows.length === 0 ? <p className={styles.empty}>아직 집중 기록이 없어요. 작은 목표부터 시작해보세요.</p> : rows.map(s => <article className={styles.record} key={s.id}><div><strong>{s.goal}</strong><small>{kstDateTimeOf(s.created_at)} · {s.mode === 'stopwatch' ? null : <>{s.focus_minutes}분 집중 / {s.break_minutes}분 휴식 · {s.round}/{s.rounds}회차 · </>}{s.mode === 'stopwatch' && '⏱ 스톱워치 · '}{s.ended_at ? '종료' : '진행 중'}</small></div><b>{studyDuration(s[`${period}_seconds`])}</b></article>)}
  </>}
 </section>
}
