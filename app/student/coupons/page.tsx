'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { IconCoupon } from '@/components/icons'

const navy = 'var(--ui-primary)', navyDk = 'var(--ui-primary)'
const bg = 'var(--ui-bg)', bd = 'var(--ui-border)'
const tx = 'var(--ui-text)', tx2 = 'var(--ui-text-2)', tx3 = 'var(--ui-text-3)', gr = 'var(--ui-success)', gbg = 'var(--ui-success-bg)'

type Coupon = { id: number; milestone: number; streak_value: number; claimed_at: string; used: boolean; code: string }

// 학생 계정 "쿠폰함" — 숙제 이행률 연속 100% 달성 마일스톤에서 받은 쿠폰 목록.
// 학생이 이 코드를 학원에서 보여주면, 관리자가 반관리 > 학생관리에서 코드로 검색해
// 바로 사용 처리한다.
export default function StudentCoupons() {
  const { student } = useAuth()
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!student?.sessionToken) return
    load(student.sessionToken)
  }, [student?.sessionToken])

  async function load(token: string) {
    setLoading(true)
    // student_coupons는 더 이상 직접 조회할 수 없다 — 코드 값(code)이 학원에서 바로
    // 쓸 수 있는 실질적인 상품권이라, 본인 토큰으로만 본인 쿠폰을 볼 수 있게 막았다.
    const { data } = await supabase.rpc('client_coupons', { p_token: token })
    setCoupons((data ?? []) as Coupon[])
    setLoading(false)
  }

  const unused = coupons.filter(c => !c.used)
  const used = coupons.filter(c => c.used)

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 20, fontWeight: 700, color: tx, margin: 0 }}>쿠폰함</p>
        <p style={{ fontSize: 13, color: tx2, marginTop: 4 }}>숙제 이행률 연속 달성으로 받은 쿠폰이에요</p>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: tx3, padding: '40px 0' }}>불러오는 중...</p>
      ) : coupons.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: '60px 0', textAlign: 'center', color: tx3 }}>
          <p style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><IconCoupon size={32} /></p>
          <p style={{ fontSize: 14 }}>아직 받은 쿠폰이 없습니다</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>숙제 이행률 100%를 며칠 연속 달성해보세요!</p>
        </div>
      ) : (
        <>
          {unused.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: tx3, letterSpacing: 1, margin: '0 0 10px' }}>사용 가능 ({unused.length})</p>
              {unused.map(c => <CouponCard key={c.id} c={c} />)}
            </div>
          )}
          {used.length > 0 && (
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: tx3, letterSpacing: 1, margin: '0 0 10px' }}>사용 완료 ({used.length})</p>
              {used.map(c => <CouponCard key={c.id} c={c} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CouponCard({ c }: { c: Coupon }) {
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
