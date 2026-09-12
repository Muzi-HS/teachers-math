'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const navy = '#0D2A5E', tx = '#0D1B36', tx2 = '#4B5C7E', tx3 = '#96A4BF', bd = '#DDE3EE'

// 학부모/학생 화면이 공유하는 시험 결과 카드 — 등수는 관리자 화면에서만 노출하고
// 여기서는 시험평균/최고점만 보여준다.
export default function TestResultCard({ testName, score, cor, total, pct, testId }: {
  testName: string; score: number; cor: number; total: number; pct: number; testId: number
}) {
  const [stats, setStats] = useState<{ avg: number; max: number } | null>(null)

  useEffect(() => {
    async function load() {
      const { data: sc } = await supabase.from('test_scores').select('student_id,score').eq('test_id', testId)
      let list = (sc ?? []).map(s => ({ student_id: s.student_id, score: s.score }))

      if (list.length === 0) {
        const { data: items } = await supabase.from('record_test_items').select('record_id,t_score,t_cor,t_total').eq('test_id', testId)
        if (items && items.length > 0) {
          const recIds = items.map(x => x.record_id)
          const { data: recsData } = await supabase.from('records').select('id,student_id').in('id', recIds)
          const recMap: Record<number, number> = {}
          for (const r of (recsData ?? [])) recMap[r.id] = r.student_id
          const byStudent = new Map<number, number>()
          for (const item of items) {
            const sid = recMap[item.record_id]
            if (!sid) continue
            const s = item.t_score ? item.t_score : (item.t_total > 0 ? Math.round(item.t_cor / item.t_total * 100) : 0)
            if (!byStudent.has(sid) || s > byStudent.get(sid)!) byStudent.set(sid, s)
          }
          list = [...byStudent.entries()].map(([student_id, score]) => ({ student_id, score }))
        }
      }
      if (list.length === 0) return
      const avg = Math.round(list.reduce((a, b) => a + b.score, 0) / list.length)
      const max = Math.max(...list.map(s => s.score))
      setStats({ avg, max })
    }
    load()
  }, [testId, score])

  return (
    <div style={{ border: `1px solid ${bd}`, borderRadius: 10, padding: 12, marginBottom: 8, background: '#fff' }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: tx, margin: '0 0 8px' }}>{testName}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 2 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: navy, lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 13, color: tx2 }}>점</span>
      </div>
      <p style={{ fontSize: 11, color: tx2, margin: '0 0 10px' }}>{cor}/{total}문항 정답 (정답률 {pct}%)</p>

      <div style={{ height: 1, background: bd, marginBottom: 8 }} />

      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <p style={{ fontSize: 10, color: tx3, margin: '0 0 3px' }}>시험평균</p>
          <p style={{ fontSize: 14, fontWeight: 700, color: stats ? tx : tx3, margin: 0 }}>{stats ? `${stats.avg}점` : '—'}</p>
        </div>
        <div style={{ width: 1, height: 26, background: bd }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <p style={{ fontSize: 10, color: tx3, margin: '0 0 3px' }}>최고점</p>
          <p style={{ fontSize: 14, fontWeight: 700, color: stats ? tx : tx3, margin: 0 }}>{stats ? `${stats.max}점` : '—'}</p>
        </div>
      </div>
    </div>
  )
}
