import { ReactNode } from 'react'

export default function PageHeader({
  title, subtitle, actions,
}: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      gap: 16, flexWrap: 'wrap', marginBottom: 24,
    }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ui-primary)', letterSpacing: -.3, margin: 0 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 13.5, color: 'var(--ui-text-2)', marginTop: 6 }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  )
}
