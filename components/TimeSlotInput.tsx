'use client'
import type { CSSProperties } from 'react'

const bd = '#DDE3EE', tx = '#0D1B36'

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = ['00', '10', '20', '30', '40', '50']

type Props = {
  value: string // 'HH:MM' 또는 ''
  onChange: (v: string) => void
}

const selStyle: CSSProperties = {
  padding: '8px 6px', border: `1.5px solid ${bd}`, borderRadius: 8,
  fontSize: 13, fontFamily: 'inherit', color: tx, outline: 'none',
  background: '#fff', cursor: 'pointer', flex: 1, minWidth: 0,
}

export default function TimeSlotInput({ value, onChange }: Props) {
  const [h, m] = value ? value.split(':') : ['', '']
  const minuteOptions = m && !MINUTES.includes(m) ? [...MINUTES, m].sort() : MINUTES

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
      <select style={selStyle} value={h} onChange={e => onChange(`${e.target.value}:${m || '00'}`)}>
        <option value="">시</option>
        {HOURS.map(v => <option key={v} value={v}>{v}시</option>)}
      </select>
      <select style={selStyle} value={m} onChange={e => onChange(`${h || '00'}:${e.target.value}`)}>
        <option value="">분</option>
        {minuteOptions.map(v => <option key={v} value={v}>{v}분</option>)}
      </select>
    </div>
  )
}
