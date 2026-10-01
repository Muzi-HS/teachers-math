'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ExamAttempt } from '@/lib/auto-grading'
import { EditableTest } from './TestEditorModal'
import AddTestAssigneesModal from './AddTestAssigneesModal'

type Batch = { id: number; name: string; answer_entry_open: boolean }

const navy = 'var(--ui-primary)', gold = 'var(--ui-primary)', bd = 'var(--ui-border)', bg = 'var(--ui-bg)'
const tx2 = 'var(--ui-text-2)', tx3 = 'var(--ui-text-3)', gr = 'var(--ui-success)', gbg = 'var(--ui-success-bg)', re = 'var(--ui-danger)'

export default function AutoTestStatus({ test, students, onResults }: {
  test: EditableTest; students: { id: number; name: string }[]
  onResults: () => void
}) {
  const [ids, setIds] = useState<number[]>([])
  const [attempts, setAttempts] = useState<ExamAttempt[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const callback = useRef(onResults)
  useEffect(() => { callback.current = onResults }, [onResults])
  useEffect(() => {
    let cancelled = false
    let signature = ''
    async function load() {
      const [s, a, b] = await Promise.all([
        supabase.from('test_assignees').select('student_id').eq('test_id', test.id),
        supabase.from('test_attempts').select('*').eq('test_id', test.id),
        supabase.from('test_batches').select('id,name,answer_entry_open').eq('test_id', test.id).order('round_number'),
      ])
      if (cancelled) return
      if (s.error || a.error || b.error) { setError('회차별 응시 현황을 불러오지 못했습니다. test_batch_entry_migration.sql을 적용했는지 확인하세요.'); return }
      setError(''); setIds((s.data ?? []).map(row => row.student_id)); setAttempts(a.data ?? []); setBatches(b.data ?? [])
      const next = JSON.stringify((a.data ?? []).map(row => [row.id, row.submitted_at, row.score]))
      if (signature !== next) { signature = next; callback.current() }
    }
    void load()
    const timer = setInterval(() => { void load() }, 10000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [test.id])
  async function openBatch(batch: Batch) {
    if (batch.answer_entry_open || !window.confirm(`“${batch.name}” 학생들이 답안을 입력할 수 있도록 열까요?`)) return
    setBusy(true); setError('')
    const { error } = await supabase.rpc('open_test_batch_entry', { p_test_id: test.id, p_batch_id: batch.id })
    setBusy(false)
    if (error) setError(error.message)
    else setBatches(current => current.map(row => row.id === batch.id ? { ...row, answer_entry_open: true } : row))
  }

  const submitted = attempts.filter(a => a.submitted_at).length
  const inProgress = attempts.filter(a => !a.submitted_at).length
  const notStarted = ids.length - attempts.length

  return <section className="ats-card">
    <style>{`
      .ats-card{background:#fff;border:1px solid ${bd};border-radius:14px;padding:18px 20px;margin-bottom:18px;box-shadow:0 1px 4px rgba(0,0,0,.06)}
      .ats-top{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
      .ats-status{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:700}
      .ats-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
      .ats-btn{padding:9px 16px;border-radius:9px;border:none;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap}
      .ats-btn:disabled{opacity:.6;cursor:default}
      .ats-btn.on{background:#fff;color:${tx2};border:1.5px solid ${bd}}
      .ats-btn.off{background:${gold};color:var(--ui-primary-text)}
      .ats-stats{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap}
      .ats-stat{flex:1;min-width:88px;background:${bg};border-radius:10px;padding:10px 12px;text-align:center}
      .ats-stat b{display:block;font-size:19px;line-height:1.3}
      .ats-stat span{display:block;font-size:11px;color:${tx3};margin-top:2px}
      .ats-help{font-size:12px;color:${tx3};margin:14px 0 4px;line-height:1.6}
      .ats-roster{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}
      .ats-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:20px;font-size:12px;font-weight:600;border:1px solid transparent}
      .ats-rounds{display:grid;gap:8px;margin-top:16px}
      .ats-round{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid ${bd};border-radius:10px;padding:10px 12px;flex-wrap:wrap}
      .ats-round span{font-size:13px;font-weight:700}
    `}</style>
    <div className="ats-top">
      <span className="ats-status" style={{ color: gr }}>
        <span className="ats-dot" style={{ background: gr }} />
        회차별 답안 입력
      </span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="ats-btn on" onClick={() => setAdding(true)}>회차 추가</button>
      </div>
    </div>

    <div className="ats-rounds">{batches.map(batch => <div className="ats-round" key={batch.id}>
      <span>{batch.name}</span>
      {batch.answer_entry_open
        ? <strong style={{ color: gr, fontSize: 12 }}>답안 입력 열림</strong>
        : <button className="ats-btn off" disabled={busy} onClick={() => { void openBatch(batch) }}>{busy ? '처리 중...' : '답안 입력 열기'}</button>}
    </div>)}</div>

    <div className="ats-stats">
      <div className="ats-stat"><b style={{ color: gr }}>{submitted}</b><span>제출 완료</span></div>
      <div className="ats-stat"><b style={{ color: gold }}>{inProgress}</b><span>응시 중</span></div>
      <div className="ats-stat"><b style={{ color: tx3 }}>{notStarted}</b><span>미응시</span></div>
      <div className="ats-stat"><b style={{ color: navy }}>{ids.length}</b><span>전체 대상</span></div>
    </div>

    <p className="ats-help">선생님이 회차를 열면 그 회차의 학생이 직접 답안을 입력합니다. 학생이 시작한 뒤 2분이 지나면 자동 제출되고 점수와 정오표를 바로 확인할 수 있습니다. 현황은 10초마다 갱신됩니다.</p>
    {error && <p role="alert" style={{ color: re, fontSize: 13 }}>{error}</p>}

    <div className="ats-roster">{ids.map(id => {
      const a = attempts.find(a => a.student_id === id)
      const label = students.find(s => s.id === id)?.name ?? `학생 ${id}`
      const style = a?.submitted_at
        ? { background: gbg, color: gr }
        : a
        ? { background: 'var(--ui-warning-bg)', color: 'var(--ui-warning)' }
        : { background: bg, color: tx3 }
      return <span key={id} className="ats-chip" style={style}>
        {label} · {a?.submitted_at ? `${a.score}점` : a ? '응시 중' : '미응시'}
      </span>
    })}</div>
    {adding && <AddTestAssigneesModal testId={test.id} students={students} assignedIds={ids} onClose={() => setAdding(false)} onSaved={added => {
      setIds(current => [...new Set([...current, ...added])]); setAdding(false)
      void supabase.from('test_batches').select('id,name,answer_entry_open').eq('test_id', test.id).order('round_number')
        .then(({ data }) => { if (data) setBatches(data) })
    }} />}
  </section>
}
