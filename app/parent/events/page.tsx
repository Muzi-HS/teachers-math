'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useParentChild } from '../layout'
import { IconClock, IconCalendar } from '@/components/icons'

const navy='#0D2A5E', tx='#0D1B36', tx2='#4B5C7E', tx3='#96A4BF'
const bd='#DDE3EE', re='#C0392B', rbg='#FDECEA', gold='#D87E13', goldPale='#FEF3E2'
// 결석/지각 등록용 — 알림 색(re/gold)보다 톤을 낮춘 차분한 색
const absCol='#A85D52', absBg='#F3E7E4', lateCol='#A67C3D', lateBg='#F3ECDD'

type Event_ = {
  id: number; title: string; start_date: string; end_date: string | null
  start_time: string | null; end_time: string | null
  type: string | null; memo: string | null
}

// 학부모가 등록한 결석/지각 — 본인이 등록한 건만 조회됨 (관리자/선생님/조교 쪽 학원일정에도 함께 표시)
type AttNotice = {
  id: number; student_id: number; date: string
  type: 'absence' | 'late'; reason: string | null
}

// 일정 구분은 '휴일' / '일반' 두 가지만 존재 (관리자 학원일정 메뉴 기준)
function eventColor(e: Event_) {
  return e.type === 'holiday'
    ? { bg: rbg, color: re, dot: re }
    : { bg: '#E8EEF8', color: navy, dot: navy }
}
function noticeColor(n: AttNotice) {
  return n.type === 'absence'
    ? { bg: absBg, color: absCol, dot: absCol, label: '결석', clock: false }
    : { bg: lateBg, color: lateCol, dot: lateCol, label: '지각', clock: true }
}

const DOW = ['일','월','화','수','목','금','토']

