'use client'
import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase'
import { computeStreak, COUPON_MILESTONES } from '@/lib/streak'

const navy='#0D2A5E', gold='#D87E13', tx='#0D1B36', tx2='#4B5C7E', tx3='#96A4BF', bd='#DDE3EE'

// 쿠폰 마일스톤(5일부터 5일 단위로 30일까지)과 동일한 기준으로 뱃지를 보여준다
const STREAK_TIERS = COUPON_MILESTONES

type StatRec = { date: string; hw_rate: number; hw_cor: number }

function rateColor(v: number) { return v >= 80 ? '#1A7F4E' : v >= 60 ? '#C05621' : '#C0392B' }

// 학부모/학생 화면이 공유하는 수업기록 통계 뷰 — 숙제 이행률/정답률 추이 그래프와
// 연속 100% 이행률 스트릭·뱃지를 보여준다. 이미 화면에서 불러온 records 배열을
// 그대로 재사용하므로 별도 쿼리를 하지 않는다.
// studentId를 주면 "현재 스트릭"은 쿠폰 시스템과 동일하게 마지막 쿠폰 수령일 이후
// 기록만으로 계산한다(쿠폰을 받으면 그 순간부터 다시 센다) — "최고 기록"은 쿠폰 여부와
// 무관하게 전체 기록 기준 역대 최장 기록을 그대로 보여준다.
export default function HomeworkStatsView({ recs, studentId }: { recs: StatRec[]; studentId?: number }) {
  const [lastClaimedDate, setLastClaimedDate] = useState<string | null>(null)

  useEffect(() => {
    if (!studentId) return
    supabase.from('student_streak_state').select('last_claimed_date').eq('student_id', studentId).maybeSingle()
      .then(({ data }) => setLastClaimedDate(data?.last_claimed_date ?? null))
  }, [studentId])

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

  return (
    <div>
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

      {/* 스트릭 + 뱃지 */}
      <div style={{
        background: `linear-gradient(135deg,${navy} 0%,#0D2A5E 100%)`, borderRadius: 14,
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
                <span style={{ fontSize: 22 }}>{unlocked ? '🏅' : '⚪'}</span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,.85)' }}>{tier}일</span>
              </div>
            )
          })}
        </div>
        {best > 0 && <p style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', margin: '10px 0 0' }}>최고 기록: {best}일 연속</p>}
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
                <Tooltip formatter={(v: any) => v + '%'} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${bd}` }} />
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
                <Tooltip formatter={(v: any) => v + '%'} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${bd}` }} />
                <Line type="monotone" dataKey="hwCor" stroke={gold} strokeWidth={2.5} dot={{ r: 4, fill: gold }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
