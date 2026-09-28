// Presentation-only snapshots of the existing cards, retained for side-by-side version comparison.
// Sources: HomeworkStatsView.tsx and app/student/coupons/page.tsx. No queries or mutations.
import { IconCoupon, IconTrophy } from '@/components/icons'
import { COUPON_MILESTONES } from '@/lib/streak'
const navy = 'var(--ui-primary)', navyDk = 'var(--ui-primary)'
const bg = 'var(--ui-bg)', bd = 'var(--ui-border)'
const tx = 'var(--ui-text)', tx3 = 'var(--ui-text-3)', gr = 'var(--ui-success)', gbg = 'var(--ui-success-bg)'
const STREAK_TIERS = COUPON_MILESTONES
 type Coupon = { id: number; milestone: number; streak_value: number; claimed_at: string; used: boolean; code: string }
export function LegacyCouponCard({ c }: { c: Coupon }) {
  return (
    <div style={{
      background: c.used ? bg : `linear-gradient(135deg,${navy} 0%,${navyDk} 100%)`,
      borderRadius: 14, padding: '16px 18px', marginBottom: 10,
      opacity: c.used ? 0.6 : 1, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: c.used ? 0 : 14 }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
          background: c.used ? '#fff' : 'rgba(255,255,255,.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: c.used ? navy : '#fff',
        }}>
          <IconCoupon size={24} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: c.used ? tx : '#fff', margin: 0 }}>
            {c.milestone}일 연속 달성 쿠폰
          </p>
          <p style={{ fontSize: 11.5, color: c.used ? tx3 : 'rgba(255,255,255,.6)', margin: '3px 0 0' }}>
            {c.claimed_at.slice(0, 10)} 획득 · {c.streak_value}일 연속 기록
          </p>
        </div>
        <span style={{
          flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
          background: c.used ? '#fff' : gbg, color: c.used ? tx3 : gr, border: c.used ? `1px solid ${bd}` : 'none',
        }}>
          {c.used ? '사용완료' : '사용가능'}
        </span>
      </div>
      {!c.used && (
        <div style={{ background: 'rgba(255,255,255,.1)', border: '1.5px dashed rgba(255,255,255,.4)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,.6)', margin: '0 0 4px' }}>학원에서 이 코드를 보여주세요</p>
          <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: 3, margin: 0, fontFamily: 'monospace' }}>{c.code}</p>
        </div>
      )}
    </div>
  )
}

export function LegacyStreakCard({ current, best }: { current: number; best: number }) {
 return (
      <div style={{
        background: `linear-gradient(135deg,${navy} 0%,var(--ui-primary) 100%)`, borderRadius: 14,
        padding: '16px 18px', marginBottom: 16, color: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 12 }}>
          <span style={{ fontSize: 28, fontWeight: 900 }}>{current}</span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,.75)' }}>일 연속 숙제 이행률 100% {current > 0 ? '달성 중 🔥' : ''}</span>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {STREAK_TIERS.map(tier => {
            const unlocked = best >= tier
            return (
              <div key={tier} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                opacity: unlocked ? 1 : .35, minWidth: 46,
              }}>
                <span style={{ display: 'flex' }}><IconTrophy size={22} /></span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,.85)' }}>{tier}일</span>
              </div>
            )
          })}
        </div>
        {best > 0 && <p style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', margin: '10px 0 0' }}>최고 기록: {best}일 연속</p>}
      </div>


 )
}