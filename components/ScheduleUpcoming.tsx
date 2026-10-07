'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { kstDateStr } from '@/lib/kst'
import { scheduleWeek, schedulesInRange, type ScheduleSummaryEvent } from '@/lib/schedule-summary'
import { scheduleColor } from '@/lib/schedule-colors'

export default function ScheduleUpcoming({ source, dashboard = false, refreshToken }: {
  source: 'academy' | 'admin'; dashboard?: boolean; refreshToken?: unknown
}) {
  const today = kstDateStr()
  const { start, end } = scheduleWeek(today)
  const [events, setEvents] = useState<ScheduleSummaryEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const fields = source === 'admin'
          ? 'id,title,start_date,end_date,start_time,end_time,category,completed,owner,location'
          : 'id,title,start_date,end_date,start_time,end_time,type'
        const table = source === 'admin' ? 'admin_schedule_events' : 'events'
        const [ongoing, singleDay] = await Promise.all([
          supabase.from(table).select(fields).lte('start_date', end).gte('end_date', start),
          supabase.from(table).select(fields).is('end_date', null).gte('start_date', start).lte('start_date', end),
        ])
        if (!active) return
        if (ongoing.error || singleDay.error) throw new Error('schedule-load')
        const rows = [...(ongoing.data ?? []), ...(singleDay.data ?? [])] as unknown as ScheduleSummaryEvent[]
        setEvents([...new Map(rows.map(row => [row.id, row])).values()]); setError(false)
      } catch { if (active) { setEvents([]); setError(true) } }
      finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [source, start, end, refreshToken, retry])
  const title = source === 'admin' ? '학원일정 · 내부용' : '학원일정'
  const groups = [
    { title: '오늘', range: today.slice(5).replace('-', '.'), rows: schedulesInRange(events, today) },
    { title: '이번 주', range: `${start.slice(5).replace('-', '.')} – ${end.slice(5).replace('-', '.')}`, rows: schedulesInRange(events, start, end) },
  ]
  return <section className="schedule-upcoming" aria-label={`${title} 오늘·이번 주 일정`}>
    <style>{`
      .schedule-upcoming{background:var(--ui-surface);border:1px solid var(--ui-border);border-radius:12px;padding:20px;margin-bottom:18px;color:var(--ui-text);min-width:0}
      .schedule-upcoming header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}
      .schedule-upcoming h2{font-size:15px;font-weight:700;margin:0}.schedule-upcoming header a{font-size:12px;color:var(--ui-primary);text-decoration:none;padding:6px 0}
      .schedule-upcoming-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}
      .schedule-upcoming h3{display:flex;align-items:center;gap:7px;font-size:13px;margin:0 0 4px}.schedule-upcoming h3 span{background:var(--ui-surface-2);color:var(--ui-primary);border-radius:20px;padding:2px 7px;font-size:11px}
      .schedule-upcoming-range{font-size:11px;color:var(--ui-text-3);margin:0 0 10px}
      .schedule-upcoming ul{list-style:none;padding:0;margin:0;max-height:300px;overflow:auto}.schedule-upcoming li{display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--ui-border);font-size:13px}.schedule-upcoming li:last-child{border-bottom:0}
      .schedule-upcoming time{width:42px;flex-shrink:0;color:var(--ui-text-2);font-size:11px;line-height:20px;font-variant-numeric:tabular-nums}.schedule-upcoming strong{display:block;overflow-wrap:anywhere;font-weight:600;line-height:1.5}.schedule-upcoming small{display:block;color:var(--ui-text-3);font-size:11px;margin-top:3px;overflow-wrap:anywhere}
      .schedule-upcoming-empty{font-size:12px;color:var(--ui-text-3);padding:14px 0;margin:0}.schedule-upcoming-error{color:var(--ui-danger);font-size:13px}.schedule-upcoming-error button{margin-left:8px;border:0;background:none;color:var(--ui-primary);font:inherit;cursor:pointer;text-decoration:underline}
      .dashboard-schedule-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.dashboard-schedule-grid .schedule-upcoming-grid{grid-template-columns:1fr;gap:18px}
      @media(max-width:700px){.schedule-upcoming{padding:16px;margin-bottom:12px}.schedule-upcoming-grid,.dashboard-schedule-grid{grid-template-columns:1fr;gap:16px}.dashboard-schedule-grid{gap:0}}
    `}</style>
    <header><h2>{dashboard ? title : '가까운 일정'}</h2>{dashboard && <Link href={`/schedule?tab=${source}`}>전체 일정 →</Link>}</header>
    {error && !loading ? <p role="alert" className="schedule-upcoming-error">일정을 불러오지 못했습니다.<button onClick={() => setRetry(value => value + 1)}>다시 시도</button></p> :
      <div className="schedule-upcoming-grid">{groups.map(group => <div key={group.title}>
        <h3>{group.title}<span>{loading ? '…' : `${group.rows.length}건`}</span></h3><p className="schedule-upcoming-range">{group.range}</p>
        {loading ? <p className="schedule-upcoming-empty">불러오는 중…</p> : group.rows.length ? <ul>{group.rows.map(event => <li key={event.id}>
          <time dateTime={event.start_date}>{event.start_date.slice(5).replace('-', '.')}</time><div>
            <strong style={{ color: event.type === 'holiday' ? 'var(--ui-danger)' : source === 'admin' ? scheduleColor(event.category ?? '').color : undefined, textDecoration: event.completed ? 'line-through' : undefined }}>{event.title}</strong>
            <small>{source === 'admin' && <span title={scheduleColor(event.category ?? '').name} aria-label={scheduleColor(event.category ?? '').name} style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: scheduleColor(event.category ?? '').color, marginRight: 6 }} />}{[event.type === 'holiday' ? '휴원' : '', event.start_time ? `${event.start_time.slice(0, 5)}${event.end_time ? ` – ${event.end_time.slice(0, 5)}` : ''}` : '종일', event.end_date && event.end_date !== event.start_date ? `~ ${event.end_date.slice(5).replace('-', '.')}` : '', event.location, event.completed ? '완료' : ''].filter(Boolean).join(' · ')}</small>
          </div></li>)}</ul> : <p className="schedule-upcoming-empty">{group.title} 예정된 일정이 없습니다.</p>}
      </div>)}</div>}
  </section>
}
