'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { IconInbox, IconBook } from '@/components/icons'
import TestResultCard from '@/components/TestResultCard'
import HomeworkStatsView from '@/components/HomeworkStatsView'
import TodayClassBanner from '@/components/TodayClassBanner'
import StreakCouponPrompt from '@/components/StreakCouponPrompt'

const navy='#0D2A5E', gold='#D87E13', tx='#0D1B36', tx2='#4B5C7E', tx3='#96A4BF'
const bd='#DDE3EE', bg='#F5F7FA', re='#C0392B', rbg='#FDECEA', gr='#1A7F4E', gbg='#E0F5EB'

type Rec = {
  id: number; date: string; content: string; homework: string
  hw_rate: number; hw_cor: number
  late: boolean; has_test: boolean; class_id: number | null
  record_test_items?: { test_id: number; t_total: number; t_cor: number; t_score: number; tests: { name: string } | null }[]
}

function rateColor(v: number) { return v >= 80 ? gr : v >= 60 ? '#C05621' : re }

// 학생 계정용 수업기록 화면 — 학부모 화면과 같은 기록을 보여주되, 학생에게 필요한
// 숙제 이행률/정답률/숙제/진도(수업 내용)와 시험 결과만 노출한다(수업 태도, 수업
// 피드백, 학부모 의견은 학부모-선생님 사이의 정보라 학생에게는 보여주지 않는다).
export default function StudentRecords() {
  const { student } = useAuth()
  const [recs, setRecs] = useState<Rec[]>([])
  const [classNames, setClassNames] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [showStats, setShowStats] = useState(false)

  useEffect(() => {
    if (!student?.studentId) return
    fetchRecs(student.studentId)
  }, [student?.studentId])

  async function fetchRecs(stuId: number) {
    setLoading(true)
    const { data: recsData } = await supabase
      .from('records')
      .select('id,date,content,homework,hw_rate,hw_cor,late,has_test,class_id')
      .eq('student_id', stuId)
      .eq('is_draft', false)
      .eq('released_to_parent', true)
      .order('date', { ascending: false })

    if (!recsData || recsData.length === 0) { setRecs([]); setLoading(false); return }

    const classIds = [...new Set(recsData.map(r => r.class_id).filter((id): id is number => id != null))]
    if (classIds.length > 0) {
      const { data: classesData } = await supabase.from('classes').select('id,name').in('id', classIds)
      const cmap: Record<number, string> = {}
      for (const c of (classesData ?? [])) cmap[c.id] = c.name
      setClassNames(cmap)
    }

    const recIds = recsData.map(r => r.id)
    const { data: items } = await supabase
      .from('record_test_items').select('id,record_id,test_id,t_total,t_cor,t_score').in('record_id', recIds)

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

    const merged = recsData.map(r => ({ ...r, record_test_items: itemsByRecord[r.id] ?? [] })) as Rec[]
    setRecs(merged)
    setLoading(false)
  }

  // 반이 2개 이상이면 "이번 숙제"를 반별로 나눠 보여준다 — 반 구분 없이 가장 최근
  // 기록 하나만 보여주면 다른 반 숙제가 가려지는 문제가 있었다. recs는 최신순이므로
  // 각 class_id별로 처음 만나는 기록이 그 반의 최신 기록이다. class_id가 없는(레거시)
  // 기록은 하나로 묶어서 보여준다.
  const latestByClass: { classId: number | null; rec: Rec }[] = []
  const seenClassIds = new Set<number | null>()
  for (const r of recs) {
    if (seenClassIds.has(r.class_id)) continue
    seenClassIds.add(r.class_id)
    latestByClass.push({ classId: r.class_id, rec: r })
  }

  const chronoRecs = [...recs].reverse()

  return (
    <div>
      {student?.studentId && <StreakCouponPrompt studentId={student.studentId} chronoRecs={chronoRecs} />}
      <TodayClassBanner studentId={student?.studentId ?? null} />

      {/* 학생 헤더 */}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: '14px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: '50%', background: navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
          {student?.name?.[0]}
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: tx, margin: 0 }}>{student?.name}</p>
          <p style={{ fontSize: 12, color: tx3, margin: '2px 0 0' }}>수업기록 {recs.length}개</p>
        </div>
        <button onClick={() => setShowStats(s => !s)} style={{
          flexShrink: 0, padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          border: `1.5px solid ${showStats ? navy : bd}`, background: showStats ? navy : '#fff',
          color: showStats ? '#fff' : tx2, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          {showStats ? '기록 보기' : '통계 보기'}
        </button>
      </div>

      {showStats ? (
        <HomeworkStatsView recs={recs} studentId={student?.studentId} />
      ) : loading ? (
        <p style={{ textAlign: 'center', color: tx3, padding: '40px 0' }}>불러오는 중...</p>
      ) : recs.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: '60px 0', textAlign: 'center', color: tx3 }}>
          <p style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><IconInbox size={28} /></p>
          <p style={{ fontSize: 14 }}>수업 기록이 없습니다</p>
        </div>
      ) : (
        <>
          {/* 이번 숙제 — 반이 2개 이상이면 반별로 각각의 최신 숙제를 보여준다 */}
          <div style={{
            background: `linear-gradient(135deg,${navy} 0%,#0D2A5E 100%)`, borderRadius: 14,
            padding: '18px 18px', marginBottom: 16, color: '#fff',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <IconBook size={15} />
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: .5 }}>이번 숙제</span>
            </div>
            {latestByClass.map(({ classId, rec }, idx) => (
              <div key={classId ?? 'none'} style={{ marginTop: idx > 0 ? 14 : 0, paddingTop: idx > 0 ? 14 : 0, borderTop: idx > 0 ? '1px solid rgba(255,255,255,.15)' : undefined }}>
                {latestByClass.length > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#F09830', background: 'rgba(255,255,255,.12)', padding: '2px 8px', borderRadius: 20 }}>
                      {classId != null ? (classNames[classId] ?? '반 정보 없음') : '반 정보 없음'}
                    </span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,.55)' }}>{rec.date}</span>
                  </div>
                )}
                {latestByClass.length === 1 && (
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', display: 'block', marginBottom: 4 }}>{rec.date}</span>
                )}
                <p style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
                  {rec.homework ? rec.homework : '등록된 숙제가 없습니다'}
                </p>
              </div>
            ))}
          </div>

          {recs.map(r => {
            const tItems = r.record_test_items ?? []
            return (
              <div key={r.id} style={{ background: '#fff', border: `1px solid ${bd}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
                {/* 헤더 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid ${bd}` }}>
                  <b style={{ fontSize: 14, color: tx }}>{r.date}</b>
                  {r.class_id != null && classNames[r.class_id] && (
                    <span style={{ background: bg, color: tx2, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>{classNames[r.class_id]}</span>
                  )}
                  {r.late
                    ? <span style={{ background: rbg, color: re, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>지각</span>
                    : <span style={{ background: gbg, color: gr, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>정시 등원</span>
                  }
                  {r.has_test && <span style={{ background: '#E8EEF8', color: navy, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>시험</span>}
                </div>

                {/* 숙제 이행률/정답률 — 원형 게이지 (수업 태도는 학생에게 비노출) */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1, minWidth: 0, background: bg, borderRadius: 10, padding: '8px 10px' }}>
                    <p style={{ fontSize: 11, color: navy, fontWeight: 600, margin: '0 0 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>숙제 이행률</p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                      {r.hw_rate === -1
                        ? <p style={{ fontSize: 12, color: tx3, margin: 0, whiteSpace: 'nowrap' }}>숙제 없음</p>
                        : r.hw_rate === -2
                        ? <p style={{ fontSize: 12, color: re, margin: 0, whiteSpace: 'nowrap' }}>숙제 미제출</p>
                        : <p style={{ fontSize: 18, fontWeight: 700, color: rateColor(r.hw_rate), margin: 0, lineHeight: 1, whiteSpace: 'nowrap' }}>{r.hw_rate}<span style={{ fontSize: 11, fontWeight: 400, color: tx2 }}>%</span></p>
                      }
                      {r.hw_rate >= 0 && (
                        <svg width="28" height="28" viewBox="0 0 32 32" style={{ flexShrink: 0 }}>
                          <circle cx="16" cy="16" r="12.5" fill="none" stroke={bd} strokeWidth={3.2}/>
                          <circle cx="16" cy="16" r="12.5" fill="none" stroke={rateColor(r.hw_rate)} strokeWidth={3.2}
                            strokeDasharray={78.5} strokeDashoffset={78.5 * (1 - r.hw_rate / 100)}
                            strokeLinecap="round" transform="rotate(-90 16 16)"/>
                        </svg>
                      )}
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0, background: bg, borderRadius: 10, padding: '8px 10px' }}>
                    <p style={{ fontSize: 11, color: navy, fontWeight: 600, margin: '0 0 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>숙제 정답률</p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                      {r.hw_cor < 0
                        ? <p style={{ fontSize: 12, color: tx3, margin: 0, whiteSpace: 'nowrap' }}>채점 안함</p>
                        : <p style={{ fontSize: 18, fontWeight: 700, color: rateColor(r.hw_cor), margin: 0, lineHeight: 1, whiteSpace: 'nowrap' }}>{r.hw_cor}<span style={{ fontSize: 11, fontWeight: 400, color: tx2 }}>%</span></p>
                      }
                      {r.hw_cor >= 0 && (
                        <svg width="28" height="28" viewBox="0 0 32 32" style={{ flexShrink: 0 }}>
                          <circle cx="16" cy="16" r="12.5" fill="none" stroke={bd} strokeWidth={3.2}/>
                          <circle cx="16" cy="16" r="12.5" fill="none" stroke={rateColor(r.hw_cor)} strokeWidth={3.2}
                            strokeDasharray={78.5} strokeDashoffset={78.5 * (1 - r.hw_cor / 100)}
                            strokeLinecap="round" transform="rotate(-90 16 16)"/>
                        </svg>
                      )}
                    </div>
                  </div>
                </div>

                {/* 진도(수업 내용) */}
                {r.content && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
                    <div style={{ width: 3, alignSelf: 'stretch', background: navy, borderRadius: 2, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: navy, margin: '0 0 1px' }}>진도</p>
                      <p style={{ fontSize: 13, color: tx, margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{r.content}</p>
                    </div>
                  </div>
                )}

                {/* 숙제 */}
                {r.homework && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: tItems.length > 0 ? 10 : 0, alignItems: 'flex-start' }}>
                    <div style={{ width: 3, alignSelf: 'stretch', background: gold, borderRadius: 2, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: gold, margin: '0 0 1px' }}>숙제</p>
                      <p style={{ fontSize: 13, color: tx, margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{r.homework}</p>
                    </div>
                  </div>
                )}

                {/* 시험 결과 — 학부모 화면과 동일하게 노출 */}
                {tItems.length > 0 && tItems.map((ti, idx) => {
                  const pct = ti.t_total > 0 ? Math.round(ti.t_cor / ti.t_total * 100) : 0
                  return (
                    <TestResultCard key={idx}
                      testName={ti.tests?.name ?? '시험'}
                      score={ti.t_score} cor={ti.t_cor} total={ti.t_total}
                      pct={pct} testId={ti.test_id} />
                  )
                })}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
