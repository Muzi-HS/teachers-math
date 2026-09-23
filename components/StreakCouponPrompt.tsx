'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { kstDateStr } from '@/lib/kst'
import { computeStreak, generateCouponCode, COUPON_MILESTONES, type StreakRec } from '@/lib/streak'
import { IconCoupon } from '@/components/icons'

const navy = 'var(--ui-primary)', navyDk = 'var(--ui-primary)', gold = 'var(--ui-primary)'
const tx2 = 'var(--ui-text-2)'

// 숙제 이행률 100% 연속 달성 마일스톤(5/10/15/20/25/30일)에 새로 도달했을 때 한 번만
// "쿠폰 받기 vs 다음 목표 도전" 선택지를 보여준다.
//
// "쿠폰을 받으면 처음부터 다시 센다"는 요구에 따라, 스트릭은 마지막으로 쿠폰을 받은
// 날짜(last_claimed_date) 이후의 기록만으로 계산한다 — 쿠폰을 받는 순간 그 시점부터
// 완전히 새로 시작. 반면 "다음 목표 도전하기"(넘기기)는 같은 스트릭을 계속 이어가야
// 하므로 last_claimed_date는 그대로 두고 last_prompted_milestone만 올려서, 다음 상위
// 마일스톤에 도달할 때까지는 다시 묻지 않게 한다.
export default function StreakCouponPrompt({ studentId, chronoRecs }: { studentId: number; chronoRecs: StreakRec[] }) {
  const [prompt, setPrompt] = useState<{ milestone: number; nextMilestone: number | null; streakValue: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [claimedCode, setClaimedCode] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function check() {
      const { data: state } = await supabase
        .from('student_streak_state').select('last_seen_streak, last_prompted_milestone, last_claimed_date')
        .eq('student_id', studentId).maybeSingle()

      // 마지막 쿠폰 수령일 이후 기록만 대상으로 스트릭을 계산한다 (없으면 전체 기록)
      const lastClaimedDate: string | null = state?.last_claimed_date ?? null
      const scopedRecs = lastClaimedDate ? chronoRecs.filter(r => r.date > lastClaimedDate) : chronoRecs
      const { current } = computeStreak(scopedRecs)
      if (current === 0) return // 셀 게 없으면(막 초기화됐거나 스트릭이 끊긴 상태) 확인할 것도 없음

      const lastSeen = state?.last_seen_streak ?? 0
      let lastPrompted = state?.last_prompted_milestone ?? 0
      if (current < lastSeen) lastPrompted = 0 // 스트릭이 끊겼다 새로 쌓이는 중 → 재도전 가능하게 초기화

      const reached = COUPON_MILESTONES.filter(m => current >= m && m > lastPrompted)
      const target = reached.length > 0 ? reached[reached.length - 1] : null

      await supabase.from('student_streak_state').upsert({
        student_id: studentId, last_seen_streak: current, last_prompted_milestone: lastPrompted,
        last_claimed_date: lastClaimedDate, updated_at: new Date().toISOString(),
      })

      if (target && !cancelled) {
        const idx = COUPON_MILESTONES.indexOf(target)
        setPrompt({ milestone: target, nextMilestone: COUPON_MILESTONES[idx + 1] ?? null, streakValue: current })
      }
    }
    check()
    return () => { cancelled = true }
  }, [studentId, chronoRecs]) // eslint-disable-line react-hooks/exhaustive-deps

  async function claim() {
    if (!prompt) return
    setBusy(true)
    // 코드 유니크 제약과 충돌하면(극히 드묾) 새 코드로 재시도
    let code = ''
    for (let attempt = 0; attempt < 5; attempt++) {
      code = generateCouponCode()
      const { error } = await supabase.from('student_coupons')
        .insert({ student_id: studentId, milestone: prompt.milestone, streak_value: prompt.streakValue, code })
      if (!error) break
      if (attempt === 4) { setBusy(false); return }
    }
    // 쿠폰을 받으면 오늘부터 처음부터 다시 세도록 기준일을 오늘로 리셋
    await supabase.from('student_streak_state').update({
      last_prompted_milestone: 0, last_seen_streak: 0, last_claimed_date: kstDateStr(),
    }).eq('student_id', studentId)
    setBusy(false)
    setClaimedCode(code)
  }

  async function decline() {
    if (!prompt) return
    setBusy(true)
    // 같은 스트릭을 계속 이어가야 하므로 기준일은 그대로 두고, 이 마일스톤만 다시 안 묻도록 표시
    await supabase.from('student_streak_state').update({ last_prompted_milestone: prompt.milestone }).eq('student_id', studentId)
    setBusy(false)
    setPrompt(null)
  }

  if (!prompt && !claimedCode) return null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: '32px 26px', width: '100%', maxWidth: 340,
        textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,.25)',
      }}>
        {claimedCode ? (
          <>
            <p style={{ margin: '0 0 10px', color: navy, display: 'flex', justifyContent: 'center' }}><IconCoupon size={44} strokeWidth={1.5} /></p>
            <p style={{ fontSize: 17, fontWeight: 900, color: navyDk, margin: '0 0 4px' }}>쿠폰 발급 완료!</p>
            <p style={{ fontSize: 12.5, color: tx2, margin: '0 0 18px' }}>학원에서 이 코드를 선생님께 보여주세요</p>
            <div style={{
              background: 'var(--ui-bg)', border: `1.5px dashed color-mix(in srgb, ${navy} 33%, transparent)`, borderRadius: 12, padding: '16px 10px', marginBottom: 18,
            }}>
              <p style={{ fontSize: 28, fontWeight: 900, color: navy, letterSpacing: 3, margin: 0, fontFamily: 'monospace' }}>
                {claimedCode}
              </p>
            </div>
            <button onClick={() => { setClaimedCode(null); setPrompt(null) }} style={{
              width: '100%', padding: 14, borderRadius: 12, border: 'none', background: gold,
              color: 'var(--ui-primary-text)', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              확인
            </button>
            <p style={{ fontSize: 11, color: 'var(--ui-text-3)', margin: '14px 0 0' }}>
              이 코드는 "쿠폰함"에서 언제든 다시 볼 수 있어요
            </p>
          </>
        ) : prompt && (
          <>
            <p style={{ fontSize: 44, margin: '0 0 10px' }}>🔥</p>
            <p style={{ fontSize: 19, fontWeight: 900, color: navyDk, margin: '0 0 6px' }}>
              {prompt.milestone}일 연속 숙제 이행률 100%!
            </p>
            <p style={{ fontSize: 13, color: tx2, margin: '0 0 24px', lineHeight: 1.6 }}>
              정말 대단해요! 지금 쿠폰을 받으면 오늘부터 다시 시작하고,<br />더 큰 목표에 도전하면 지금 스트릭이 계속 이어져요.
            </p>

            <button onClick={claim} disabled={busy} style={{
              width: '100%', padding: 14, borderRadius: 12, border: 'none', background: gold,
              color: 'var(--ui-primary-text)', fontSize: 15, fontWeight: 800, cursor: busy ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', marginBottom: 10, opacity: busy ? .7 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <IconCoupon size={15} /> {prompt.milestone}일 연속 달성 쿠폰 받기
            </button>

            <button onClick={decline} disabled={busy} style={{
              width: '100%', padding: 14, borderRadius: 12, border: `1.5px solid ${navy}`, background: '#fff',
              color: navy, fontSize: 14, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', opacity: busy ? .7 : 1,
            }}>
              {prompt.nextMilestone ? `${prompt.nextMilestone}일 연속 도전하기` : '계속 도전하기'}
            </button>

            <p style={{ fontSize: 11, color: 'var(--ui-text-3)', margin: '14px 0 0' }}>
              받은 쿠폰은 "쿠폰함"에서 확인할 수 있어요
            </p>
          </>
        )}
      </div>
    </div>
  )
}
