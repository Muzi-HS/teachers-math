'use client'
import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase'
import { computeStreak, COUPON_MILESTONES } from '@/lib/streak'
import GrowthIllustration from '@/components/streak-preview/GrowthIllustration'

const navy='var(--ui-primary)', tx='var(--ui-text)', tx3='var(--ui-text-3)', bd='var(--ui-border)'

// 쿠폰 마일스톤(5일부터 5일 단위로 30일까지)과 동일한 기준으로 뱃지를 보여준다
const STREAK_TIERS = COUPON_MILESTONES

type StatRec = { date: string; hw_rate: number; hw_cor: number }

function rateColor(v: number) { return v >= 80 ? 'var(--ui-success)' : v >= 60 ? 'var(--ui-warning)' : 'var(--ui-danger)' }

// 학부모/학생 화면이 공유하는 수업기록 통계 뷰 — 숙제 이행률/정답률 추이 그래프와
// 연속 100% 이행률 스트릭·뱃지를 보여준다. 이미 화면에서 불러온 records 배열을
// 그대로 재사용하므로 별도 쿼리를 하지 않는다.
// studentId를 주면 "현재 스트릭"은 쿠폰 시스템과 동일하게 마지막 쿠폰 수령일 이후
// 기록만으로 계산한다(쿠폰을 받으면 그 순간부터 다시 센다) — "최고 기록"은 쿠폰 여부와
// 무관하게 전체 기록 기준 역대 최장 기록을 그대로 보여준다.
// showMilestone: 5/10/15/20/25/30일 성장(스트릭) 마일스톤 카드 노출 여부 — 이 마일스톤은
// 학생 전용 동기부여/쿠폰 시스템과 연결돼 있어 학부모 화면에서는 숨긴다(평균 지표·그래프는 유지).
export default function HomeworkStatsView({ recs, studentId, sessionToken, showMilestone = true, growthOnly = false }: { recs: StatRec[]; studentId?: number; sessionToken?: string; showMilestone?: boolean; growthOnly?: boolean }) {
  const [lastClaimedDate, setLastClaimedDate] = useState<string | null>(null)

  useEffect(() => {
    if (!studentId) return
    if (sessionToken) {
      let active = true
      supabase.rpc('client_streak_progress', { p_token: sessionToken })
        .then(({ data }) => { if (active) setLastClaimedDate((data as { lastClaimedDate: string | null } | null)?.lastClaimedDate ?? null) })
      return () => { active = false }
    }
    supabase.from('student_streak_state').select('last_claimed_date').eq('student_id', studentId).maybeSingle()
      .then(({ data }) => setLastClaimedDate(data?.last_claimed_date ?? null))
  }, [studentId, sessionToken])

  // recs는 최신순(date desc)으로 넘어온다 — 그래프/스트릭은 시간순으로 계산해야 하므로 뒤집는다
  const chrono = [...recs].reverse()
  const chartData = chrono.map(r => ({
    date: r.date.slice(5),
    hwRate: r.hw_rate >= 0 ? r.hw_rate : null,
    hwCor: r.hw_cor >= 0 ? r.hw_cor : null,
  }))

  const hwRecs = recs.filter(r => r.hw_rate >= 0)
  const avgHwRate = hwRecs.length ? Math.round(hwRecs.reduce((a, b) => a + b.hw_rate, 0) / hwRecs.length) : null
  const corRecs = recs.filter(r => r.hw_cor >= 0)
  const avgHwCor = corRecs.length ? Math.round(corRecs.reduce((a, b) => a + b.hw_cor, 0) / corRecs.length) : null

  const { best } = computeStreak(chrono)
  const scopedChrono = lastClaimedDate ? chrono.filter(r => r.date > lastClaimedDate) : chrono
  const { current } = computeStreak(scopedChrono)
  const currentClamped = Math.min(current, 30)
  const stage = Math.max(0, STREAK_TIERS.filter(t => t <= current).length - 1)
  const nextTier = STREAK_TIERS.find(t => t > current)

  return (
    <div>
      <style>{`.hw-stats-growth-tree svg { width: 100%; height: 100%; display: block; }`}</style>

      {/* 학습 성장 — 새 학생 시안(streak-preview)의 성장 단계 카드를 그대로 사용한다 */}
      {showMilestone && <div style={{ textAlign: 'center', border: '1px solid #E0E9DE', borderRadius: 16, padding: '22px 16px 16px', background: '#fff', marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 500, margin: '0 0 24px', color: '#557660' }}>꾸준히 쌓이는 나의 성장</h3>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: '8.333%', right: '8.333%', top: 4, height: 2, background: '#E1E8DF' }}>
            <span style={{ display: 'block', height: '100%', background: '#41835B', width: `${Math.max(0, currentClamped - 5) / 25 * 100}%` }} />
          </div>
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', position: 'relative' }}>
            {STREAK_TIERS.map(tier => {
              const isCurrentTier = tier === STREAK_TIERS[stage] && current >= 5
              return (
                <li key={tier} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, fontSize: 10,
                  color: isCurrentTier ? '#28633E' : '#7F9080', fontWeight: isCurrentTier ? 700 : 400,
                }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: tier <= currentClamped ? '#41835B' : '#E1E8DF',
                    border: `1px solid ${tier <= currentClamped ? '#41835B' : '#CDDACD'}`,
                    outline: isCurrentTier ? '4px solid #E8F1E7' : 'none',
                  }} />
                  {tier}일
                </li>
              )
            })}
          </ol>
        </div>
        <div className="hw-stats-growth-tree" style={{ width: 170, height: 170, margin: '26px auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <GrowthIllustration kind="tree" stage={stage} current />
        </div>
        <strong style={{ fontSize: 24, letterSpacing: -.7, display: 'block' }}>{current}일 연속 달성</strong>
        <p style={{ fontSize: 12, color: '#7A8B79', margin: '9px 0 23px' }}>꾸준한 습관이 자라고 있어요.</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #EDF2E9', paddingTop: 16, fontSize: 11, color: '#6E826D' }}>
          <span>최고 기록 <b style={{ color: '#2A663E', marginLeft: 6 }}>{best}일</b></span>
          <span>{nextTier ? <>다음 성장까지 <b style={{ color: '#2A663E', marginLeft: 6 }}>{nextTier - current}일</b></> : '30일 목표 달성'}</span>
        </div>
      </div>}

      {!growthOnly && <>
      {/* 평균 지표 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: '12px 14px' }}>
          <p style={{ fontSize: 11, color: tx3, margin: '0 0 6px' }}>숙제 이행률 평균</p>
          <p style={{ fontSize: 22, fontWeight: 700, color: avgHwRate != null ? rateColor(avgHwRate) : tx3, margin: 0 }}>
            {avgHwRate != null ? avgHwRate + '%' : '-'}
          </p>
        </div>
        <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: '12px 14px' }}>
          <p style={{ fontSize: 11, color: tx3, margin: '0 0 6px' }}>숙제 정답률 평균</p>
          <p style={{ fontSize: 22, fontWeight: 700, color: avgHwCor != null ? rateColor(avgHwCor) : tx3, margin: 0 }}>
            {avgHwCor != null ? avgHwCor + '%' : '-'}
          </p>
        </div>
      </div>

      {/* 꺾은선 그래프 */}
      {chartData.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: '40px 0', textAlign: 'center', color: tx3, fontSize: 13 }}>
          아직 통계를 볼 수 있는 기록이 없습니다
        </div>
      ) : (
        <>
          <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: 18, marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: tx, marginBottom: 12 }}>숙제 이행률 추이</div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={bd} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: tx3 }} axisLine={{ stroke: bd }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: tx3 }} axisLine={{ stroke: bd }} />
                <Tooltip formatter={(v: unknown) => `${v}%`} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${bd}` }} />
                <Line type="monotone" dataKey="hwRate" stroke={navy} strokeWidth={2.5} dot={{ r: 4, fill: navy }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: 18, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: tx, marginBottom: 12 }}>숙제 정답률 추이</div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={bd} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: tx3 }} axisLine={{ stroke: bd }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: tx3 }} axisLine={{ stroke: bd }} />
                <Tooltip formatter={(v: unknown) => `${v}%`} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${bd}` }} />
                <Line type="monotone" dataKey="hwCor" stroke="var(--ui-chart-2)" strokeWidth={2.5} dot={{ r: 4, fill: "var(--ui-chart-2)" }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
      </>}
    </div>
  )
}
