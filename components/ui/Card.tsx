import { HTMLAttributes } from 'react'

export default function Card({ style, className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`ui-card ${className}`}
      style={{
        background: 'var(--ui-surface)', border: '1px solid var(--ui-border)', color: 'var(--ui-text)',
        borderRadius: 'var(--ui-radius-md)', boxShadow: 'var(--ui-shadow-sm)',
        padding: 20, boxSizing: 'border-box', ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
}
