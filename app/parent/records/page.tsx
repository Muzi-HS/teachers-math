'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useParentChild } from '../layout'

const navy='#0D2A5E', gold='#D87E13', tx='#0D1B36', tx2='#4B5C7E', tx3='#96A4BF'
const bd='#DDE3EE', bg='#F5F7FA', re='#C0392B', rbg='#FDECEA', gr='#1A7F4E', gbg='#E0F5EB'

type Rec = {
  id: number; date: string; content: string; homework: string
  hw_rate: number; hw_cor: number; attitude: number
  late: boolean; has_test: boolean; feedback: string
  record_test_items?: { test_id: number; t_total: number; t_cor: number; t_score: number; tests: { name: string } | null }[]
}

function rateColor(v: number) { return v >= 80 ? gr : v >= 60 ? '#C05621' : re }
function attColor(v: number)  { return v >= 8  ? gr : v >= 5  ? '#C05621' : re }
function attLabel(v: number)  { return v >= 8  ? '우수' : v >= 5 ? '보통' : '노력필요' }

function TestResultCard({ testName, score, cor, total, pct, testId }: {
  testName: string; score: number; cor: number; total: number; pct: number; testId: number
}) {
  const [stats, setStats] = useState<{ avg: number; max: number; rank: number; totalCnt: number } | null>(null)

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
      list.sort((a, b) => b.score - a.score)
      const avg = Math.round(list.reduce((a, b) => a + b.score, 0) / list.length)
      const max = list[0].score
      const rankIdx = list.findIndex(s => s.score === score)
      setStats({ avg, max, rank: rankIdx >= 0 ? rankIdx + 1 : 0, totalCnt: list.length })
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

export default function ParentRecords() {
  const { selChild, setSelChild, children } = useParentChild()
  const [recs,    setRecs]    = useState<Rec[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selChild) return
    fetchRecs(selChild)
  }, [selChild])

  async function fetchRecs(stuId: number) {
    setLoading(true)
    const { data: recsData } = await supabase
      .from('records')
      .select('*')
      .eq('student_id', stuId)
      .eq('is_draft', false)
      .order('date', { ascending: false })

    if (!recsData || recsData.length === 0) { setRecs([]); setLoading(false); return }

    const recIds = recsData.map(r => r.id)
    const { data: items } = await supabase
      .from('record_test_items')
      .select('id,record_id,test_id,t_total,t_cor,t_score')
      .in('record_id', recIds)

    const testIds = [...new Set((items ?? []).map((x: any) => x.test_id))]
    let testsMap: Record<number, string> = {}
    if (testIds.length > 0) {
      const { data: testsData } = await supabase.from('tests').select('id,name').in('id', testIds)
      for (const t of (testsData ?? [])) testsMap[t.id] = t.name
    }

    const itemsByRecord: Record<number, any[]> = {}
    for (const item of (items ?? [])) {
      if (!itemsByRecord[item.record_id]) itemsByRecord[item.record_id] = []
      itemsByRecord[item.record_id].push({
        test_id: item.test_id, t_total: item.t_total,
        t_cor: item.t_cor, t_score: item.t_score,
        tests: { name: testsMap[item.test_id] ?? '' },
      })
    }

    setRecs(recsData.map(r => ({ ...r, record_test_items: itemsByRecord[r.id] ?? [] })) as Rec[])
    setLoading(false)
  }

  const curChild = children.find(c => c.id === selChild)

  return (
    <div>
      {/* 자녀 선택 안 된 경우 */}
      {!selChild ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <p style={{ fontSize: 28, marginBottom: 8 }}>👆</p>
          <p style={{ fontSize: 14, color: tx3 }}>위에서 자녀를 선택해주세요</p>
        </div>
      ) : (
        <>
          {/* 학생 헤더 */}
          <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: '14px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: '50%', background: navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
              {curChild?.name[0]}
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: tx, margin: 0 }}>{curChild?.name}</p>
              <p style={{ fontSize: 12, color: tx3, margin: '2px 0 0' }}>수업기록 {recs.length}개</p>
            </div>
          </div>

          {loading ? (
            <p style={{ textAlign: 'center', color: tx3, padding: '40px 0' }}>불러오는 중...</p>
          ) : recs.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: '60px 0', textAlign: 'center', color: tx3 }}>
              <p style={{ fontSize: 28, marginBottom: 8 }}>📭</p>
              <p style={{ fontSize: 14 }}>수업 기록이 없습니다</p>
            </div>
          ) : recs.map(r => {
            const tItems = r.record_test_items ?? []
            return (
              <div key={r.id} style={{ background: '#fff', border: `1px solid ${bd}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
                {/* 헤더 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid ${bd}` }}>
                  <b style={{ fontSize: 14, color: tx }}>{r.date}</b>
                  {r.late
                    ? <span style={{ background: rbg, color: re, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>지각</span>
                    : <span style={{ background: gbg, color: gr, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>정시</span>
                  }
                  {r.has_test && <span style={{ background: '#E8EEF8', color: navy, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>시험</span>}
                </div>

                {/* 이행률/정답률/태도 — 원형 게이지 */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1, background: bg, borderRadius: 10, padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ fontSize: 11, color: navy, fontWeight: 600, margin: '0 0 2px' }}>숙제 이행률</p>
                      {r.hw_rate < 0
                        ? <p style={{ fontSize: 13, color: tx3, margin: 0 }}>숙제 없음</p>
                        : <p style={{ fontSize: 18, fontWeight: 700, color: rateColor(r.hw_rate), margin: 0, lineHeight: 1 }}>{r.hw_rate}<span style={{ fontSize: 11, fontWeight: 400, color: tx2 }}>%</span></p>
                      }
                    </div>
                    {r.hw_rate >= 0 && (
                      <svg width="32" height="32" viewBox="0 0 32 32">
                        <circle cx="16" cy="16" r="12.5" fill="none" stroke={bd} strokeWidth={3.2}/>
                        <circle cx="16" cy="16" r="12.5" fill="none" stroke={rateColor(r.hw_rate)} strokeWidth={3.2}
                          strokeDasharray={78.5} strokeDashoffset={78.5 * (1 - r.hw_rate / 100)}
                          strokeLinecap="round" transform="rotate(-90 16 16)"/>
                      </svg>
                    )}
                  </div>
                  <div style={{ flex: 1, background: bg, borderRadius: 10, padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ fontSize: 11, color: navy, fontWeight: 600, margin: '0 0 2px' }}>숙제 정답률</p>
                      {r.hw_cor < 0
                        ? <p style={{ fontSize: 13, color: tx3, margin: 0 }}>채점 안함</p>
                        : <p style={{ fontSize: 18, fontWeight: 700, color: rateColor(r.hw_cor), margin: 0, lineHeight: 1 }}>{r.hw_cor}<span style={{ fontSize: 11, fontWeight: 400, color: tx2 }}>%</span></p>
                      }
                    </div>
                    {r.hw_cor >= 0 && (
                      <svg width="32" height="32" viewBox="0 0 32 32">
                        <circle cx="16" cy="16" r="12.5" fill="none" stroke={bd} strokeWidth={3.2}/>
                        <circle cx="16" cy="16" r="12.5" fill="none" stroke={rateColor(r.hw_cor)} strokeWidth={3.2}
                          strokeDasharray={78.5} strokeDashoffset={78.5 * (1 - r.hw_cor / 100)}
                          strokeLinecap="round" transform="rotate(-90 16 16)"/>
                      </svg>
                    )}
                  </div>
                  {r.attitude != null && (
                    <div style={{ flex: 1, background: bg, borderRadius: 10, padding: '8px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <p style={{ fontSize: 11, color: navy, fontWeight: 600, margin: '0 0 2px' }}>수업 태도</p>
                      <p style={{ fontSize: 18, fontWeight: 700, color: attColor(r.attitude), margin: 0, lineHeight: 1 }}>{r.attitude}<span style={{ fontSize: 11, fontWeight: 400, color: tx2 }}>점</span></p>
                      <span style={{ fontSize: 10, color: attColor(r.attitude), marginTop: 2 }}>{attLabel(r.attitude)}</span>
                    </div>
                  )}
                </div>

                {/* 수업 내용 */}
                {r.content && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
                    <div style={{ width: 3, alignSelf: 'stretch', background: navy, borderRadius: 2, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: navy, margin: '0 0 1px' }}>수업 내용</p>
                      <p style={{ fontSize: 13, color: tx, margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{r.content}</p>
                    </div>
                  </div>
                )}

                {/* 숙제 */}
                {r.homework && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 3, alignSelf: 'stretch', background: gold, borderRadius: 2, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: gold, margin: '0 0 1px' }}>숙제</p>
                      <p style={{ fontSize: 13, color: tx, margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{r.homework}</p>
                    </div>
                  </div>
                )}

                {/* 시험 결과 */}
                {tItems.length > 0 && tItems.map((ti, idx) => {
                  const pct = ti.t_total > 0 ? Math.round(ti.t_cor / ti.t_total * 100) : 0
                  return (
                    <TestResultCard key={idx}
                      testName={ti.tests?.name ?? '시험'}
                      score={ti.t_score} cor={ti.t_cor} total={ti.t_total}
                      pct={pct} testId={ti.test_id} />
                  )
                })}

                {/* 피드백 */}
                {r.feedback && (
                  <div style={{ background: 'rgba(13,42,94,.05)', borderLeft: `3px solid ${navy}`, borderRadius: '0 8px 8px 0', padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                      <div style={{ width: 3, height: 14, background: navy, borderRadius: 2 }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: navy }}>수업 피드백</span>
                    </div>
                    <p style={{ fontSize: 14, color: tx, lineHeight: 1.6, margin: 0 }}>{r.feedback}</p>
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
