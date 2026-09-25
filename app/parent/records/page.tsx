'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useParentChild } from '../layout'
import { IconArrowUp, IconInbox, IconSend, IconPencil } from '@/components/icons'
import { RecordComment, groupCommentsByRecord } from '@/lib/records'
import TestResultCard from '@/components/TestResultCard'
import HomeworkStatsView from '@/components/HomeworkStatsView'
import TodayClassBanner from '@/components/TodayClassBanner'

const navy='var(--ui-primary)', gold='var(--ui-primary)', tx='var(--ui-text)', tx2='var(--ui-text-2)', tx3='var(--ui-text-3)'
const bd='var(--ui-border)', bg='var(--ui-bg)', re='var(--ui-danger)', rbg='var(--ui-danger-bg)', gr='var(--ui-success)', gbg='var(--ui-success-bg)'

type Rec = {
  id: number; date: string; content: string; homework: string
  hw_rate: number; hw_cor: number; attitude: number
  late: boolean; has_test: boolean; feedback: string
  viewed_at: string | null; class_id: number | null; edited_at: string | null
  record_test_items?: { test_id: number; t_total: number; t_cor: number; t_score: number; tests: { name: string } | null }[]
}

function rateColor(v: number) { return v >= 80 ? gr : v >= 60 ? 'var(--ui-warning)' : re }
function attColor(v: number)  { return v >= 8  ? gr : v >= 5  ? 'var(--ui-warning)' : re }
function attLabel(v: number)  { return v >= 8  ? '우수' : v >= 5 ? '보통' : '노력필요' }

