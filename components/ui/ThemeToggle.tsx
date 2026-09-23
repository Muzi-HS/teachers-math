'use client'
import { useInternalTheme } from '@/context/InternalThemeContext'

export default function ThemeToggle() {
  const { theme, toggle } = useInternalTheme()

  return (
    <button
      onClick={toggle}
      title={theme === 'green' ? '네이비 테마로 전환' : '그린 테마로 전환'}
      aria-label={`현재 ${theme === 'green' ? '그린' : '네이비'} 테마, ${theme === 'green' ? '네이비' : '그린'} 테마로 전환`}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'rgba(255,255,255,.1)', border: 'none', borderRadius: 20,
        cursor: 'pointer', padding: '4px 10px 4px 4px',
        fontSize: 11, fontWeight: 600, color: 'var(--chrome-text-2)',
        fontFamily: "'Noto Sans KR',sans-serif",
      }}
    >
      <span style={{
        width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
        background: theme === 'green' ? 'var(--brand-deep)' : 'var(--brand-navy)',
        border: '1.5px solid rgba(255,255,255,.4)',
      }} />
      {theme === 'green' ? '그린 테마' : '네이비 테마'}
    </button>
  )
}
