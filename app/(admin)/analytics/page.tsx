'use client'
import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase'
import { kstDateStr, kstDateOf } from '@/lib/kst'
import { useMobileMode } from '@/context/MobileModeContext'
import { IconUsers, IconChat, IconClock } from '@/components/icons'

const navy = 'var(--ui-primary)'
const bd = 'var(--ui-border)'
const tx = 'var(--ui-text)', tx2 = 'var(--ui-text-2)', tx3 = 'var(--ui-text-3)'

type Visit = { visited_at: string; is_mobile: boolean | null }

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
  const [visits, setVisits] = useState<Visit[]>([])
  const [consultTotal, setConsultTotal] = useState(0)
  const [consultThisMonth, setConsultThisMonth] = useState(0)
  const [unreadInquiries, setUnreadInquiries] = useState(0)
  const [pendingTeachers, setPendingTeachers] = useState(0)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setLoadError(false)
    const today = kstDateStr()
    const monthPrefix = today.slice(0, 7) // YYYY-MM
    const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString() // 최근 60일

    const [visitsRes, consultRes, inqRes, teacherRes] = await Promise.all([
      supabase.from('site_visits').select('visited_at, is_mobile').gte('visited_at', since),
      supabase.from('consultation_requests').select('created_at'),
      supabase.from('inquiry_messages').select('id', { count: 'exact', head: true }).eq('sender_type', 'parent').eq('is_read', false),
      supabase.from('teachers').select('id', { count: 'exact', head: true }).eq('approved', false),
    ])

    if (visitsRes.error) { setLoadError(true); setLoading(false); return }

    setVisits((visitsRes.data ?? []) as Visit[])
    const consultRows = consultRes.data ?? []
    setConsultTotal(consultRows.length)
    setConsultThisMonth(consultRows.filter((r: { created_at: string }) => kstDateOf(r.created_at).startsWith(monthPrefix)).length)
    setUnreadInquiries(inqRes.count ?? 0)
    setPendingTeachers(teacherRes.count ?? 0)
    setLoading(false)
  }

  const today = kstDateStr()
  const monthPrefix = today.slice(0, 7)

  const todayCount = visits.filter(v => kstDateOf(v.visited_at) === today).length
  const monthCount = visits.filter(v => kstDateOf(v.visited_at).startsWith(monthPrefix)).length
  const mobileCount = visits.filter(v => v.is_mobile).length
  const mobilePct = visits.length ? Math.round((mobileCount / visits.length) * 100) : 0

  // 최근 14일 일별 방문 추이
  const dayBuckets: Record<string, number> = {}
  for (let i = 13; i >= 0; i--) {
    const d = kstDateOf(new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString())
    dayBuckets[d] = 0
  }
  for (const v of visits) {
    const d = kstDateOf(v.visited_at)
    if (d in dayBuckets) dayBuckets[d]++
  }
  const chartData = Object.entries(dayBuckets).map(([date, count]) => ({ date: date.slice(5), count }))

  return (
    <div style={{ padding: mobileMode ? '16px 14px 88px' : '28px 32px', fontFamily: "'Noto Sans KR',sans-serif" }}>
      <div style={{ marginBottom: mobileMode ? 14 : 20 }}>
        <h1 style={{ fontSize: mobileMode ? 17 : 21, fontWeight: 700, color: tx }}>접속 분석</h1>
        <p style={{ fontSize: 13, color: tx2, marginTop: 4 }}>홈페이지 방문량과 주요 지표를 확인합니다</p>
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: tx3, textAlign: 'center', padding: '40px 0' }}>불러오는 중...</p>
      ) : loadError ? (
        <p role="alert" style={{ fontSize: 13, color: 'var(--ui-danger)', textAlign: 'center', padding: '40px 0' }}>
          데이터를 불러오지 못했습니다. site_visits_migration.sql이 실행됐는지 확인해주세요.
        </p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: mobileMode ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
            <StatCard label="오늘 방문" value={todayCount} unit="회" icon={<IconUsers size={11} />} />
            <StatCard label="이번 달 방문" value={monthCount} unit="회" icon={<IconUsers size={11} />} />
            <StatCard label="모바일 접속 비율" value={mobilePct} unit="%" icon={<IconUsers size={11} />} />
            <StatCard label="상담 신청 (이번 달)" value={consultThisMonth} unit="건" icon={<IconChat size={11} />} />
            <StatCard label="상담 신청 (전체)" value={consultTotal} unit="건" icon={<IconChat size={11} />} />
            <StatCard label="미확인 문의" value={unreadInquiries} unit="건" icon={<IconChat size={11} />} />
          </div>

          {pendingTeachers > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--ui-warning-bg)', border: '1px solid var(--ui-warning)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: 'var(--ui-warning)', fontWeight: 600 }}>
              <IconClock size={13} /> 승인 대기 중인 선생님 계정이 {pendingTeachers}명 있습니다
            </div>
          )}

          <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: 18, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: tx, marginBottom: 12 }}>최근 14일 방문 추이</div>
            {visits.length === 0 ? (
              <p style={{ fontSize: 13, color: tx3, textAlign: 'center', padding: '30px 0' }}>아직 기록된 방문이 없습니다</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={bd} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: tx3 }} axisLine={{ stroke: bd }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: tx3 }} axisLine={{ stroke: bd }} />
                  <Tooltip formatter={(v: any) => v + '회'} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${bd}` }} />
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
