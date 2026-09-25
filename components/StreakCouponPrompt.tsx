'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { type StreakRec } from '@/lib/streak'
import { IconCoupon } from '@/components/icons'

const navy = 'var(--ui-primary)', navyDk = 'var(--ui-primary)', gold = 'var(--ui-primary)'
const tx2 = 'var(--ui-text-2)'

// 숙제 이행률 100% 연속 달성 마일스톤(5/10/15/20/25/30일)에 새로 도달했을 때 한 번만
// "쿠폰 받기 vs 다음 목표 도전" 선택지를 보여준다.
//
// 연속일수 계산과 쿠폰 발급/코드 생성은 전부 서버(DB 함수)에서 한다 — 클라이언트가
// "30일 연속 달성했다"고 주장하는 값을 그대로 믿고 쿠폰을 내주지 않도록, 본인 세션
// 토큰으로 서버가 본인 기록에서 직접 다시 계산한 결과만 인정한다. chronoRecs는 값 자체는
// 더 이상 쓰지 않고, 수업기록을 새로 불러올 때마다 다시 확인하기 위한 트리거로만 쓴다.
export default function StreakCouponPrompt({ studentId, sessionToken, chronoRecs }: { studentId: number; sessionToken: string | undefined; chronoRecs: StreakRec[] }) {
  const [prompt, setPrompt] = useState<{ milestone: number; nextMilestone: number | null; streakValue: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [claimedCode, setClaimedCode] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionToken) return
    let cancelled = false
    async function check() {
      const { data } = await supabase.rpc('client_streak_status', { p_token: sessionToken })
      const status = data as { milestone: number; nextMilestone: number | null; streakValue: number } | null
      if (status && !cancelled) setPrompt(status)
    }
    check()
    return () => { cancelled = true }
  }, [studentId, sessionToken, chronoRecs])

  async function claim() {
    if (!prompt || !sessionToken) return
    setBusy(true)
    const { data, error } = await supabase.rpc('client_claim_streak_coupon', { p_token: sessionToken })
    setBusy(false)
    if (error || !data) return
    setClaimedCode((data as { code: string }).code)
  }

  async function decline() {
    if (!prompt || !sessionToken) return
    setBusy(true)
    await supabase.rpc('client_decline_streak_milestone', { p_token: sessionToken, p_milestone: prompt.milestone })
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
              이 코드는 &quot;쿠폰함&quot;에서 언제든 다시 볼 수 있어요
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
              받은 쿠폰은 &quot;쿠폰함&quot;에서 확인할 수 있어요
            </p>
          </>
        )}
      </div>
    </div>
  )
}
