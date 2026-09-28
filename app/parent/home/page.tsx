'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useParentChild } from '../layout'
import { RecordComment, groupCommentsByRecord } from '@/lib/records'
import TodayClassBanner from '@/components/TodayClassBanner'
import ParentAttendance from '@/components/ParentAttendance'
import { IconArrowUp, IconInbox, IconSend, IconCalendar } from '@/components/icons'

// 새 학부모 시안(parent-preview)의 정확한 색상을 그대로 사용한다 — 사이트 테마 토큰 대신
// 이 화면만의 고정 팔레트로, 홈 화면이 실제로 새 디자인처럼 보이게 한다.
const accent = '#2B6B45'
const tx = '#203F30', tx2 = '#6A7B6E', tx3 = '#6C8071'
const bd = '#E1E9E1', bg = '#F6F8F4', re = '#C2483C', rbg = '#FCEAE8'
const gr = '#2B6B45', gbg = '#E7F3EA'
function rateColor(value: number) { return value >= 80 ? gr : value >= 60 ? '#A66A12' : re }
function attitudeColor(value: number) { return value >= 8 ? gr : value >= 5 ? '#A66A12' : re }
function attitudeLabel(value: number) { return value >= 8 ? '우수' : value >= 5 ? '보통' : '노력필요' }

type Rec = {
  id: number; date: string; content: string; homework: string
  hw_rate: number; hw_cor: number; attitude: number
  late: boolean; has_test: boolean; feedback: string; class_id: number | null
}
type EventRow = { id: number; title: string; start_date: string }
function formatEventDate(ds: string): string {
  const d = new Date(ds + 'T00:00:00')
  const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
  return `${d.getMonth() + 1}.${d.getDate()}(${dow})`
}

