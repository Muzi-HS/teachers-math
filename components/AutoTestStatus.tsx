'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ExamAttempt } from '@/lib/auto-grading'
import { EditableTest } from './TestEditorModal'

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
  return <section style={{ background: '#fff', border: '1px solid #DDE3EE', borderRadius: 12, padding: 16, marginBottom: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <strong style={{ fontSize: 14 }}>자동채점 · {test.is_published ? '공개 중' : '비공개'} · 제출 {attempts.filter(a => a.submitted_at).length}/{ids.length}명</strong>
      <button className="bout" disabled={busy} onClick={publish}>{busy ? '변경 중...' : test.is_published ? '비공개로 전환' : '학생에게 공개'}</button>
    </div>
    <p style={{ fontSize: 12, color: '#4B5C7E', margin: '10px 0' }}>답안 입력 시작 후 2분 · 학생별 1회 응시 · 10초마다 현황 갱신. 비공개로 바꿔도 이미 시작한 응시는 제출할 수 있습니다.</p>
    {error && <p role="alert" style={{ color: '#C0392B', fontSize: 13 }}>{error}</p>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{ids.map(id => {
      const a = attempts.find(a => a.student_id === id)
      return <span key={id} style={{ padding: '6px 10px', background: a?.submitted_at ? '#E0F5EB' : '#F5F7FA', borderRadius: 7, fontSize: 12 }}>
        {students.find(s => s.id === id)?.name ?? `학생 ${id}`} · {a?.submitted_at ? `${a.score}점` : a ? '응시 중' : '미응시'}
      </span>
    })}</div>
  </section>
}