export default function ParentEvents() {
  const { parent } = useAuth()
  const { children } = useParentChild()
  const [events,   setEvents]   = useState<Event_[]>([])
  const [notices,  setNotices]  = useState<AttNotice[]>([])
  const [loading,  setLoading]  = useState(true)
  const [today,    setToday]    = useState(() => new Date())
  const [curYear,  setCurYear]  = useState(() => new Date().getFullYear())
  const [curMonth, setCurMonth] = useState(() => new Date().getMonth())
  const [selDate,  setSelDate]  = useState<string | null>(null)

  // 결석/지각 등록 모달
  const [noticeModal, setNoticeModal] = useState(false)
  const [nStudentId,  setNStudentId]  = useState<number | null>(null)
  const [nType,       setNType]       = useState<'absence' | 'late'>('absence')
  const [nDate,        setNDate]      = useState('')
  const [nReason,      setNReason]    = useState('')
  const [nSubmitting,  setNSubmitting]= useState(false)
  const [nErr,         setNErr]       = useState('')

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('events')
        .select('id,title,start_date,end_date,start_time,end_time,type,memo')
        .eq('parent_visible', true)
        .order('start_date', { ascending: true })
      setEvents(data ?? [])
      setLoading(false)
    }
    fetch()
  }, [])

  useEffect(() => {
    if (!parent?.parentId) return
    fetchNotices(parent.parentId)
  }, [parent?.parentId])

  async function fetchNotices(parentId: number) {
    const { data } = await supabase
      .from('attendance_notices')
      .select('id,student_id,date,type,reason')
      .eq('parent_id', parentId)
      .order('date', { ascending: true })
    setNotices((data ?? []) as AttNotice[])
  }

  function todayStr_() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  function openNoticeModal(presetDate?: string) {
    setNStudentId(children[0]?.id ?? null)
    setNType('absence')
    setNDate(presetDate ?? todayStr_())
    setNReason('')
    setNErr('')
    setNoticeModal(true)
  }

  async function submitNotice() {
    if (!parent?.parentId) return
    if (!nStudentId) { setNErr('자녀를 선택하세요.'); return }
    if (!nDate) { setNErr('날짜를 선택하세요.'); return }
    setNSubmitting(true)
    setNErr('')
    const { error } = await supabase.from('attendance_notices').insert({
      parent_id: parent.parentId, student_id: nStudentId, date: nDate, type: nType, reason: nReason.trim() || null,
    })
    setNSubmitting(false)
    if (error) { setNErr('등록에 실패했습니다. 다시 시도해주세요.'); return }
    setNoticeModal(false)
    fetchNotices(parent.parentId)
  }

  function prevMonth() {
    if (curMonth === 0) { setCurYear(y => y - 1); setCurMonth(11) }
    else setCurMonth(m => m - 1)
    setSelDate(null)
  }
  function nextMonth() {
    if (curMonth === 11) { setCurYear(y => y + 1); setCurMonth(0) }
    else setCurMonth(m => m + 1)
    setSelDate(null)
  }

  // 날짜가 이벤트 범위 안에 있는지
  function dateInEvent(dateStr: string, e: Event_) {
    const end = e.end_date ?? e.start_date
    return dateStr >= e.start_date && dateStr <= end
  }

  // 해당 날짜의 이벤트 목록
  function eventsOnDate(dateStr: string) {
    return events.filter(e => dateInEvent(dateStr, e))
  }
  // 해당 날짜에 내가 등록한 결석/지각 목록
  function noticesOnDate(dateStr: string) {
    return notices.filter(n => n.date === dateStr)
  }
  function childName(studentId: number) {
    return children.find(c => c.id === studentId)?.name ?? '자녀'
  }

  // 달력 날짜 생성
  const firstDay = new Date(curYear, curMonth, 1).getDay()
  const daysInMonth = new Date(curYear, curMonth + 1, 0).getDate()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`

  const calCells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // 6줄 맞추기
  while (calCells.length % 7 !== 0) calCells.push(null)

  // 선택된 날짜의 이벤트
  const selEvents = selDate ? eventsOnDate(selDate) : []

  function formatTime(t: string | null) { return t ? t.slice(0, 5) : '' }
  function formatDateRange(e: Event_) {
    const s = e.start_date.slice(5).replace('-', '/')
    if (!e.end_date || e.end_date === e.start_date) return s
    return `${s} ~ ${e.end_date.slice(5).replace('-', '/')}`
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <p style={{ fontSize: 20, fontWeight: 700, color: tx, margin: 0 }}>학원 일정</p>
          <p style={{ fontSize: 13, color: tx2, marginTop: 4 }}>날짜를 탭하면 일정을 확인할 수 있어요</p>
        </div>
        <button onClick={() => openNoticeModal()} style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '9px 14px', borderRadius: 20,
          border: `1.5px solid ${absCol}55`, background: absBg, color: absCol, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          결석지각 등록
        </button>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: tx3, padding: '40px 0' }}>불러오는 중...</p>
      ) : (
        <>
          {/* 달력 카드 */}
          <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${bd}`, padding: '16px 12px', marginBottom: 14, boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
            {/* 월 이동 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', color: tx2, fontSize: 18 }}>‹</button>
              <span style={{ fontSize: 16, fontWeight: 700, color: tx }}>{curYear}년 {curMonth + 1}월</span>
              <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', color: tx2, fontSize: 18 }}>›</button>
            </div>

            {/* 요일 헤더 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 4 }}>
              {DOW.map((d, i) => (
                <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: i === 0 ? re : i === 6 ? navy : tx3, padding: '2px 0' }}>
                  {d}
                </div>
              ))}
            </div>

            {/* 날짜 셀 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '2px 0' }}>
              {calCells.map((day, idx) => {
                if (!day) return <div key={idx} />
                const dateStr = `${curYear}-${String(curMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                const dayEvents = eventsOnDate(dateStr)
                const dayNotices = noticesOnDate(dateStr)
                const isToday = dateStr === todayStr
                const isSel   = dateStr === selDate
                const dow     = idx % 7
                return (
                  <button key={idx} onClick={() => setSelDate(isSel ? null : dateStr)} style={{
                    background: isSel ? navy : isToday ? '#E8EEF8' : 'none',
                    border: 'none', borderRadius: 8, cursor: 'pointer', padding: '4px 0 6px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    fontFamily: "'Noto Sans KR',sans-serif",
                  }}>
                    <span style={{
                      fontSize: 13, fontWeight: isToday || isSel ? 700 : 400,
                      color: isSel ? '#fff' : isToday ? navy : dow === 0 ? re : dow === 6 ? navy : tx,
                    }}>{day}</span>
                    {/* 이벤트 점 + 결석·지각 등록 점 (최대 3개) */}
                    <div style={{ display: 'flex', gap: 2 }}>
                      {dayEvents.slice(0, 3).map(e => {
                        const tc = eventColor(e)
                        return <div key={'e'+e.id} style={{ width: 4, height: 4, borderRadius: '50%', background: isSel ? 'rgba(255,255,255,.7)' : tc.dot }} />
                      })}
                      {dayNotices.slice(0, 3).map(n => {
                        const nc = noticeColor(n)
                        return <div key={'n'+n.id} style={{ width: 4, height: 4, borderRadius: '50%', background: isSel ? 'rgba(255,255,255,.7)' : nc.dot }} />
                      })}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 선택된 날짜의 일정 */}
          {selDate && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: tx, margin: 0 }}>
                  {selDate.slice(5).replace('-', '월 ')}일 일정
                </p>
                <button onClick={() => openNoticeModal(selDate)} style={{ background: 'none', border: 'none', color: absCol, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  이 날짜로 등록
                </button>
              </div>

              {noticesOnDate(selDate).map(n => {
                const nc = noticeColor(n)
                return (
                  <div key={'n'+n.id} style={{ background: nc.bg, borderRadius: 12, padding: '12px 16px', marginBottom: 10, border: `1px solid ${nc.color}33` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ background: '#fff', color: nc.color, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 3 }}>{nc.clock && <IconClock size={10} />}{nc.label}</span>
                      <p style={{ fontSize: 14, fontWeight: 700, color: nc.color, margin: 0 }}>{childName(n.student_id)}</p>
                    </div>
                    {n.reason && <p style={{ fontSize: 13, color: tx2, marginTop: 6, marginBottom: 0 }}>{n.reason}</p>}
                  </div>
                )
              })}

              {selEvents.length === 0 && noticesOnDate(selDate).length === 0 ? (
                <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: '24px 0', textAlign: 'center', color: tx3, fontSize: 13 }}>
                  이 날 예정된 일정이 없습니다
                </div>
              ) : selEvents.map(e => {
                const tc = eventColor(e)
                return (
                  <div key={e.id} style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: '14px 16px', marginBottom: 10, borderLeft: `4px solid ${tc.dot}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      {e.type === 'holiday' && <span style={{ background: tc.bg, color: tc.color, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4 }}>휴일</span>}
                      <p style={{ fontSize: 14, fontWeight: 700, color: e.type === 'holiday' ? re : tx, margin: 0 }}>{e.title}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, color: tx2, display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconCalendar size={12} /> {formatDateRange(e)}</span>
                      {(e.start_time || e.end_time) && (
                        <span style={{ fontSize: 12, color: tx2, display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconClock size={12} /> {formatTime(e.start_time)}{e.end_time ? ` ~ ${formatTime(e.end_time)}` : ''}</span>
                      )}
                    </div>
                    {e.memo && <p style={{ fontSize: 13, color: tx2, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${bd}`, lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: 0 }}>{e.memo}</p>}
                  </div>
                )
              })}
            </div>
          )}

          {/* 이번 달 전체 일정 (날짜 미선택 시) */}
          {!selDate && (
            <>
              {(() => {
                const monthStr = `${curYear}-${String(curMonth+1).padStart(2,'0')}`
                const monthNotices = notices.filter(n => n.date.slice(0, 7) === monthStr)
                if (monthNotices.length > 0) return monthNotices.map(n => {
                  const nc = noticeColor(n)
                  return (
                    <div key={'n'+n.id} style={{ background: nc.bg, borderRadius: 12, padding: '12px 16px', marginBottom: 10, border: `1px solid ${nc.color}33` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ background: '#fff', color: nc.color, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 3 }}>{nc.clock && <IconClock size={10} />}{nc.label}</span>
                        <p style={{ fontSize: 14, fontWeight: 700, color: nc.color, margin: 0 }}>{childName(n.student_id)}</p>
                        <span style={{ fontSize: 12, color: tx2, marginLeft: 'auto' }}>{n.date.slice(5).replace('-', '/')}</span>
                      </div>
                      {n.reason && <p style={{ fontSize: 13, color: tx2, marginTop: 6, marginBottom: 0 }}>{n.reason}</p>}
                    </div>
                  )
                })
                return null
              })()}
              {(() => {
                const monthStr = `${curYear}-${String(curMonth+1).padStart(2,'0')}`
                const monthEvents = events.filter(e => {
                  const end = (e.end_date ?? e.start_date).slice(0, 7)
                  return monthStr >= e.start_date.slice(0, 7) && monthStr <= end
                })
                const monthNoticeCnt = notices.filter(n => n.date.slice(0, 7) === monthStr).length
                if (monthEvents.length === 0 && monthNoticeCnt === 0) return (
                  <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: '30px 0', textAlign: 'center', color: tx3, fontSize: 13 }}>
                    이번 달 예정된 일정이 없습니다
                  </div>
                )
                return monthEvents.map(e => {
                  const tc = eventColor(e)
                  return (
                    <div key={e.id} style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: '14px 16px', marginBottom: 10, borderLeft: `4px solid ${tc.dot}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        {e.type === 'holiday' && <span style={{ background: tc.bg, color: tc.color, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4 }}>휴일</span>}
                        <p style={{ fontSize: 14, fontWeight: 700, color: e.type === 'holiday' ? re : tx, margin: 0 }}>{e.title}</p>
                      </div>
                      <span style={{ fontSize: 12, color: tx2, display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconCalendar size={12} /> {formatDateRange(e)}</span>
                      {e.memo && <p style={{ fontSize: 13, color: tx2, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${bd}`, lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: 0 }}>{e.memo}</p>}
                    </div>
                  )
                })
              })()}
            </>
          )}
        </>
      )}

      {/* 결석·지각 등록 모달 */}
      {noticeModal && (
        <div onClick={() => setNoticeModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 400, padding: 20, boxShadow: '0 8px 40px rgba(0,0,0,.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: tx, margin: 0 }}>결석지각 등록</p>
              <button onClick={() => setNoticeModal(false)} style={{ background: 'none', border: 'none', fontSize: 18, color: tx3, cursor: 'pointer' }}>×</button>
            </div>

            {children.length > 1 && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, color: tx2, marginBottom: 6 }}>자녀</label>
                <select value={nStudentId ?? ''} onChange={e => setNStudentId(Number(e.target.value))}
                  style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${bd}`, borderRadius: 8, fontSize: 14, fontFamily: 'inherit', color: tx, outline: 'none', background: '#fff' }}>
                  {children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, color: tx2, marginBottom: 6 }}>구분</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setNType('absence')} style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                  border: `1.5px solid ${nType === 'absence' ? absCol : bd}`,
                  background: nType === 'absence' ? absBg : '#fff', color: nType === 'absence' ? absCol : tx2,
                }}>결석</button>
                <button type="button" onClick={() => setNType('late')} style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                  border: `1.5px solid ${nType === 'late' ? lateCol : bd}`,
                  background: nType === 'late' ? lateBg : '#fff', color: nType === 'late' ? lateCol : tx2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                }}><IconClock size={13} /> 지각</button>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, color: tx2, marginBottom: 6 }}>날짜</label>
              <input type="date" value={nDate} onChange={e => setNDate(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${bd}`, borderRadius: 8, fontSize: 14, fontFamily: 'inherit', color: tx, outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: tx2, marginBottom: 6 }}>사유 (선택)</label>
              <textarea value={nReason} onChange={e => setNReason(e.target.value)} rows={2} placeholder="예) 감기몸살로 결석합니다"
                style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${bd}`, borderRadius: 8, fontSize: 14, fontFamily: 'inherit', color: tx, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>

            {nErr && <p style={{ fontSize: 12, color: re, marginBottom: 10, marginTop: -6 }}>{nErr}</p>}

            <button onClick={submitNotice} disabled={nSubmitting} style={{
              width: '100%', padding: 13, borderRadius: 8, border: 'none', background: nType === 'absence' ? absCol : lateCol, color: '#fff',
              fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: nSubmitting ? 'not-allowed' : 'pointer', opacity: nSubmitting ? 0.7 : 1,
            }}>
              {nSubmitting ? '등록 중...' : '등록하기'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