// 학부모 홈 — 가장 최근 수업기록 하나만 보여주고, 지난 기록·통계는 하단 "수업기록" 탭에서,
// 지각·결석 등록·문의는 여기서 바로 문의 탭으로 이어지도록 한다.
export default function ParentHome() {
  const { parent } = useAuth()
  const { selChild } = useParentChild()
  const router = useRouter()
  const [rec, setRec] = useState<Rec | null>(null)
  const [className, setClassName] = useState<string | null>(null)
  const [comments, setComments] = useState<RecordComment[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [upcomingEvents, setUpcomingEvents] = useState<EventRow[]>([])

  useEffect(() => {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    supabase.from('events').select('id,title,start_date')
      .eq('parent_visible', true).gte('start_date', todayStr)
      .order('start_date', { ascending: true }).limit(2)
      .then(({ data }) => setUpcomingEvents((data ?? []) as EventRow[]))
  }, [])

  async function load(studentId: number, token: string, isActive: () => boolean) {
    setLoading(true)
    setRec(null)
    setComments([])
    setClassName(null)
    const { data: recsRaw } = await supabase.rpc('client_records', { p_token: token, p_student_id: studentId })
    if (!isActive()) return
    const recs = (recsRaw ?? []) as Rec[]
    if (recs.length === 0) { setLoading(false); return }
    const latest = recs[0]
    setRec(latest)
    if (latest.class_id != null) {
      const { data: classData } = await supabase.from('classes').select('name').eq('id', latest.class_id).maybeSingle()
      if (!isActive()) return
      setClassName(classData?.name ?? null)
    }
    const { data: commentsRaw } = await supabase.rpc('client_record_comments', { p_token: token, p_record_ids: [latest.id] })
    if (!isActive()) return
    setComments((commentsRaw ?? []) as RecordComment[])
    setLoading(false)
  }

  useEffect(() => {
    if (!selChild || !parent?.sessionToken) return
    let active = true
    queueMicrotask(() => { if (active) void load(selChild, parent.sessionToken, () => active) })
    return () => { active = false }
  }, [selChild, parent?.sessionToken])

  async function sendComment() {
    const text = draft.trim()
    if (!text || !rec || !parent?.sessionToken) return
    setSending(true)
    const { data, error } = await supabase
      .rpc('client_send_record_comment', { p_token: parent.sessionToken, p_record_id: rec.id, p_content: text })
      .single()
    setSending(false)
    if (error) return
    setComments(cs => [...cs, data as RecordComment])
    setDraft('')
  }

  const commentsByRecord = groupCommentsByRecord(comments)
  const threadComments = rec ? (commentsByRecord[rec.id] ?? []) : []

  return (
    <div>

      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 11, color: tx3, margin: '0 0 4px' }}>우리 아이의</p>
        <p style={{ fontSize: 20, fontWeight: 700, color: tx, margin: 0 }}>최근 수업기록</p>
      </div>

      {!selChild ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <p style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><IconArrowUp size={28} /></p>
          <p style={{ fontSize: 14, color: tx3 }}>위에서 자녀를 선택해주세요</p>
        </div>
      ) : (
        <>
          <TodayClassBanner studentId={selChild} sessionToken={parent?.sessionToken} />

          {loading ? (
            <p style={{ textAlign: 'center', color: tx3, padding: '40px 0' }}>불러오는 중...</p>
          ) : !rec ? (
            <>
              <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: '60px 0', textAlign: 'center', color: tx3, marginBottom: 14 }}>
                <p style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><IconInbox size={28} /></p>
                <p style={{ fontSize: 14 }}>수업 기록이 없습니다</p>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}><ParentAttendance selectedChild={selChild} /></div>
            </>
          ) : <>
            <div style={{ background: '#fff', border: `1px solid ${bd}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid ${bd}` }}>
                <span style={{ fontSize: 11, color: tx2 }}>최근 수업</span>
                <b style={{ fontSize: 14, color: tx }}>{formatEventDate(rec.date)}</b>
                {className && <span style={{ background: bg, color: tx2, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>{className}</span>}
                {rec.late
                  ? <span style={{ background: rbg, color: re, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>지각</span>
                  : <span style={{ background: gbg, color: gr, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>정시 등원</span>}
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <div style={{ flex: 1, minWidth: 0, background: bg, borderRadius: 10, padding: '8px 10px' }}>
                  <p style={{ fontSize: 11, color: accent, fontWeight: 600, margin: '0 0 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>숙제 이행률</p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                    {rec.hw_rate < 0 ? <span style={{ fontSize: 11, color: rec.hw_rate === -2 ? re : tx3 }}>{rec.hw_rate === -2 ? '숙제 미제출' : '숙제 없음'}</span> : <><b style={{ fontSize: 18, color: rateColor(rec.hw_rate) }}>{rec.hw_rate}<small style={{ fontWeight: 400 }}>%</small></b><svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12.5" fill="none" stroke={bd} strokeWidth="3.2"/><circle cx="16" cy="16" r="12.5" fill="none" stroke={rateColor(rec.hw_rate)} strokeWidth="3.2" strokeDasharray="78.5" strokeDashoffset={78.5 * (1 - rec.hw_rate / 100)} strokeLinecap="round" transform="rotate(-90 16 16)"/></svg></>}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0, background: bg, borderRadius: 10, padding: '8px 10px' }}>
                  <p style={{ fontSize: 11, color: accent, fontWeight: 600, margin: '0 0 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>숙제 정답률</p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                    {rec.hw_cor < 0 ? <span style={{ fontSize: 11, color: tx3 }}>채점 안함</span> : <><b style={{ fontSize: 18, color: rateColor(rec.hw_cor) }}>{rec.hw_cor}<small style={{ fontWeight: 400 }}>%</small></b><svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12.5" fill="none" stroke={bd} strokeWidth="3.2"/><circle cx="16" cy="16" r="12.5" fill="none" stroke={rateColor(rec.hw_cor)} strokeWidth="3.2" strokeDasharray="78.5" strokeDashoffset={78.5 * (1 - rec.hw_cor / 100)} strokeLinecap="round" transform="rotate(-90 16 16)"/></svg></>}
                  </div>
                </div>
                {rec.attitude != null && <div style={{ flex: 1, minWidth: 0, background: bg, borderRadius: 10, padding: '8px 10px' }}>
                  <p style={{ fontSize: 11, color: accent, fontWeight: 600, margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>수업 태도</p>
                  <b style={{ display: 'block', fontSize: 18, color: attitudeColor(rec.attitude) }}>{rec.attitude}<small style={{ fontWeight: 400 }}>점</small></b>
                  <span style={{ display: 'block', fontSize: 10, color: attitudeColor(rec.attitude) }}>{attitudeLabel(rec.attitude)}</span>
                </div>}
              </div>

              {rec.content && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
                  <div style={{ width: 3, alignSelf: 'stretch', background: accent, borderRadius: 2, flexShrink: 0 }} />
                  <div><p style={{ fontSize: 11, fontWeight: 700, color: accent, margin: '0 0 1px' }}>수업 내용</p><p style={{ fontSize: 13, color: tx, margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{rec.content}</p></div>
                </div>
              )}
              {rec.homework && (
                <div style={{ display: 'flex', gap: 8, marginBottom: rec.feedback ? 10 : 0, alignItems: 'flex-start' }}>
                  <div style={{ width: 3, alignSelf: 'stretch', background: accent, borderRadius: 2, flexShrink: 0 }} />
                  <div><p style={{ fontSize: 11, fontWeight: 700, color: accent, margin: '0 0 1px' }}>숙제</p><p style={{ fontSize: 13, color: tx, margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{rec.homework}</p></div>
                </div>
              )}
              {rec.feedback && (
                <div style={{ background: bg, borderLeft: `3px solid ${accent}`, borderRadius: '0 8px 8px 0', padding: '10px 12px' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: accent, display: 'block', marginBottom: 5 }}>수업 피드백</span>
                  <p style={{ fontSize: 14, color: tx, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{rec.feedback}</p>
                </div>
              )}

              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${bd}` }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: accent, display: 'block', marginBottom: 8 }}>학부모 의견</span>
                {threadComments.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                    {threadComments.map(c => {
                      const isParent = c.sender_type === 'parent'
                      return (
                        <div key={c.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isParent ? 'flex-end' : 'flex-start' }}>
                          {!isParent && <span style={{ fontSize: 10, color: tx3, marginBottom: 2 }}>선생님</span>}
                          <div style={{
                            maxWidth: '85%', padding: '8px 12px', borderRadius: 12, fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            background: isParent ? '#E7F3EA' : bg, color: tx,
                            borderBottomRightRadius: isParent ? 3 : 12, borderBottomLeftRadius: isParent ? 12 : 3,
                          }}>{c.content}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                  <textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="선생님께 전달하고 싶은 의견을 남겨주세요" rows={1}
                    style={{ flex: 1, padding: '8px 10px', border: `1.5px solid ${bd}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: tx, outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
                  <button onClick={sendComment} disabled={sending || !draft.trim()} style={{
                    flexShrink: 0, width: 36, height: 36, borderRadius: 8, border: 'none', background: accent, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: sending || !draft.trim() ? 'not-allowed' : 'pointer', opacity: sending || !draft.trim() ? .6 : 1,
                  }}><IconSend size={15} /></button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              <ParentAttendance selectedChild={selChild} />
              <button onClick={() => router.push('/parent/inquiries')} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 42,
                background: '#fff', border: `1px solid ${bd}`, borderRadius: 8, color: tx2, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
              }}>문의하기</button>
            </div>

            <button onClick={() => router.push('/parent/events')} style={{
              width: '100%', border: `1px solid ${bd}`, background: '#fff', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 15px', color: tx, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <span style={{ flexShrink: 0, color: tx2, display: 'flex' }}><IconCalendar size={20} /></span>
              <span style={{ flex: 1 }}>
                <strong style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>이번주 학원일정</strong>
                <small style={{ display: 'block', fontSize: 10, color: tx3, marginTop: 5 }}>
                  {upcomingEvents.length === 0
                    ? '예정된 일정이 없어요'
                    : `${formatEventDate(upcomingEvents[0].start_date)} ${upcomingEvents[0].title}${upcomingEvents.length > 1 ? ` 외 ${upcomingEvents.length - 1}건` : ''}`}
                </small>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          </>}
        </>
      )}
    </div>
  )
}
