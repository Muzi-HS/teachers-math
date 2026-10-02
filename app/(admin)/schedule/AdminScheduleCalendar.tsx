'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { kstDateStr } from '@/lib/kst'
import { usePublicHolidays } from '@/lib/use-public-holidays'
import CompactMonthCalendar from '@/components/CompactMonthCalendar'

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
  const today = kstDateStr()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [selected, setSelected] = useState(today)
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
  }, [month, weekStart, weekEnd])
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
    if (draft && !confirm('입력 화면을 닫을까요? 저장하지 않은 내용은 사라집니다.')) return
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
  async function remove() {
    if (editId === null || saving || !confirm('이 내부 일정을 삭제할까요?')) return
    setSaving(true)
    try {
      const result = await supabase.from('admin_schedule_events').delete().eq('id', editId).select('id').single()
      if (result.error) throw result.error
      setDraft(null); setNotice('일정을 삭제했습니다.'); await load()
    } catch { setFormError('삭제하지 못했습니다. 다시 시도해주세요.') }
    finally { setSaving(false) }
  }
  const visible = events.filter(event => filter === '전체' || event.category === filter)
  const dayEvents = (date: string) => visible.filter(event => covers(event, date)).sort((a, b) =>
    Number(a.completed) - Number(b.completed) || (a.start_time ?? '').localeCompare(b.start_time ?? ''))
  function list(items: Event[], empty: string) {
    return loading ? <p>일정을 불러오는 중…</p> : error ? <p>일정 조회에 실패했습니다.</p> : items.length ? items.map(event =>
      <button className="internal-event" key={event.id} onClick={() => open(event.start_date, event)}>
        <span className="internal-time">{event.start_time?.slice(0, 5) ?? '종일'}</span>
        <span><strong style={{ textDecoration: event.completed ? 'line-through' : undefined }}>{event.title}</strong>
          <small>{event.category}{event.owner && ' · ' + event.owner}{event.location && ' · ' + event.location}
            {event.completed && ' · 완료'}</small></span>
        <span aria-hidden="true">›</span>
      </button>) : <p className="internal-empty">{empty}</p>
  }
  return <section className="internal-schedule">
    <style>{`
      .internal-schedule{color:var(--ui-text)}.internal-schedule button,.internal-schedule input,.internal-schedule select,.internal-schedule textarea{font:inherit}
      .internal-schedule button{cursor:pointer}.internal-schedule button:disabled{cursor:wait;opacity:.6}
      .internal-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:18px}
      .internal-toolbar h1{margin:0;flex:1;font-size:22px}.internal-btn{border:1px solid var(--ui-border);border-radius:9px;background:var(--ui-surface);color:var(--ui-text);padding:9px 14px}
      .internal-primary{background:var(--ui-primary);color:var(--ui-primary-text);border:0}
      .internal-summary,.internal-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px}
      .internal-card{padding:20px;border:1px solid var(--ui-border);border-radius:16px;background:var(--ui-surface)}
      .internal-card h2{font-size:16px;margin:0 0 12px}.internal-card h2 small{font-size:12px;font-weight:400;color:var(--ui-text-2)}
      .internal-event{display:flex;align-items:center;gap:12px;text-align:left;width:100%;padding:12px 0;border:0;border-bottom:1px solid var(--ui-border);background:none;color:inherit}
      .internal-event>span:nth-child(2){flex:1;min-width:0;overflow-wrap:anywhere}.internal-event small{display:block;margin-top:4px;color:var(--ui-text-2);font-size:12px}
      .internal-time{font-size:12px;color:var(--ui-primary);min-width:42px}.internal-empty{color:var(--ui-text-3);font-size:13px;padding:12px 0}
      .internal-weekday{display:flex;align-items:center;gap:8px;margin-top:12px;font-size:13px;color:var(--ui-text-2)}
      .internal-dialog{width:min(560px,calc(100vw - 32px));max-height:85dvh;overflow:auto;border:1px solid var(--ui-border);border-radius:18px;background:var(--ui-surface);color:var(--ui-text);padding:24px}
      .internal-dialog::backdrop{background:rgba(0,0,0,.4)}.internal-fields{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      .internal-schedule button:focus-visible{outline:2px solid var(--ui-primary);outline-offset:3px}
      .internal-dialog label{display:block;font-size:13px}.internal-dialog input:not([type=checkbox]),.internal-dialog select,.internal-dialog textarea{display:block;width:100%;box-sizing:border-box;padding:10px;margin-top:6px;border:1px solid var(--ui-border);border-radius:8px;background:var(--ui-bg);color:inherit}
      .internal-full{grid-column:1/-1}.internal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:20px}
      @media(max-width:760px){.internal-summary,.internal-grid{grid-template-columns:1fr}.internal-card{padding:16px}.internal-toolbar h1{font-size:18px}}
    `}</style>
    <div className="internal-toolbar"><h1>관리자 내부 일정</h1><button className="internal-btn internal-primary" onClick={() => open(selected)}>+ 일정 추가</button></div>
    <p style={{ color: 'var(--ui-text-2)', fontSize: 13 }}>관리자 계정에서만 확인하는 업무 달력입니다.</p>
    {notice && <p role="status">{notice}</p>}
    {error && <div role="alert"><p>{error}</p><button className="internal-btn" onClick={() => void load()}>다시 불러오기</button></div>}
    <div className="internal-summary">
      <article className="internal-card"><h2>오늘 일정 <small>{today} · {dayEvents(today).length}건</small></h2>{list(dayEvents(today), '오늘 등록된 일정이 없습니다.')}
        <button className="internal-btn" onClick={() => open(today)}>오늘 일정 등록</button></article>
      <article className="internal-card"><h2>이번 주 일정 <small>{weekStart.slice(5)} ~ {weekEnd.slice(5)}</small></h2>
        {loading ? <p>일정을 불러오는 중…</p> : error ? <p>일정 조회에 실패했습니다.</p> :
          Array.from({ length: 7 }, (_, i) => shift(weekStart, i)).map(date => dayEvents(date).length > 0 &&
            <div key={date}><div className="internal-weekday">{date.slice(5)} {date === today && <strong>오늘</strong>}</div>{list(dayEvents(date), '')}</div>)}
        {!loading && !error && !visible.some(event => event.start_date <= weekEnd && event.end_date >= weekStart) && <p className="internal-empty">이번 주 등록된 일정이 없습니다.</p>}
      </article>
    </div>
    <div className="internal-toolbar"><label>일정 분류 <select value={filter} onChange={e => setFilter(e.target.value)}>{['전체', ...categories].map(c => <option key={c}>{c}</option>)}</select></label>
      <button className="internal-btn" onClick={() => { setMonth(today.slice(0, 7)); setSelected(today) }}>오늘로 이동</button></div>
    <div className="internal-grid"><article className="internal-card">
      <CompactMonthCalendar year={year} month={mo} selectedDate={selected} holidays={holidays} showHolidayNames
        onSelectDate={setSelected} onMoveMonth={delta => { const d = new Date(Date.UTC(year, mo + delta, 1)); setMonth(d.toISOString().slice(0, 7)); setSelected(d.toISOString().slice(0, 10)) }}
        getDayInfo={date => ({ markers: dayEvents(date).slice(0, 3).map(event => event.completed ? 'var(--ui-text-3)' : 'var(--ui-primary)'), description: dayEvents(date).map(event => event.title).join(', ') })} />
      <p style={{ fontSize: 12, color: 'var(--ui-text-2)' }}>공휴일은 학원 휴강 여부와 별개입니다.{fallback ? ' 공휴일 API 연결 전이거나 조회 실패 시 저장된 자료를 표시합니다.' : ' 공휴일 API 연동 중'}</p>
    </article><article className="internal-card"><h2>{selected} 일정</h2>
      {holidays?.filter(h => h.date === selected).map(h => <p key={h.name} style={{ color: 'var(--ui-danger)' }}>{h.name} · 공휴일</p>)}
      {list(dayEvents(selected), '선택한 날짜에 등록된 일정이 없습니다.')}
      <button className="internal-btn internal-primary" onClick={() => open(selected)}>이 날짜에 일정 추가</button>
    </article></div>
    {draft && <dialog ref={dialogRef} className="internal-dialog" aria-labelledby="internal-dialog-title" onCancel={e => { e.preventDefault(); close() }}>
      <form onSubmit={e => { e.preventDefault(); void save() }}>
        <h2 id="internal-dialog-title">{editId === null ? '내부 일정 등록' : '내부 일정 수정'}</h2>
        <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="internal-fields">
          <label className="internal-full">일정 제목 *<input autoFocus required maxLength={120} placeholder="예: 주간 운영 회의" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
          <label>시작일 *<input type="date" required value={draft.start_date} onChange={e => setDraft({ ...draft, start_date: e.target.value, end_date: draft.end_date < e.target.value ? e.target.value : draft.end_date })} /></label>
          <label>종료일 *<input type="date" required min={draft.start_date} value={draft.end_date} onChange={e => setDraft({ ...draft, end_date: e.target.value })} /></label>
          <label className="internal-full"><input type="checkbox" checked={draft.allDay} onChange={e => setDraft({ ...draft, allDay: e.target.checked })} /> 종일 일정</label>
          {!draft.allDay && <><label>시작 시간 *<input type="time" required value={draft.start_time} onChange={e => setDraft({ ...draft, start_time: e.target.value })} /></label><label>종료 시간<input type="time" value={draft.end_time} onChange={e => setDraft({ ...draft, end_time: e.target.value })} /></label></>}
          <label>분류<select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
          <label>담당자<input maxLength={100} placeholder="이름 또는 팀" value={draft.owner} onChange={e => setDraft({ ...draft, owner: e.target.value })} /></label>
          <label className="internal-full">장소<input maxLength={200} placeholder="예: 상담실" value={draft.location} onChange={e => setDraft({ ...draft, location: e.target.value })} /></label>
          <label className="internal-full">메모<textarea rows={3} maxLength={5000} placeholder="준비물, 확인할 내용 등을 입력하세요" value={draft.memo} onChange={e => setDraft({ ...draft, memo: e.target.value })} /></label>
          <label className="internal-full"><input type="checkbox" checked={draft.completed} onChange={e => setDraft({ ...draft, completed: e.target.checked })} /> 완료한 일정</label>
        </div></fieldset>
        {formError && <p role="alert" style={{ color: 'var(--ui-danger)' }}>{formError}</p>}
        <div className="internal-actions">{editId !== null && <button type="button" className="internal-btn" disabled={saving} onClick={() => void remove()}>삭제</button>}
          <button type="button" className="internal-btn" disabled={saving} onClick={close}>취소</button>
          <button className="internal-btn internal-primary" disabled={saving}>{saving ? '저장 중…' : '저장'}</button></div>
      </form>
    </dialog>}
  </section>
}
