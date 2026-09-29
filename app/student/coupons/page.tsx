'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { IconCoupon } from '@/components/icons'
import { CouponTicket } from '@/components/streak-preview/GrowthCards'

const bd = 'var(--ui-border)'
const tx = 'var(--ui-text)', tx2 = 'var(--ui-text-2)', tx3 = 'var(--ui-text-3)'

type Coupon = { id: number; milestone: number; streak_value: number; claimed_at: string; used: boolean; code: string }

// 학생 계정 "쿠폰함" — 숙제 이행률 연속 100% 달성 마일스톤에서 받은 쿠폰 목록.
// 학생이 이 코드를 학원에서 보여주면, 관리자가 반관리 > 학생관리에서 코드로 검색해
// 바로 사용 처리한다.
export default function StudentCoupons() {
  const { student } = useAuth()
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)


  async function load(token: string) {
    setLoading(true)
    // student_coupons는 더 이상 직접 조회할 수 없다 — 코드 값(code)이 학원에서 바로
    // 쓸 수 있는 실질적인 상품권이라, 본인 토큰으로만 본인 쿠폰을 볼 수 있게 막았다.
    const { data } = await supabase.rpc('client_coupons', { p_token: token })
    setCoupons((data ?? []) as Coupon[])
    setLoading(false)
  }

  useEffect(() => {
    if (!student?.sessionToken) return
    const timer = window.setTimeout(() => { void load(student.sessionToken) }, 0)
    return () => window.clearTimeout(timer)
  }, [student?.sessionToken])

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {unused.length > 0 && (
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: tx3, letterSpacing: 1, margin: '0 0 10px' }}>사용 가능 ({unused.length})</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {unused.map(c => <CouponTicket key={c.id} milestone={c.milestone} code={c.code} />)}
              </div>
            </div>
          )}
          {used.length > 0 && (
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: tx3, letterSpacing: 1, margin: '0 0 10px' }}>사용 완료 ({used.length})</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {used.map(c => <CouponTicket key={c.id} milestone={c.milestone} code={c.code} used />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
