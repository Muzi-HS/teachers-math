'use client'

import type { PublicHoliday } from '@/lib/korean-public-holidays'
import { kstDateStr } from '@/lib/kst'

const weekdays = ['일', '월', '화', '수', '목', '금', '토']
const red = 'var(--ui-danger)'
const blue = '#2563A6'

export type CalendarDayInfo = { holiday?: boolean; markers?: string[]; description?: string }

export default function CompactMonthCalendar({
  year, month, selectedDate, onSelectDate, onMoveMonth, holidays, getDayInfo, showNavigation = true, showHolidayNames = false,
}: {
  year: number
  month: number // zero-based
  selectedDate: string | null
  onSelectDate: (date: string) => void
  onMoveMonth?: (delta: number) => void
  holidays?: PublicHoliday[] | null
  getDayInfo?: (date: string) => CalendarDayInfo
  showNavigation?: boolean
  showHolidayNames?: boolean
}) {
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7
  const today = kstDateStr()
  const holidayNames = new Map<string, string[]>()
  for (const holiday of holidays ?? []) holidayNames.set(holiday.date, [...(holidayNames.get(holiday.date) ?? []), holiday.name])
  const selectedNames = selectedDate ? holidayNames.get(selectedDate) : undefined

  return <div>
    {showNavigation && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <button type="button" aria-label="이전 달" onClick={() => onMoveMonth?.(-1)} style={{ minWidth: 36, minHeight: 36, border: 0, background: 'none', color: 'var(--ui-text-2)', fontSize: 22, cursor: 'pointer' }}>‹</button>
      <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ui-text)' }}>{year}년 {month + 1}월</span>
      <button type="button" aria-label="다음 달" onClick={() => onMoveMonth?.(1)} style={{ minWidth: 36, minHeight: 36, border: 0, background: 'none', color: 'var(--ui-text-2)', fontSize: 22, cursor: 'pointer' }}>›</button>
    </div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', marginBottom: 4 }}>
      {weekdays.map((day, index) => <div key={day} style={{ textAlign: 'center', padding: '4px 0', fontSize: 11, fontWeight: 600, color: index === 0 ? red : index === 6 ? blue : 'var(--ui-text-3)' }}>{day}</div>)}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '3px 0' }}>
      {Array.from({ length: cells }, (_, index) => {
        const day = index - firstWeekday + 1
        if (day < 1 || day > daysInMonth) return <div key={index} aria-hidden="true" />
        const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const info = getDayInfo?.(date)
        const names = holidayNames.get(date)
        const isHoliday = !!names?.length || !!info?.holiday
        const isSelected = selectedDate === date
        const isToday = today === date
        const weekday = index % 7
        const color = isHoliday || weekday === 0 ? red : weekday === 6 ? blue : 'var(--ui-text)'
        return <button key={index} type="button" onClick={() => onSelectDate(date)}
          aria-label={`${month + 1}월 ${day}일${names?.length ? `, ${names.join(', ')}` : ''}${info?.description ? `, ${info.description}` : ''}`}
          aria-pressed={isSelected}
          title={names?.join(', ')}
          style={{ minWidth: 0, minHeight: 46, padding: '4px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: 3, border: isSelected ? '1px solid var(--ui-primary)' : '1px solid transparent', borderRadius: 8, background: isSelected ? 'var(--ui-surface-2)' : 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
          <span style={{ width: '100%', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: names?.length && showHolidayNames ? 'flex-start' : 'center', gap: 2 }}>
            <span style={{ width: 22, height: 22, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: '50%', background: isToday && !isSelected ? 'var(--ui-surface-2)' : 'transparent', fontSize: 13, fontWeight: isToday || isSelected || isHoliday ? 700 : 400, color }}>{day}</span>
            {showHolidayNames && names?.length ? <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 9, color: red, textAlign: 'left' }}>{names.join(' · ')}</span> : null}
          </span>
          <span style={{ minHeight: 4, display: 'flex', gap: 2 }}>
            {(info?.markers ?? []).slice(0, 3).map((marker, markerIndex) => <span key={markerIndex} style={{ width: 4, height: 4, borderRadius: '50%', background: marker }} />)}
          </span>
        </button>
      })}
    </div>
    {selectedNames?.length ? <p style={{ margin: '8px 4px 0', color: red, fontSize: 12, lineHeight: 1.5 }}>{selectedNames.join(' · ')}</p> : null}
  </div>
}
