'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { kstDateStr } from '@/lib/kst'
import { usePublicHolidays } from '@/lib/use-public-holidays'
import ScheduleUpcoming from '@/components/ScheduleUpcoming'
import CompactMonthCalendar from '@/components/CompactMonthCalendar'
import { useMobileMode } from '@/context/MobileModeContext'

type Event = {
  id: number; title: string; start_date: string; end_date: string
  start_time: string | null; end_time: string | null
  category: string; owner: string; location: string; memo: string; completed: boolean
}
type Draft = Omit<Event, 'id' | 'start_time' | 'end_time'> & { start_time: string; end_time: string; allDay: boolean }
const categories = ['업무', '회의', '상담', '준비', '기타']
function shift(date: string, days: number) {
  const value = new Date(date + 'T00:00:00Z')
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
function blank(date: string): Draft {
  return { title: '', start_date: date, end_date: date, start_time: '09:00', end_time: '10:00',
    allDay: true, category: '업무', owner: '', location: '', memo: '', completed: false }
}
const covers = (event: Event, date: string) => event.start_date <= date && event.end_date >= date

export default function AdminScheduleCalendar() {
  const { mobileMode } = useMobileMode()
  const today = kstDateStr()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [selected, setSelected] = useState<string | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [filter, setFilter] = useState('전체')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const version = useRef(0)
  const year = Number(month.slice(0, 4)), mo = Number(month.slice(5)) - 1
  const { holidays, fallback } = usePublicHolidays(year)
  const weekday = new Date(today + 'T00:00:00Z').getUTCDay()
  const weekStart = shift(today, -((weekday + 6) % 7))
  const weekEnd = shift(weekStart, 6)

  const load = useCallback(async () => {
    const request = ++version.current
    setLoading(true)
    const from = month + '-01'
    const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10)
    // Always include the current week even when browsing another month.
    const lower = from < weekStart ? from : weekStart
    const upper = end > weekEnd ? end : weekEnd
    try {
      const result = await supabase.from('admin_schedule_events').select('*')
        .lte('start_date', upper).gte('end_date', lower).order('start_date').order('start_time')
      if (request !== version.current) return
      if (result.error) throw result.error
      setEvents(result.data ?? []); setError('')
    } catch {
      if (request === version.current) {
        setEvents([]); setError('내부 일정을 불러오지 못했습니다. 최초 사용 시 관리자 일정 DB 마이그레이션 적용 여부를 확인해주세요.')
      }
    } finally { if (request === version.current) setLoading(false) }
  }, [month, weekStart, weekEnd, setLoading, setEvents, setError])
  useEffect(() => {
    const requestVersion = version
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => { window.clearTimeout(timer); requestVersion.current++ }
  }, [load])
  useEffect(() => { if (draft && !dialogRef.current?.open) dialogRef.current?.showModal() }, [draft])
  function open(date: string, event?: Event) {
    setEditId(event?.id ?? null); setFormError('')
    setDraft(event ? { ...event, start_time: event.start_time?.slice(0, 5) ?? '09:00',
      end_time: event.end_time?.slice(0, 5) ?? '', allDay: !event.start_time } : blank(date))
  }
  function close() {
    if (saving) return
    setDraft(null)
  }
  async function save() {
    if (!draft || saving) return
    if (!draft.title.trim()) return setFormError('일정 제목을 입력해주세요.')
    if (!draft.start_date || !draft.end_date || draft.end_date < draft.start_date) return setFormError('시작일과 종료일을 확인해주세요.')
    if (!draft.allDay && (!draft.start_time || (draft.end_date === draft.start_date && draft.end_time && draft.end_time <= draft.start_time))) return setFormError('시작 시간과 종료 시간을 확인해주세요.')
    setSaving(true); setFormError('')
    const payload = { title: draft.title.trim(), start_date: draft.start_date, end_date: draft.end_date,
      start_time: draft.allDay ? null : draft.start_time, end_time: draft.allDay ? null : draft.end_time || null,
      category: draft.category, owner: draft.owner.trim(), location: draft.location.trim(), memo: draft.memo.trim(), completed: draft.completed }
    try {
      const result = editId === null ? await supabase.from('admin_schedule_events').insert(payload).select('id').single()
        : await supabase.from('admin_schedule_events').update(payload).eq('id', editId).select('id').single()
      if (result.error) throw result.error
      setSelected(draft.start_date); setMonth(draft.start_date.slice(0, 7))
      setDraft(null); setNotice('일정을 저장했습니다.')
      if (draft.start_date.slice(0, 7) === month) await load()
    } catch { setFormError('저장하지 못했습니다. 연결 상태와 관리자 권한을 확인해주세요.') }
    finally { setSaving(false) }
  }
  async function remove(id: number) {
    if (saving || !confirm('이 내부 일정을 삭제할까요?')) return
    setSaving(true)
    try {
      const result = await supabase.from('admin_schedule_events').delete().eq('id', id).select('id').single()
      if (result.error) throw result.error
      setDraft(null); setNotice('일정을 삭제했습니다.'); await load()
    } catch { setNotice('삭제하지 못했습니다. 다시 시도해주세요.') }
    finally { setSaving(false) }
  }
  const visible = events.filter(event => filter === '전체' || event.category === filter)
  const dayEvents = (date: string) => visible.filter(event => covers(event, date)).sort((a, b) =>
    Number(a.completed) - Number(b.completed) || (a.start_time ?? '').localeCompare(b.start_time ?? ''))
  const monthEnd = new Date(Date.UTC(year, mo + 1, 0)).toISOString().slice(0, 10)
  const monthEvents = visible.filter(event => event.start_date <= monthEnd && event.end_date >= month + '-01')
  const items = selected ? dayEvents(selected) : monthEvents
  const listTitle = selected ? `${Number(selected.slice(5, 7))}월 ${Number(selected.slice(8))}일` : `${mo + 1}월 전체`
  const firstDay = new Date(Date.UTC(year, mo, 1)).getUTCDay()
  const days = Number(monthEnd.slice(8))
  const previousDays = new Date(Date.UTC(year, mo, 0)).getUTCDate()
  const trailing = (7 - (firstDay + days) % 7) % 7
  function selectDate(date: string) { setSelected(date) }
  function moveMonth(delta: number) {
    const date = new Date(Date.UTC(year, mo + delta, 1))
    setMonth(date.toISOString().slice(0, 7)); setSelected(null)
  }
  function list(items: Event[], empty: string) {
    return loading ? <p>일정을 불러오는 중…</p> : error ? <p>일정 조회에 실패했습니다.</p> : items.length ? items.map(event =>
      <div className="internal-event" key={event.id}>
        <span className="internal-badge">{event.category}</span>
        <span><strong style={{ textDecoration: event.completed ? 'line-through' : undefined }}>{event.title}</strong>
          {(event.owner || event.location || event.completed) && <small>{[event.owner, event.location, event.completed ? '완료' : ''].filter(Boolean).join(' · ')}</small>}
          {event.memo && <small style={{ whiteSpace: 'pre-wrap' }}>{event.memo}</small>}</span>
        <span className="internal-date">{event.start_date.slice(5).replace('-', '/')}{event.end_date !== event.start_date && ` ~ ${event.end_date.slice(5).replace('-', '/')}`} · {event.start_time?.slice(0, 5) ?? '종일'}{event.end_time && ` ~ ${event.end_time.slice(0, 5)}`}</span>
        <div style={{ display: 'flex', gap: 4 }}><button className="bsm" onClick={() => open(event.start_date, event)}>수정</button><button className="bdng" disabled={saving} onClick={() => void remove(event.id)}>삭제</button></div>
      </div>) : <p className="internal-empty">{empty}</p>
  }
  return <section className="internal-schedule">
    <style>{`
      .internal-schedule{color:var(--ui-text)}.internal-schedule button:disabled{cursor:wait;opacity:.6}
      .internal-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:${mobileMode ? 14 : 20}px}
      .internal-toolbar h1{margin:0;font-size:${mobileMode ? 17 : 21}px;font-weight:700}
      .internal-card{padding:${mobileMode ? 14 : 22}px;border:1px solid var(--ui-border);border-radius:12px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.06);margin-bottom:${mobileMode ? 12 : 18}px}
      .internal-card h2{font-size:14px;font-weight:600;margin:0}
      .internal-event{display:flex;align-items:center;gap:10px;flex-wrap:${mobileMode ? 'wrap' : 'nowrap'};width:100%;padding:10px 0;border-bottom:1px solid var(--ui-border);color:inherit;font-size:13px}
      .internal-event>span:nth-child(2){flex:1;min-width:0;overflow-wrap:anywhere}.internal-event small{display:block;margin-top:4px;color:var(--ui-text-2);font-size:12px}
      .internal-date{font-size:12px;color:var(--ui-text-3);white-space:nowrap}.internal-empty{color:var(--ui-text-3);font-size:14px;padding:30px 0;text-align:center}
      .internal-badge{font-size:10px;padding:2px 7px;border-radius:3px;background:var(--ui-surface-2);color:var(--ui-primary);flex-shrink:0}
      .internal-dialog{width:min(560px,calc(100vw - 32px));max-height:90dvh;overflow:auto;border:0;border-radius:12px;background:#fff;color:var(--ui-text);padding:0;box-shadow:0 20px 60px rgba(0,0,0,.15)}
      .internal-dialog::backdrop{background:rgba(0,0,0,.42)}.internal-fields{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:18px 22px}
      .internal-schedule button:focus-visible{outline:2px solid var(--ui-primary);outline-offset:3px}
      .internal-dialog label{display:block;font-size:12px;font-weight:500;color:var(--ui-text-2)}.internal-dialog input:not([type=checkbox]),.internal-dialog select,.internal-dialog textarea{display:block;width:100%;box-sizing:border-box;padding:9px 11px;margin-top:5px;border:1.5px solid var(--ui-border);border-radius:8px;background:#fff;color:var(--ui-text);font:inherit;font-size:13px}
      .internal-full{grid-column:1/-1}.internal-actions{display:flex;gap:8px;justify-content:flex-end;padding:0 22px 18px}
    `}</style>
    <div className="internal-toolbar"><div><h1>관리자 내부 일정</h1>{!mobileMode && <p style={{ color: 'var(--ui-text-2)', fontSize: 13, marginTop: 4 }}>날짜를 선택하면 관리자 내부 일정을 확인할 수 있습니다</p>}</div><button className="bgold" onClick={() => open(selected ?? today)}><svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M12 5v14M5 12h14" /></svg>일정 추가</button></div>
    {notice && <p role="status">{notice}</p>}
    {error && <div role="alert" style={{ background: 'var(--ui-danger-bg)', color: 'var(--ui-danger)', padding: 14, borderRadius: 10, marginBottom: 14 }}>일정을 불러오지 못했습니다. <button className="bout" onClick={() => void load()}>다시 불러오기</button></div>}
    <p style={{ fontSize: 12, color: 'var(--ui-text-2)', marginBottom: 10 }}>공휴일은 학원 휴강 여부와 별개입니다.{fallback && (holidays ? ' 현재 저장된 공휴일 자료를 표시합니다.' : ' 공휴일 정보를 불러오지 못했습니다.')}</p>
    <article className="internal-card" style={{ padding: mobileMode ? 12 : 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <button className="bnav" aria-label="이전 달" onClick={() => moveMonth(-1)}>{mobileMode ? '‹' : '◀'}</button>
        <span style={{ fontSize: 16, fontWeight: 700 }}>{year}년 {mo + 1}월</span>
        <button className="bnav" aria-label="다음 달" onClick={() => moveMonth(1)}>{mobileMode ? '›' : '▶'}</button>
      </div>
      {mobileMode ? <CompactMonthCalendar year={year} month={mo} selectedDate={selected} holidays={holidays} showNavigation={false}
        onSelectDate={selectDate} getDayInfo={date => ({ markers: dayEvents(date).map(event => event.completed ? 'var(--ui-text-3)' : 'var(--ui-primary)'), description: `일정 ${dayEvents(date).length}건` })} /> : <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 3, marginBottom: 3 }}>
          {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => <div key={day} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, padding: '4px 0', color: i === 0 ? 'var(--ui-danger)' : i === 6 ? '#2563A6' : 'var(--ui-text-3)' }}>{day}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 3 }}>
          {Array.from({ length: firstDay }, (_, i) => <div key={'p' + i} className="cd om"><div style={{ fontSize: 12, color: 'var(--ui-text-3)' }}>{previousDays - firstDay + 1 + i}</div></div>)}
          {Array.from({ length: days }, (_, i) => {
            const date = `${month}-${String(i + 1).padStart(2, '0')}`
            const dayItems = dayEvents(date)
            const holiday = holidays?.filter(h => h.date === date).map(h => h.name).join(' · ')
            const dow = (firstDay + i) % 7
            return <div key={date} className={`cd${date === today ? ' tod' : ''}${selected === date ? ' selected' : ''}`} onClick={() => selectDate(date)}>
              <button className="day-select" aria-pressed={selected === date} aria-label={`${mo + 1}월 ${i + 1}일${holiday ? ', ' + holiday : ''}, 일정 ${dayItems.length}건`} onClick={() => selectDate(date)} style={{ justifyContent: 'flex-start', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: date === today || holiday ? 700 : 500, color: holiday || dow === 0 ? 'var(--ui-danger)' : dow === 6 ? '#2563A6' : 'var(--ui-text)', width: 20, height: 20, lineHeight: '20px', textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
                {holiday ? <span title={holiday} style={{ fontSize: 10, color: 'var(--ui-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{holiday}</span> : date === today && <span style={{ fontSize: 10, color: 'var(--ui-primary)' }}>오늘</span>}
              </button>
              {dayItems.slice(0, 3).map(event => <button key={event.id} className="ce normal" onClick={e => { e.stopPropagation(); selectDate(date) }} title={event.title} style={{ opacity: event.completed ? .6 : 1 }}><span style={{ textDecoration: event.completed ? 'line-through' : undefined }}>{event.start_time ? event.start_time.slice(0, 5) + ' ' : ''}{event.title}</span></button>)}
              {dayItems.length > 3 && <button className="calendar-more" onClick={() => selectDate(date)}>+{dayItems.length - 3}건 더보기</button>}
            </div>
          })}
          {Array.from({ length: trailing }, (_, i) => <div key={'n' + i} className="cd om"><div style={{ fontSize: 12, color: 'var(--ui-text-3)' }}>{i + 1}</div></div>)}
        </div>
      </>}
    </article>
    <ScheduleUpcoming source="admin" refreshToken={events} />
    <article className="internal-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}><h2>{listTitle} 일정 목록</h2><label style={{ fontSize: 12, color: 'var(--ui-text-2)' }}>분류 <select className="bsm" aria-label="일정 분류" value={filter} onChange={e => setFilter(e.target.value)}>{['전체', ...categories].map(c => <option key={c}>{c}</option>)}</select></label></div>
      {list(items, `${listTitle}에 일정이 없습니다`)}
    </article>
    {draft && <dialog ref={dialogRef} className="internal-dialog" aria-labelledby="internal-dialog-title" onCancel={e => { e.preventDefault(); close() }}>
      <form onSubmit={e => { e.preventDefault(); void save() }}>
        <div style={{ padding: '18px 22px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 id="internal-dialog-title" style={{ fontSize: 16, fontWeight: 700 }}>{editId === null ? '일정 등록' : '일정 수정'}</h2><button type="button" aria-label="닫기" disabled={saving} onClick={close} style={{ border: 0, background: 'none', color: 'var(--ui-text-3)', fontSize: 20, cursor: 'pointer' }}>×</button></div>
        <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="internal-fields">
          <label className="internal-full">일정 제목 *<input autoFocus required maxLength={120} placeholder="예: 주간 운영 회의" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
          <label>시작일 *<input type="date" required value={draft.start_date} onChange={e => setDraft({ ...draft, start_date: e.target.value, end_date: draft.end_date < e.target.value ? e.target.value : draft.end_date })} /></label>
          <label>종료일 *<input type="date" required min={draft.start_date} value={draft.end_date} onChange={e => setDraft({ ...draft, end_date: e.target.value })} /></label>
          <label className="internal-full"><input type="checkbox" checked={!draft.allDay} onChange={e => setDraft({ ...draft, allDay: !e.target.checked })} /> 시간 지정</label>
          {!draft.allDay && <><label>시작 시간 *<input type="time" required value={draft.start_time} onChange={e => setDraft({ ...draft, start_time: e.target.value })} /></label><label>종료 시간<input type="time" value={draft.end_time} onChange={e => setDraft({ ...draft, end_time: e.target.value })} /></label></>}
          <label>분류<select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
          <label>담당자<input maxLength={100} placeholder="이름 또는 팀" value={draft.owner} onChange={e => setDraft({ ...draft, owner: e.target.value })} /></label>
          <label className="internal-full">장소<input maxLength={200} placeholder="예: 상담실" value={draft.location} onChange={e => setDraft({ ...draft, location: e.target.value })} /></label>
          <label className="internal-full">메모<textarea rows={3} maxLength={5000} placeholder="준비물, 확인할 내용 등을 입력하세요" value={draft.memo} onChange={e => setDraft({ ...draft, memo: e.target.value })} /></label>
          <label className="internal-full"><input type="checkbox" checked={draft.completed} onChange={e => setDraft({ ...draft, completed: e.target.checked })} /> 완료한 일정</label>
        </div></fieldset>
        {formError && <p role="alert" style={{ color: 'var(--ui-danger)', padding: '0 22px 14px', fontSize: 12 }}>{formError}</p>}
        <div className="internal-actions">
          <button type="button" className="bout" disabled={saving} onClick={close}>취소</button>
          <button className="bgold" disabled={saving}>{saving ? '저장 중...' : '저장'}</button></div>
      </form>
    </dialog>}
  </section>
}
