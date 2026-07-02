'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const navy='#0D2A5E', tx='#0D1B36', tx2='#4B5C7E', tx3='#96A4BF'
const bd='#DDE3EE', bg='#F5F7FA', re='#C0392B', rbg='#FDECEA'
const gr='#1A7F4E', gbg='#E0F5EB', gold='#D87E13'

type Event_ = {
  id: number; title: string; start_date: string; end_date: string | null
  start_time: string | null; end_time: string | null
  type: string | null; memo: string | null
}

const TYPE_COLOR: Record<string, { bg: string; color: string; dot: string }> = {
  '휴원': { bg: rbg,        color: re,   dot: re   },
  '시험': { bg: '#E8EEF8',  color: navy, dot: navy },
  '특강': { bg: '#FEF3E2',  color: gold, dot: gold },
  '행사': { bg: gbg,        color: gr,   dot: gr   },
}
const DEFAULT_TYPE = { bg: '#F0F0FF', color: '#5050C0', dot: '#5050C0' }

const DOW = ['일','월','화','수','목','금','토']

export default function ParentEvents() {
  const [events,   setEvents]   = useState<Event_[]>([])
  const [loading,  setLoading]  = useState(true)
  const [today,    setToday]    = useState(() => new Date())
  const [curYear,  setCurYear]  = useState(() => new Date().getFullYear())
  const [curMonth, setCurMonth] = useState(() => new Date().getMonth())
  const [selDate,  setSelDate]  = useState<string | null>(null)

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
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 20, fontWeight: 700, color: tx, margin: 0 }}>학원 일정</p>
        <p style={{ fontSize: 13, color: tx2, marginTop: 4 }}>날짜를 탭하면 일정을 확인할 수 있어요</p>
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
                    {/* 이벤트 점 (최대 3개) */}
                    <div style={{ display: 'flex', gap: 2 }}>
                      {dayEvents.slice(0, 3).map(e => {
                        const tc = TYPE_COLOR[e.type ?? ''] ?? DEFAULT_TYPE
                        return <div key={e.id} style={{ width: 4, height: 4, borderRadius: '50%', background: isSel ? 'rgba(255,255,255,.7)' : tc.dot }} />
                      })}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* 범례 */}
            <div style={{ display: 'flex', gap: 12, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${bd}`, flexWrap: 'wrap' }}>
              {Object.entries(TYPE_COLOR).map(([label, c]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot }} />
                  <span style={{ fontSize: 11, color: tx3 }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 선택된 날짜의 일정 */}
          {selDate && (
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: tx, marginBottom: 10 }}>
                {selDate.slice(5).replace('-', '월 ')}일 일정
              </p>
              {selEvents.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: '24px 0', textAlign: 'center', color: tx3, fontSize: 13 }}>
                  이 날 예정된 일정이 없습니다
                </div>
              ) : selEvents.map(e => {
                const tc = TYPE_COLOR[e.type ?? ''] ?? DEFAULT_TYPE
                return (
                  <div key={e.id} style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: '14px 16px', marginBottom: 10, borderLeft: `4px solid ${tc.dot}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      {e.type && <span style={{ background: tc.bg, color: tc.color, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4 }}>{e.type}</span>}
                      <p style={{ fontSize: 14, fontWeight: 700, color: tx, margin: 0 }}>{e.title}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, color: tx2 }}>📅 {formatDateRange(e)}</span>
                      {(e.start_time || e.end_time) && (
                        <span style={{ fontSize: 12, color: tx2 }}>🕐 {formatTime(e.start_time)}{e.end_time ? ` ~ ${formatTime(e.end_time)}` : ''}</span>
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
                const monthEvents = events.filter(e => {
                  const end = (e.end_date ?? e.start_date).slice(0, 7)
                  return monthStr >= e.start_date.slice(0, 7) && monthStr <= end
                })
                if (monthEvents.length === 0) return (
                  <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: '30px 0', textAlign: 'center', color: tx3, fontSize: 13 }}>
                    이번 달 예정된 일정이 없습니다
                  </div>
                )
                return monthEvents.map(e => {
                  const tc = TYPE_COLOR[e.type ?? ''] ?? DEFAULT_TYPE
                  return (
                    <div key={e.id} style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: '14px 16px', marginBottom: 10, borderLeft: `4px solid ${tc.dot}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        {e.type && <span style={{ background: tc.bg, color: tc.color, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4 }}>{e.type}</span>}
                        <p style={{ fontSize: 14, fontWeight: 700, color: tx, margin: 0 }}>{e.title}</p>
                      </div>
                      <span style={{ fontSize: 12, color: tx2 }}>📅 {formatDateRange(e)}</span>
                      {e.memo && <p style={{ fontSize: 13, color: tx2, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${bd}`, lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: 0 }}>{e.memo}</p>}
                    </div>
                  )
                })
              })()}
            </>
          )}
        </>
      )}
    </div>
  )
}
