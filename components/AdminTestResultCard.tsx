'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { navy, tx, tx2, tx3, bd, gr, re, gbg } from '@/lib/ui-tokens'

// 수업기록(관리자) 화면 전용 시험 결과 카드 — 학부모/학생용 components/TestResultCard.tsx와
// 달리 등수(순위/전체 응시자 수)까지 함께 보여준다.
export default function AdminTestResultCard({ testName, score, cor, total, pct, testId }: {
  testName: string; score: number; cor: number; total: number; pct: number; testId: number
}) {
  const [stats, setStats] = useState<{ avg: number; max: number; rank: number; totalCnt: number } | null>(null)

  useEffect(() => {
    async function load() {
      const { data: sc } = await supabase.from('test_scores').select('student_id, score').eq('test_id', testId)
      let list = (sc??[]).map(s=>({student_id:s.student_id, score:s.score}))

      if (list.length === 0) {
        const { data: items } = await supabase.from('record_test_items').select('record_id, t_score, t_cor, t_total').eq('test_id', testId)
        if (items && items.length > 0) {
          const recIds = items.map(x=>x.record_id)
          const { data: recsData } = await supabase.from('records').select('id, student_id').in('id', recIds)
          const recMap: Record<number, number> = {}
          for (const r of (recsData??[])) recMap[r.id] = r.student_id
          const byStudent = new Map<number, number>()
          for (const item of items) {
            const sid = recMap[item.record_id]
            if (!sid) continue
            const s = item.t_score ? item.t_score : (item.t_total>0 ? Math.round(item.t_cor/item.t_total*100) : 0)
            if (!byStudent.has(sid) || s > byStudent.get(sid)!) byStudent.set(sid, s)
          }
          list = [...byStudent.entries()].map(([student_id, score])=>({student_id, score}))
        }
      }
      if (list.length === 0) return
      list.sort((a,b)=>b.score-a.score)
      const avg = Math.round(list.reduce((a,b)=>a+b.score,0)/list.length)
      const max = list[0].score
      // 내 점수와 일치하는 항목 기준으로 순위 추정 (student_id 모르므로 score로 근사)
      const rankIdx = list.findIndex(s=>s.score===score)
      setStats({ avg, max, rank: rankIdx>=0?rankIdx+1:0, totalCnt: list.length })
    }
    load()
  }, [testId, score])

  const diff = stats ? score - stats.avg : null

  return (
    <div style={{ border: `1px solid ${bd}`, borderRadius: 10, padding: 12, marginBottom: 8, background: '#fff' }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: tx, margin: '0 0 8px' }}>{testName}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 2 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: navy, lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 13, color: tx2 }}>점</span>
        {stats && stats.totalCnt > 0 && (
          <span style={{ marginLeft: 'auto', background: gbg, color: gr, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20 }}>
            {stats.rank}등 / {stats.totalCnt}명
          </span>
        )}
      </div>
      <p style={{ fontSize: 11, color: tx2, margin: '0 0 10px' }}>{cor}/{total}문항 정답 (정답률 {pct}%)</p>

      <div style={{ height: 1, background: bd, marginBottom: 8 }} />

      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <p style={{ fontSize: 10, color: tx3, margin: '0 0 3px' }}>시험평균</p>
          <p style={{ fontSize: 14, fontWeight: 700, color: stats?tx:tx3, margin: 0 }}>{stats?`${stats.avg}점`:'—'}</p>
        </div>
        <div style={{ width: 1, height: 26, background: bd }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <p style={{ fontSize: 10, color: tx3, margin: '0 0 3px' }}>최고점</p>
          <p style={{ fontSize: 14, fontWeight: 700, color: stats?tx:tx3, margin: 0 }}>{stats?`${stats.max}점`:'—'}</p>
        </div>
        <div style={{ width: 1, height: 26, background: bd }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <p style={{ fontSize: 10, color: tx3, margin: '0 0 3px' }}>평균과 차이</p>
          <p style={{ fontSize: 14, fontWeight: 700, color: diff==null?tx3:diff>=0?gr:re, margin: 0 }}>
            {diff==null?'—':(diff>0?'+':'')+diff+'점'}
          </p>
        </div>
      </div>
    </div>
  )
}
