'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { COUPON_MILESTONES } from '@/lib/streak'

const navy = '#0D2A5E', navyDk = '#071A3E', gold = '#D87E13'
const tx2 = '#4B5C7E'

// 숙제 이행률 100% 연속 달성 마일스톤(5/10/15/20/25/30일)에 새로 도달했을 때 한 번만
// "쿠폰 받기 vs 다음 목표 도전" 선택지를 보여준다. student_streak_state에 마지막으로
// 확인한 스트릭과 이미 물어본 가장 높은 마일스톤을 저장해두고, 스트릭이 끊겼다가
// 다시 쌓이면 초기화해서 같은 마일스톤을 다시 달성했을 때도 재차 물어볼 수 있게 한다.
export default function StreakCouponPrompt({ studentId, currentStreak }: { studentId: number; currentStreak: number }) {
  const [prompt, setPrompt] = useState<{ milestone: number; nextMilestone: number | null } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function check() {
      const { data: state } = await supabase
        .from('student_streak_state').select('last_seen_streak, last_prompted_milestone')
        .eq('student_id', studentId).maybeSingle()

      const lastSeen = state?.last_seen_streak ?? 0
      let lastPrompted = state?.last_prompted_milestone ?? 0
      if (currentStreak < lastSeen) lastPrompted = 0 // 스트릭이 끊겼다 새로 쌓이는 중 → 재도전 가능하게 초기화

      const reached = COUPON_MILESTONES.filter(m => currentStreak >= m && m > lastPrompted)
      const target = reached.length > 0 ? reached[reached.length - 1] : null

      await supabase.from('student_streak_state').upsert({
        student_id: studentId, last_seen_streak: currentStreak, last_prompted_milestone: lastPrompted,
        updated_at: new Date().toISOString(),
      })

      if (target && !cancelled) {
        const idx = COUPON_MILESTONES.indexOf(target)
        setPrompt({ milestone: target, nextMilestone: COUPON_MILESTONES[idx + 1] ?? null })
      }
    }
    if (currentStreak > 0) check()
    return () => { cancelled = true }
  }, [studentId, currentStreak])

  async function markPrompted() {
    if (!prompt) return
    await supabase.from('student_streak_state').update({ last_prompted_milestone: prompt.milestone }).eq('student_id', studentId)
  }

  async function claim() {
    if (!prompt) return
    setBusy(true)
    await supabase.from('student_coupons').insert({ student_id: studentId, milestone: prompt.milestone, streak_value: currentStreak })
    await markPrompted()
    setBusy(false)
    setPrompt(null)
  }

  async function decline() {
    if (!prompt) return
    setBusy(true)
    await markPrompted()
    setBusy(false)
    setPrompt(null)
  }

  if (!prompt) return null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: '32px 26px', width: '100%', maxWidth: 340,
        textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,.25)',
      }}>
        <p style={{ fontSize: 44, margin: '0 0 10px' }}>🔥</p>
        <p style={{ fontSize: 19, fontWeight: 900, color: navyDk, margin: '0 0 6px' }}>
          {prompt.milestone}일 연속 숙제 이행률 100%!
        </p>
        <p style={{ fontSize: 13, color: tx2, margin: '0 0 24px', lineHeight: 1.6 }}>
          정말 대단해요! 지금 쿠폰을 받을까요,<br />아니면 더 큰 목표에 도전할까요?
        </p>

        <button onClick={claim} disabled={busy} style={{
          width: '100%', padding: 14, borderRadius: 12, border: 'none', background: gold,
          color: navyDk, fontSize: 15, fontWeight: 800, cursor: busy ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit', marginBottom: 10, opacity: busy ? .7 : 1,
        }}>
          🎟️ {prompt.milestone}일 연속 달성 쿠폰 받기
        </button>

        <button onClick={decline} disabled={busy} style={{
          width: '100%', padding: 14, borderRadius: 12, border: `1.5px solid ${navy}`, background: '#fff',
          color: navy, fontSize: 14, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit', opacity: busy ? .7 : 1,
        }}>
          {prompt.nextMilestone ? `${prompt.nextMilestone}일 연속 도전하기` : '계속 도전하기'}
        </button>

        <p style={{ fontSize: 11, color: '#96A4BF', margin: '14px 0 0' }}>
          받은 쿠폰은 "쿠폰함"에서 확인할 수 있어요
        </p>
      </div>
    </div>
  )
}
