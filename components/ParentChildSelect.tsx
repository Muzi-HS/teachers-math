'use client'

type Props = {
  childList: { id: number; name: string }[]
  value: number | null
  onChange: (id: number) => void
}

export default function ParentChildSelect({ childList, value, onChange }: Props) {
  if (childList.length === 0) return null
  if (childList.length === 1) {
    return <span style={{ fontSize: 13, fontWeight: 600, color: '#2B6B45', overflowWrap: 'anywhere' }}>{childList[0].name}</span>
  }

  return (
    <span style={{ position: 'relative', display: 'inline-flex', maxWidth: '100%', minWidth: 0 }}>
      <select
        aria-label="자녀 선택"
        value={value ?? ''}
        onChange={event => onChange(Number(event.target.value))}
        style={{
          appearance: 'none', maxWidth: '100%', minWidth: 0, minHeight: 40,
          padding: '8px 30px 8px 12px', border: '1px solid #DCE7DD', borderRadius: 10,
          background: '#fff', color: '#2B6B45', fontSize: 13, fontWeight: 600,
          fontFamily: 'inherit', cursor: 'pointer', textOverflow: 'ellipsis',
        }}
      >
        <option value="" disabled>자녀 선택</option>
        {childList.map(child => <option key={child.id} value={child.id}>{child.name}</option>)}
      </select>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#6A7B6E' }}>
        <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}
