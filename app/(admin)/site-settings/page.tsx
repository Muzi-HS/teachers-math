'use client'
import { useState } from 'react'
import { useMobileMode } from '@/context/MobileModeContext'
import SeasonTab from './SeasonTab'
import SpecialClassTab from './SpecialClassTab'
import SeminarTab from './SeminarTab'

const navy = 'var(--ui-primary)'
const bd = 'var(--ui-border)'
const tx = 'var(--ui-text)', tx2 = 'var(--ui-text-2)'

const TABS = [
  { key: 'season', label: '계절 효과' },
  { key: 'special', label: '특강 관리' },
  { key: 'seminar', label: '학부모 설명회' },
] as const
type TabKey = typeof TABS[number]['key']

export default function SiteSettingsPage() {
  const { mobileMode } = useMobileMode()
  const [tab, setTab] = useState<TabKey>('season')

  return (
    <div style={{ padding: mobileMode ? '16px 14px 88px' : '28px 32px', fontFamily: "'Noto Sans KR',sans-serif" }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ marginBottom: mobileMode ? 14 : 20 }}>
          <h1 style={{ fontSize: mobileMode ? 17 : 21, fontWeight: 700, color: tx }}>사이트 설정</h1>
          <p style={{ fontSize: 13, color: tx2, marginTop: 4 }}>홈페이지에 표시되는 계절 효과, 특강·설명회 배너/팝업을 관리합니다</p>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: `1px solid ${bd}` }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 13.5, fontWeight: 700, color: tab === t.key ? navy : tx2,
                borderBottom: `2px solid ${tab === t.key ? navy : 'transparent'}`, marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'season' && <SeasonTab />}
        {tab === 'special' && <SpecialClassTab />}
        {tab === 'seminar' && <SeminarTab />}
      </div>
    </div>
  )
}
