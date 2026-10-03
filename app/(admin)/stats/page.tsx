'use client'
import { Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useMobileMode } from '@/context/MobileModeContext'
import StudentStatsView from './StudentStatsView'
import HomeworkRanking from './HomeworkRanking'
import CouponProcessingView from '@/components/CouponProcessingView'

function StatsTabs() {
  const params = useSearchParams()
  const router = useRouter()
  const { role } = useAuth()
  const { mobileMode } = useMobileMode()
  const requested = params.get('tab')
  const tab = requested === 'ranking' || (requested === 'coupons' && role === 'admin') ? requested : 'stats'
  const tabs = [{ id: 'stats', label: '통계' }, { id: 'ranking', label: '숙제 이행률 순위' }, ...(role === 'admin' ? [{ id: 'coupons', label: '쿠폰처리' }] : [])]
  return <div style={{ padding: mobileMode ? '16px 14px 88px' : '28px 32px', color: 'var(--ui-text)' }}>
    <header style={{ marginBottom: 20 }}><h1 style={{ fontSize: mobileMode ? 17 : 21, fontWeight: 700 }}>통계</h1><p style={{ fontSize: 13, color: 'var(--ui-text-2)', marginTop: 4 }}>학생의 학습 현황과 월별 성취도를 확인하세요</p></header>
    <div aria-label="통계 메뉴" style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--ui-surface-2)', borderRadius: 12, marginBottom: 20, width: 'fit-content', maxWidth: '100%' }}>
      {tabs.map(item => <button key={item.id} aria-current={tab === item.id ? 'page' : undefined} onClick={() => router.replace(`/stats?tab=${item.id}`, { scroll: false })} style={{ padding: mobileMode ? '10px 12px' : '10px 20px', border: 0, borderRadius: 9, font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: tab === item.id ? 'var(--ui-primary)' : 'var(--ui-text-2)', background: tab === item.id ? 'var(--ui-surface)' : 'transparent', boxShadow: tab === item.id ? '0 1px 4px rgba(0,0,0,.06)' : undefined }}>{item.label}</button>)}
    </div>
    {tab === 'stats' ? <StudentStatsView /> : tab === 'ranking' ? <HomeworkRanking /> : <CouponProcessingView />}
  </div>
}
export default function StatsPage() { return <Suspense fallback={<p style={{ padding: 24 }}>불러오는 중…</p>}><StatsTabs /></Suspense> }
