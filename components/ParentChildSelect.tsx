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
    <div role="group" aria-label="자녀 선택" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6, minWidth: 0 }}>
      {childList.map(child => {
        const selected = child.id === value
        return (
          <button
            key={child.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(child.id)}
            style={{
              maxWidth: '100%', minWidth: 0, minHeight: 36, padding: '7px 10px',
              border: `1px solid ${selected ? '#2B6B45' : '#DCE7DD'}`, borderRadius: 9,
              background: selected ? '#2B6B45' : '#fff', color: selected ? '#fff' : '#6A7B6E',
              fontSize: 12, fontWeight: selected ? 700 : 500, fontFamily: 'inherit',
              cursor: 'pointer', overflowWrap: 'anywhere', lineHeight: 1.4,
            }}
          >
            {child.name}
          </button>
        )
      })}
    </div>
  )
}
