'use client'
import { useAppInstall } from '@/context/AppInstallContext'

export default function AppInstallButton() {
  const { installed, installing, message, install } = useAppInstall()
  return (
    <div style={{ marginBottom: 20 }}>
      <button onClick={install} disabled={installed || installing} style={{
        padding: '12px 20px', border: 'none', borderRadius: 10,
        background: 'var(--ui-primary)', color: 'var(--ui-primary-text)',
        fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
        cursor: installed || installing ? 'default' : 'pointer', opacity: installed || installing ? 0.65 : 1,
      }}>{installed ? '설치된 앱입니다' : installing ? '설치 중...' : '이 기기에 앱 설치'}</button>
      {message && <p role="status" style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--ui-text-2)', margin: '10px 0 0' }}>{message}</p>}
    </div>
  )
}
