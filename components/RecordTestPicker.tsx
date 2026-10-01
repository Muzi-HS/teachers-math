'use client'

import { useState } from 'react'

export type RecordTestOption = { id: number; name: string; date: string; total: number; is_archived?: boolean }

export default function RecordTestPicker({ tests, value, onChange }: {
  tests: RecordTestOption[]; value: number | null; onChange: (id: number | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [recentOnly, setRecentOnly] = useState(true)
  const selected = tests.find(test => test.id === value)
  const years = [...new Set(tests.filter(test => !test.is_archived).map(test => test.date.slice(0, 4)))].sort((a, b) => b.localeCompare(a))
  const filtered = tests
    .filter(test => !test.is_archived
      && (!search || test.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
      && (!year || test.date.startsWith(year))
      && (!month || test.date.slice(5, 7) === month))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
  const shown = recentOnly && !search && !year && !month ? filtered.slice(0, 8) : filtered

  return <div className="record-test-picker">
    <style>{`
      .record-test-picker{font-size:12px;color:var(--ui-text)}
      .record-test-picker button,.record-test-picker select,.record-test-picker input{font:inherit}
      .record-test-picker-trigger{width:100%;text-align:left;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 11px;border:1.5px solid var(--ui-border);border-radius:8px;background:#fff;color:var(--ui-text);cursor:pointer}
      .record-test-picker-trigger span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .record-test-picker-trigger small{color:var(--ui-text-3);white-space:nowrap}
      .record-test-picker-panel{margin-top:8px;padding:12px;border:1px solid var(--ui-border);border-radius:10px;background:#fff;box-shadow:0 4px 16px rgba(0,0,0,.07)}
      .record-test-picker-search{box-sizing:border-box;width:100%;padding:9px 10px;border:1px solid var(--ui-border);border-radius:8px;font-size:16px!important}
      .record-test-picker-filters{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin:9px 0}
      .record-test-picker-filters select,.record-test-picker-filters button{padding:7px 9px;border:1px solid var(--ui-border);border-radius:7px;background:#fff;color:var(--ui-text);cursor:pointer}
      .record-test-picker-filters button[aria-pressed=true]{background:var(--ui-accent-bg);border-color:var(--ui-primary);color:var(--ui-primary);font-weight:700}
      .record-test-picker-filters label{display:inline-flex;align-items:center;gap:4px;color:var(--ui-text-2);cursor:pointer}
      .record-test-picker-list{max-height:240px;overflow:auto;border:1px solid var(--ui-border);border-radius:8px}
      .record-test-picker-list button{display:flex;flex-direction:column;gap:3px;width:100%;padding:9px 11px;text-align:left;background:#fff;border:0;border-bottom:1px solid var(--ui-border);color:var(--ui-text);cursor:pointer}
      .record-test-picker-list button:last-child{border-bottom:0}
      .record-test-picker-list button:hover,.record-test-picker-list button[aria-selected=true]{background:var(--ui-accent-bg)}
      .record-test-picker-list small{color:var(--ui-text-2)}
      .record-test-picker-empty{padding:15px;color:var(--ui-text-3);text-align:center}
    `}</style>
    <button type="button" className="record-test-picker-trigger" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span>{selected ? selected.name : '테스트 선택'}</span>
      <small>{selected ? `${selected.date} · ${selected.total}문항${selected.is_archived ? ' · 보관됨' : ''}` : '검색하기 ▾'}</small>
    </button>
    {open && <div className="record-test-picker-panel">
      <input className="record-test-picker-search" aria-label="테스트명 검색" placeholder="테스트명 검색" value={search} onChange={event => setSearch(event.target.value)} autoFocus />
      <div className="record-test-picker-filters">
        <select aria-label="시험 연도" value={year} onChange={event => { setYear(event.target.value); setRecentOnly(false) }}><option value="">모든 연도</option>{years.map(value => <option key={value} value={value}>{value}년</option>)}</select>
        <select aria-label="시험 월" value={month} onChange={event => { setMonth(event.target.value); setRecentOnly(false) }}><option value="">모든 월</option>{Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map(value => <option key={value} value={value}>{Number(value)}월</option>)}</select>
        <button type="button" aria-pressed={recentOnly} onClick={() => { setRecentOnly(!recentOnly); setYear(''); setMonth('') }}>최근 8개</button>
      </div>
      <div className="record-test-picker-list" role="listbox" aria-label="테스트 목록">
        {value !== null && <button type="button" role="option" aria-selected={false} onClick={() => { onChange(null); setOpen(false) }}>선택 해제</button>}
        {shown.length ? shown.map(test => <button type="button" role="option" aria-selected={test.id === value} key={test.id} onClick={() => { onChange(test.id); setOpen(false) }}>
          <strong>{test.name}</strong><small>{test.date} · {test.total}문항{test.is_archived ? ' · 보관됨' : ''}</small>
        </button>) : <div className="record-test-picker-empty">조건에 맞는 시험이 없습니다.</div>}
      </div>
    </div>}
  </div>
}
