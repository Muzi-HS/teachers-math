'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

const navy = '#0D2A5E', navyDk = '#071A3E', gold = '#D87E13'
const bg = '#F5F7FA', bd = '#DDE3EE'
const tx = '#0D1B36', tx2 = '#4B5C7E', tx3 = '#96A4BF', gr = '#1A7F4E', gbg = '#E0F5EB'

type Coupon = { id: number; milestone: number; streak_value: number; claimed_at: string; used: boolean }

// 학생 계정 "쿠폰함" — 숙제 이행률 연속 100% 달성 마일스톤에서 받은 쿠폰 목록.
// 실제 사용 처리(used)는 관리자가 반관리 > 학생 상세에서 확인해준다.
export default function StudentCoupons() {
  const { student } = useAuth()
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!student?.studentId) return
    load(student.studentId)
  }, [student?.studentId])

  async function load(studentId: number) {
    setLoading(true)
    const { data } = await supabase
      .from('student_coupons').select('id,milestone,streak_value,claimed_at,used')
      .eq('student_id', studentId).order('claimed_at', { ascending: false })
    setCoupons(data ?? [])
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
          <p style={{ fontSize: 32, marginBottom: 8 }}>🎟️</p>
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
      position: 'relative', display: 'flex', alignItems: 'center', gap: 14,
      background: c.used ? bg : `linear-gradient(135deg,${navy} 0%,${navyDk} 100%)`,
      borderRadius: 14, padding: '16px 18px', marginBottom: 10,
      opacity: c.used ? 0.6 : 1, overflow: 'hidden',
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
        background: c.used ? '#fff' : 'rgba(255,255,255,.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
      }}>
        🎟️
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
  )
}
