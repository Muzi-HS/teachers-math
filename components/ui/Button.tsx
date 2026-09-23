'use client'
import { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const VARIANT_STYLE: Record<Variant, React.CSSProperties> = {
  primary: { background: 'var(--ui-primary)', color: 'var(--ui-primary-text)', border: '1px solid var(--ui-primary)' },
  secondary: { background: '#fff', color: 'var(--ui-primary)', border: '1.5px solid var(--ui-border)' },
  ghost: { background: 'transparent', color: 'var(--ui-text-2)', border: '1px solid transparent' },
  danger: { background: 'var(--ui-danger-bg)', color: 'var(--ui-danger)', border: '1px solid var(--ui-danger-border)' },
}

const SIZE_STYLE: Record<Size, React.CSSProperties> = {
  sm: { padding: '6px 14px', fontSize: 13 },
  md: { padding: '10px 20px', fontSize: 14 },
}

export default function Button({
  variant = 'primary', size = 'md', style, className = '', children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={`ui-btn ${className}`}
      style={{
        fontWeight: 700, borderRadius: 'var(--ui-radius-sm)', cursor: 'pointer',
        fontFamily: "'Noto Sans KR',sans-serif", letterSpacing: .2,
        transition: 'transform .15s ease, box-shadow .15s ease, opacity .15s ease',
        ...VARIANT_STYLE[variant], ...SIZE_STYLE[size], ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  )
}
