'use client'
import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Bar } from 'recharts'
import { supabase } from '@/lib/supabase'
import { EMPTY_ANALYTICS, type AnalyticsSummary } from '@/lib/analytics'
import { useMobileMode } from '@/context/MobileModeContext'
import { IconUsers, IconChat, IconClock } from '@/components/icons'

const navy = 'var(--ui-primary)'
// --ui-accent는 테마에 따라 --ui-primary와 같은 계열(둘 다 초록 또는 둘 다 파랑)이라
// 막대·선 구분이 잘 안 보여서, 테마와 무관하게 항상 대비되는 보라 계열(--ui-info)을 쓴다.
const accent = 'var(--ui-info)'
const bd = 'var(--ui-border)'
const tx = 'var(--ui-text)', tx2 = 'var(--ui-text-2)', tx3 = 'var(--ui-text-3)'


function StatCard({ label, value, unit, icon }: { label: string; value: string | number; unit?: string; icon?: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
      <p style={{ fontSize: 11, color: tx3, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 5 }}>{icon}{label}</p>
      <p style={{ fontSize: 24, fontWeight: 700, color: navy, margin: 0 }}>
        {value}<span style={{ fontSize: 13, fontWeight: 400, color: tx2 }}>{unit}</span>
      </p>
    </div>
  )
}

export default function AnalyticsPage() {
  const { mobileMode } = useMobileMode()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [summary, setSummary] = useState<AnalyticsSummary>(EMPTY_ANALYTICS)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data, error } = await supabase.rpc('admin_analytics_summary')
        if (cancelled) return
        if (error || !data) { setLoadError(true); return }
        setSummary(data as AnalyticsSummary)
      } catch {
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const { totalVisits, todayCount, monthCount, consultThisMonth, consultTotal,
    mobilePct, unreadInquiries, pendingTeachers, dailyChartData, monthlyChartData } = summary

  return (
    <div style={{ padding: mobileMode ? '16px 14px 88px' : '28px 32px', fontFamily: "'Noto Sans KR',sans-serif" }}>
      <div style={{ marginBottom: mobileMode ? 14 : 20 }}>
        <h1 style={{ fontSize: mobileMode ? 17 : 21, fontWeight: 700, color: tx }}>접속 분석</h1>
        <p style={{ fontSize: 13, color: tx2, marginTop: 4, lineHeight: 1.6 }}>
          <strong style={{ color: tx }}>메인 홈페이지(로그인 전 첫 화면, 히어로)</strong>에 외부 방문자가 얼마나 접속하는지 보여줍니다.
          로그인 후의 대시보드·수업기록 등 내부 화면 이용은 집계하지 않습니다.
        </p>
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: tx3, textAlign: 'center', padding: '40px 0' }}>불러오는 중...</p>
      ) : loadError ? (
        <p role="alert" style={{ fontSize: 13, color: 'var(--ui-danger)', textAlign: 'center', padding: '40px 0' }}>
          통계를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.
        </p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: mobileMode ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
            <StatCard label="오늘 방문" value={todayCount} unit="회" icon={<IconUsers size={11} />} />
            <StatCard label="이번 달 방문" value={monthCount} unit="회" icon={<IconUsers size={11} />} />
            <StatCard label="모바일 접속 비율" value={mobilePct} unit="%" icon={<IconUsers size={11} />} />
            <StatCard label="상담 신청 (이번 달)" value={consultThisMonth} unit="건" icon={<IconChat size={11} />} />
            <StatCard label="상담 신청 (최근 1년)" value={consultTotal} unit="건" icon={<IconChat size={11} />} />
            <StatCard label="미확인 문의" value={unreadInquiries} unit="건" icon={<IconChat size={11} />} />
          </div>

          {pendingTeachers > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--ui-warning-bg)', border: '1px solid var(--ui-warning)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: 'var(--ui-warning)', fontWeight: 600 }}>
              <IconClock size={13} /> 승인 대기 중인 선생님 계정이 {pendingTeachers}명 있습니다
            </div>
          )}

          <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: 18, marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: tx, marginBottom: 4 }}>최근 12개월 방문량 · 상담 신청량</div>
            <p style={{ fontSize: 11.5, color: tx3, margin: '0 0 12px' }}>월별 홈페이지 방문 수(막대)와 상담 신청 수(선)를 함께 볼 수 있습니다</p>
            {totalVisits === 0 && consultTotal === 0 ? (
              <p style={{ fontSize: 13, color: tx3, textAlign: 'center', padding: '30px 0' }}>아직 기록된 데이터가 없습니다</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={monthlyChartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={bd} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: tx3 }} axisLine={{ stroke: bd }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: tx3 }} axisLine={{ stroke: bd }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${bd}` }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v: string) => v === 'visits' ? '방문' : '상담 신청'} />
                  <Bar dataKey="visits" name="visits" fill={navy} radius={[4, 4, 0, 0]} barSize={16} />
                  <Line type="monotone" dataKey="consults" name="consults" stroke={accent} strokeWidth={2.5} dot={{ r: 3, fill: accent }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: 18, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: tx, marginBottom: 12 }}>최근 14일 방문 추이</div>
            {totalVisits === 0 ? (
              <p style={{ fontSize: 13, color: tx3, textAlign: 'center', padding: '30px 0' }}>아직 기록된 방문이 없습니다</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={dailyChartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={bd} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: tx3 }} axisLine={{ stroke: bd }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: tx3 }} axisLine={{ stroke: bd }} />
                  <Tooltip formatter={(v: unknown) => `${v}회`} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${bd}` }} />
                  <Line type="monotone" dataKey="count" stroke={navy} strokeWidth={2.5} dot={{ r: 3, fill: navy }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
    </div>
  )
}
