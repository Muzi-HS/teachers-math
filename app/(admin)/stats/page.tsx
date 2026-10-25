'use client'
import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useMobileMode } from '@/context/MobileModeContext'
const AnalyticsView = dynamic(() => import('./AnalyticsView'))
const EnrollmentStatsView = dynamic(() => import('./EnrollmentStatsView'))
const StudentStatsView = dynamic(() => import('./StudentStatsView'))
const HomeworkRanking = dynamic(() => import('./HomeworkRanking'))
const StudyStatsView = dynamic(() => import('./StudyStatsView'))
const CouponProcessingView = dynamic(() => import('@/components/CouponProcessingView'))

function StatsTabs() {
  const params = useSearchParams()
  const router = useRouter()
  const { role } = useAuth()
  const { mobileMode } = useMobileMode()
  const requested = params.get('tab')
  const tab = requested === 'ranking' || (requested === 'study' && (role === 'admin' || role === 'teacher')) || ((requested === 'analytics' || requested === 'coupons' || requested === 'enrollment') && role === 'admin') ? requested : requested === 'stats' ? 'stats' : role === 'admin' ? 'analytics' : 'stats'
  const tabs = [...(role === 'admin' ? [{ id: 'analytics', label: '접속 통계' }, { id: 'enrollment', label: '학생 추이' }] : []), { id: 'stats', label: '학생 통계' }, { id: 'ranking', label: '숙제 이행률 통계' }, ...((role === 'admin' || role === 'teacher') ? [{ id: 'study', label: '공부시간 통계' }] : []), ...(role === 'admin' ? [{ id: 'coupons', label: '쿠폰' }] : [])]
  return <div style={{ padding: mobileMode ? '16px 14px 88px' : '28px 32px', color: 'var(--ui-text)' }}>
    <header style={{ marginBottom: 20 }}><h1 style={{ fontSize: mobileMode ? 17 : 21, fontWeight: 700 }}>통계</h1><p style={{ fontSize: 13, color: 'var(--ui-text-2)', marginTop: 4 }}>학생 현황과 학습·운영 통계를 확인하세요</p></header>
    <div aria-label="통계 메뉴" style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--ui-surface-2)', borderRadius: 12, marginBottom: 20, width: 'fit-content', maxWidth: '100%', flexWrap: 'wrap' }}>
      {tabs.map(item => <button key={item.id} aria-current={tab === item.id ? 'page' : undefined} onClick={() => router.replace(`/stats?tab=${item.id}`, { scroll: false })} style={{ padding: mobileMode ? '10px 12px' : '10px 20px', border: 0, borderRadius: 9, font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: tab === item.id ? 'var(--ui-primary)' : 'var(--ui-text-2)', background: tab === item.id ? 'var(--ui-surface)' : 'transparent', boxShadow: tab === item.id ? '0 1px 4px rgba(0,0,0,.06)' : undefined }}>{item.label}</button>)}
    </div>
    {tab === 'enrollment' ? <EnrollmentStatsView /> : tab === 'analytics' ? <AnalyticsView /> : tab === 'stats' ? <StudentStatsView /> : tab === 'ranking' ? <HomeworkRanking /> : tab === 'study' ? <StudyStatsView /> : <CouponProcessingView />}
  </div>
}
export default function StatsPage() { return <Suspense fallback={<p style={{ padding: 24 }}>불러오는 중…</p>}><StatsTabs /></Suspense> }
