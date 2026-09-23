import { HTMLAttributes } from 'react'

type Tone = 'neutral' | 'accent' | 'warning' | 'success' | 'danger'

const TONE_STYLE: Record<Tone, React.CSSProperties> = {
  neutral: { background: 'var(--ui-surface-2)', color: 'var(--ui-text-2)' },
  accent: { background: 'var(--ui-accent-bg)', color: 'var(--ui-accent-text)' },
  warning: { background: 'var(--ui-warning-bg)', color: 'var(--ui-warning)' },
  success: { background: 'var(--ui-success-bg)', color: 'var(--ui-success)' },
  danger: { background: 'var(--ui-danger-bg)', color: 'var(--ui-danger)' },
}

export default function Badge({
  tone = 'neutral', style, children, ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      style={{
        display: 'inline-block', fontSize: 12, fontWeight: 700, padding: '4px 12px',
        borderRadius: 20, lineHeight: 1.4, ...TONE_STYLE[tone], ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  )
}