export default function ParentRecords() {
  const { parent } = useAuth()
  const { selChild, children } = useParentChild()
  const [recs,    setRecs]    = useState<Rec[]>([])
  const [loading, setLoading] = useState(false)
  const [comments, setComments] = useState<RecordComment[]>([])
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({})
  const [sendingId, setSendingId] = useState<number | null>(null)
  const [commentErr, setCommentErr] = useState<Record<number, string>>({})
  const [showStats, setShowStats] = useState(false)
  const [classNames, setClassNames] = useState<Record<number, string>>({})
  const [editedNotice, setEditedNotice] = useState<{ id: number; date: string }[]>([])

  useEffect(() => {
    if (!selChild || !parent?.sessionToken) return
    const controller = new AbortController()
    fetchRecs(selChild, parent.sessionToken, controller.signal)
    return () => controller.abort()
  }, [selChild, parent?.sessionToken])

  async function fetchRecs(stuId: number, token: string, signal: AbortSignal) {
    setLoading(true)
    setRecs([])
    setComments([])
    setClassNames({})
    setEditedNotice([])
    // 반드시 client_records RPC를 거친다 — 이 학부모 토큰이 실제로 이 학생의 보호자인지
    // 서버(DB)가 확인한 뒤에만 기록을 돌려준다. records 테이블은 더 이상 직접 조회할 수 없다.
    const { data: recsRaw } = await supabase
      .rpc('client_records', { p_token: token, p_student_id: stuId })
      .abortSignal(signal)
    const recsData = recsRaw as Rec[] | null

    if (signal.aborted) return
    if (!recsData || recsData.length === 0) { setRecs([]); setComments([]); setLoading(false); return }

    // 반이 2개 이상인 학생은 기록마다 어느 반 숙제인지 배지로 구분해서 보여준다
    const classIds = [...new Set(recsData.map(r => r.class_id).filter((id): id is number => id != null))]
    if (classIds.length > 0) {
      const { data: classesData } = await supabase.from('classes').select('id,name').in('id', classIds).abortSignal(signal)
      if (signal.aborted) return
      const cmap: Record<number, string> = {}
      for (const c of (classesData ?? [])) cmap[c.id] = c.name
      setClassNames(cmap)
    }

    type TestItemRawRow = { record_id: number; test_id: number; t_total: number; t_cor: number; t_score: number }
    const recIds = recsData.map(r => r.id)
    const [{ data: itemsRaw }, { data: commentsRaw }] = await Promise.all([
      supabase.rpc('client_record_test_items', { p_token: token, p_record_ids: recIds }).abortSignal(signal),
      supabase.rpc('client_record_comments', { p_token: token, p_record_ids: recIds }).abortSignal(signal),
    ])
    if (signal.aborted) return
    const items = itemsRaw as TestItemRawRow[] | null
    const commentsData = commentsRaw as RecordComment[] | null

    const testIds = [...new Set((items ?? []).map(x => x.test_id))]
    const testsMap: Record<number, string> = {}
    if (testIds.length > 0) {
      const { data: testsData } = await supabase.from('tests').select('id,name').in('id', testIds).abortSignal(signal)
      if (signal.aborted) return
      for (const t of (testsData ?? [])) testsMap[t.id] = t.name
    }

    type TestItemRow = { test_id: number; t_total: number; t_cor: number; t_score: number; tests: { name: string } | null }
    const itemsByRecord: Record<number, TestItemRow[]> = {}
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
    setComments((commentsData ?? []) as RecordComment[])
    setEditedNotice(merged.filter(r => r.edited_at).map(r => ({ id: r.id, date: r.date })))
    setLoading(false)

    // 아직 안 읽은(viewed_at이 없는) 기록을 지금 열람한 것으로 기록 — 관리자 쪽 읽음 확인용
    // (모바일에서 앱이 백그라운드로 전환되며 이 요청이 중간에 끊길 수 있어, sendComment 등
    // 실제로 학부모가 기록을 다뤘다는 게 확인되는 시점에도 아래에서 한 번 더 보정한다)
    const unviewedIds = merged.filter(r => !r.viewed_at).map(r => r.id)
    if (unviewedIds.length > 0) {
      const nowIso = new Date().toISOString()
      supabase.rpc('client_mark_records_viewed', { p_token: token, p_record_ids: unviewedIds }).then(({ error }) => {
        if (signal.aborted) return
        if (error) { console.error('[읽음 표시 실패]', error); return }
        setRecs(rs => rs.map(r => unviewedIds.includes(r.id) ? { ...r, viewed_at: nowIso } : r))
      })
    }
  }

  async function dismissEditedNotice() {
    const ids = editedNotice.map(n => n.id)
    setEditedNotice([])
    if (ids.length === 0 || !parent?.sessionToken) return
    await supabase.rpc('client_dismiss_edited_notice', { p_token: parent.sessionToken, p_record_ids: ids })
  }

  async function sendComment(recId: number) {
    const text = (commentDrafts[recId] ?? '').trim()
    if (!text || !parent?.sessionToken) return
    setSendingId(recId)
    setCommentErr(e => ({ ...e, [recId]: '' }))
    const { data, error } = await supabase
      .rpc('client_send_record_comment', { p_token: parent.sessionToken, p_record_id: recId, p_content: text })
      .single()
    setSendingId(null)
    if (error) { setCommentErr(e => ({ ...e, [recId]: '전송에 실패했습니다.' })); return }
    setComments(cs => [...cs, data as RecordComment])
    setCommentDrafts(d => ({ ...d, [recId]: '' }))

    // client_send_record_comment가 서버에서 읽음 처리까지 함께 반영하므로, 화면 상태만 맞춰준다.
    const alreadyViewed = !!recs.find(r => r.id === recId)?.viewed_at
    if (!alreadyViewed) {
      const nowIso = new Date().toISOString()
      setRecs(rs => rs.map(r => r.id === recId ? { ...r, viewed_at: nowIso } : r))
    }

    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
      body: JSON.stringify({
        title: '티처스 수학학원',
        body: `학부모 의견이 등록되었습니다.`,
        link: '/records',
      }),
    }).catch(() => {})
  }

  const curChild = children.find(c => c.id === selChild)
  const commentsByRecord = groupCommentsByRecord(comments)

  return (
    <div>
      {/* 자녀 선택 안 된 경우 */}
      {!selChild ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <p style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><IconArrowUp size={28} /></p>
          <p style={{ fontSize: 14, color: tx3 }}>위에서 자녀를 선택해주세요</p>
        </div>
      ) : (
        <>
          {editedNotice.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--ui-warning-bg)', border: `1px solid color-mix(in srgb, ${gold} 33%, transparent)`, borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
              <span style={{ flexShrink: 0, color: '#7A4A0A', display: 'flex' }}><IconPencil size={16} /></span>
              <p style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#7A4A0A', margin: 0, lineHeight: 1.5 }}>
                {editedNotice.length === 1
                  ? `${editedNotice[0].date} 수업기록이 수정되었습니다`
                  : `${editedNotice.length}개의 수업기록이 수정되었습니다 (${editedNotice.map(n => n.date.slice(5)).join(', ')})`}
              </p>
              <button onClick={dismissEditedNotice} style={{ flexShrink: 0, border: 'none', background: 'none', color: '#7A4A0A', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: '4px 8px' }}>
                확인
              </button>
            </div>
          )}

          <TodayClassBanner studentId={selChild} sessionToken={parent?.sessionToken} />

          {/* 학생 헤더 */}
          <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: '14px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: '50%', background: navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
              {curChild?.name[0]}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: tx, margin: 0 }}>{curChild?.name}</p>
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
            <HomeworkStatsView recs={recs} studentId={selChild ?? undefined} />
          ) : loading ? (
            <p style={{ textAlign: 'center', color: tx3, padding: '40px 0' }}>불러오는 중...</p>
          ) : recs.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: '60px 0', textAlign: 'center', color: tx3 }}>
              <p style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><IconInbox size={28} /></p>
              <p style={{ fontSize: 14 }}>수업 기록이 없습니다</p>
            </div>
          ) : recs.map(r => {
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
                  {r.has_test && <span style={{ background: 'var(--ui-surface-2)', color: navy, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>시험</span>}
                </div>

                {/* 이행률/정답률/태도 — 원형 게이지 */}
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
                  {r.attitude != null && (
                    <div style={{ flex: 1, minWidth: 0, background: bg, borderRadius: 10, padding: '8px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <p style={{ fontSize: 11, color: navy, fontWeight: 600, margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>수업 태도</p>
                      <p style={{ fontSize: 18, fontWeight: 700, color: attColor(r.attitude), margin: 0, lineHeight: 1, whiteSpace: 'nowrap' }}>{r.attitude}<span style={{ fontSize: 11, fontWeight: 400, color: tx2 }}>점</span></p>
                      <span style={{ fontSize: 10, color: attColor(r.attitude), marginTop: 2, whiteSpace: 'nowrap' }}>{attLabel(r.attitude)}</span>
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
                  <div style={{ background: 'var(--ui-bg)', borderLeft: `3px solid ${navy}`, borderRadius: '0 8px 8px 0', padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                      <div style={{ width: 3, height: 14, background: navy, borderRadius: 2 }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: navy }}>수업 피드백</span>
                    </div>
                    <p style={{ fontSize: 14, color: tx, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{r.feedback}</p>
                  </div>
                )}

                {/* 학부모 의견 — 선생님과 주고받는 대화 */}
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${bd}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                    <div style={{ width: 3, height: 14, background: gold, borderRadius: 2 }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: gold }}>학부모 의견</span>
                  </div>

                  {(commentsByRecord[r.id] ?? []).length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10, maxHeight: 260, overflowY: 'auto' }}>
                      {(commentsByRecord[r.id] ?? []).map(c => {
                        const isParent = c.sender_type === 'parent'
                        return (
                          <div key={c.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isParent ? 'flex-end' : 'flex-start' }}>
                            {!isParent && <span style={{ fontSize: 10, color: tx3, marginBottom: 2 }}>선생님</span>}
                            <div style={{
                              maxWidth: '85%', padding: '8px 12px', borderRadius: 12, fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                              background: isParent ? 'var(--ui-warning-bg)' : bg, color: tx,
                              borderBottomRightRadius: isParent ? 3 : 12, borderBottomLeftRadius: isParent ? 12 : 3,
                            }}>
                              {c.content}
                            </div>
                            <span style={{ fontSize: 10, color: tx3, marginTop: 2 }}>{c.created_at.slice(0, 10)}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                    <textarea
                      value={commentDrafts[r.id] ?? ''}
                      onChange={e => setCommentDrafts(d => ({ ...d, [r.id]: e.target.value }))}
                      placeholder="선생님께 전달하고 싶은 의견을 남겨주세요"
                      rows={1}
                      style={{ flex: 1, padding: '8px 10px', border: `1.5px solid ${bd}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: tx, outline: 'none', resize: 'none', boxSizing: 'border-box' }}
                    />
                    <button onClick={() => sendComment(r.id)} disabled={sendingId === r.id || !(commentDrafts[r.id] ?? '').trim()}
                      style={{
                        flexShrink: 0, width: 36, height: 36, borderRadius: 8, border: 'none', background: gold, color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: sendingId === r.id || !(commentDrafts[r.id] ?? '').trim() ? 'not-allowed' : 'pointer',
                        opacity: sendingId === r.id || !(commentDrafts[r.id] ?? '').trim() ? 0.6 : 1,
                      }}>
                      <IconSend size={15} />
                    </button>
                  </div>
                  {commentErr[r.id] && <span style={{ fontSize: 11, color: re, display: 'block', marginTop: 4 }}>{commentErr[r.id]}</span>}
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
