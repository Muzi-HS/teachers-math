'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ExamAttempt } from '@/lib/auto-grading'
import { EditableTest } from './TestEditorModal'

const navy = '#0D2A5E', gold = '#D87E13', bd = '#DDE3EE', bg = '#F5F7FA'
const tx2 = '#4B5C7E', tx3 = '#96A4BF', gr = '#1A7F4E', gbg = '#E0F5EB', re = '#C0392B'

export default function AutoTestStatus({ test, students, onPublished, onResults }: {
  test: EditableTest; students: { id: number; name: string }[]
  onPublished: (value: boolean) => void; onResults: () => void
}) {
  const [ids, setIds] = useState<number[]>([])
  const [attempts, setAttempts] = useState<ExamAttempt[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const callback = useRef(onResults)
  useEffect(() => { callback.current = onResults }, [onResults])
  useEffect(() => {
    let cancelled = false
    let signature = ''
    async function load() {
      const [s, a] = await Promise.all([
        supabase.from('test_assignees').select('student_id').eq('test_id', test.id),
        supabase.from('test_attempts').select('*').eq('test_id', test.id),
      ])
      if (cancelled) return
      if (s.error || a.error) { setError('응시 현황을 불러오지 못했습니다.'); return }
      setError(''); setIds((s.data ?? []).map(row => row.student_id)); setAttempts(a.data ?? [])
      const next = JSON.stringify((a.data ?? []).map(row => [row.id, row.submitted_at, row.score]))
      if (signature !== next) { signature = next; callback.current() }
    }
    void load()
    const timer = setInterval(() => { void load() }, 10000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [test.id])
  async function publish() {
    setBusy(true); setError('')
    const { error } = await supabase.rpc('publish_auto_test', { p_id: test.id, p_published: !test.is_published })
    setBusy(false)
    if (error) setError(error.message)
    else onPublished(!test.is_published)
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
      .ats-btn.off{background:${gold};color:#3A2205}
      .ats-stats{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap}
      .ats-stat{flex:1;min-width:88px;background:${bg};border-radius:10px;padding:10px 12px;text-align:center}
      .ats-stat b{display:block;font-size:19px;line-height:1.3}
      .ats-stat span{display:block;font-size:11px;color:${tx3};margin-top:2px}
      .ats-help{font-size:12px;color:${tx3};margin:14px 0 4px;line-height:1.6}
      .ats-roster{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}
      .ats-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:20px;font-size:12px;font-weight:600;border:1px solid transparent}
    `}</style>
    <div className="ats-top">
      <span className="ats-status" style={{ color: test.is_published ? gr : tx3 }}>
        <span className="ats-dot" style={{ background: test.is_published ? gr : tx3 }} />
        {test.is_published ? '학생에게 공개 중' : '비공개'}
      </span>
      <button className={`ats-btn ${test.is_published ? 'on' : 'off'}`} disabled={busy} onClick={publish}>
        {busy ? '변경 중...' : test.is_published ? '비공개로 전환' : '학생에게 공개'}
      </button>
    </div>

    <div className="ats-stats">
      <div className="ats-stat"><b style={{ color: gr }}>{submitted}</b><span>제출 완료</span></div>
      <div className="ats-stat"><b style={{ color: gold }}>{inProgress}</b><span>응시 중</span></div>
      <div className="ats-stat"><b style={{ color: tx3 }}>{notStarted}</b><span>미응시</span></div>
      <div className="ats-stat"><b style={{ color: navy }}>{ids.length}</b><span>전체 대상</span></div>
    </div>

    <p className="ats-help">답안 입력 시작 후 2분간 응시할 수 있고, 학생별로 한 번만 응시할 수 있습니다. 현황은 10초마다 자동 갱신됩니다. 비공개로 바꿔도 이미 시작한 응시는 계속 제출할 수 있습니다.</p>
    {error && <p role="alert" style={{ color: re, fontSize: 13 }}>{error}</p>}

    <div className="ats-roster">{ids.map(id => {
      const a = attempts.find(a => a.student_id === id)
      const label = students.find(s => s.id === id)?.name ?? `학생 ${id}`
      const style = a?.submitted_at
        ? { background: gbg, color: gr }
        : a
        ? { background: '#FFF3E0', color: '#B36A00' }
        : { background: bg, color: tx3 }
      return <span key={id} className="ats-chip" style={style}>
        {label} · {a?.submitted_at ? `${a.score}점` : a ? '응시 중' : '미응시'}
      </span>
    })}</div>
  </section>
}
