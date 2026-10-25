'use client'
import { useState } from 'react'
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { EnrollmentPeriod } from '@/lib/enrollment-stats'
import styles from './EnrollmentStatsDashboard.module.css'

const series = [
  { key:'enrolled',label:'재원생',color:'var(--ui-primary)' },
  { key:'registrations',label:'신규 등록',color:'var(--ui-success)' },
  { key:'withdrawals',label:'퇴원',color:'var(--ui-warning)' },
] as const
const tooltip = { border:'1px solid var(--ui-border)',borderRadius:10,fontSize:12,background:'var(--ui-surface)',color:'var(--ui-text)' }

export default function EnrollmentTrendChart({ rows, baseline }: {
  rows:(EnrollmentPeriod & { label:string; chartLabel:string })[]; baseline:string
}) {
  const [visible,setVisible] = useState({ enrolled:true,registrations:true,withdrawals:true })
  const anyVisible = Object.values(visible).some(Boolean)
  const axis = { fontSize:10,stroke:'var(--ui-text-3)',tickLine:false,axisLine:false,width:32,allowDecimals:false }
  return <section className={`${styles.panel} ${styles.combined}`} aria-label="재원생 등록 퇴원 복합 그래프">
    <h2>재원생·등록·퇴원 추이</h2>
    <p className={styles.subtitle}>재원생은 {baseline} 기준, 등록·퇴원은 해당 기간 내 발생 인원입니다.</p>
    <div className={styles.chartLegend} role="group" aria-label="그래프 표시 항목">
      {series.map(item => <button key={item.key} type="button" aria-pressed={visible[item.key]} onClick={() => setVisible(previous => ({ ...previous,[item.key]:!previous[item.key] }))}>
        {item.key === 'enrolled' ? <svg width="16" height="10" aria-hidden="true"><path d="M0 5h16" stroke={item.color} strokeWidth="2" /><circle cx="8" cy="5" r="3" fill={item.color} /></svg> : <i style={{ background:item.color }} />}{item.label}
      </button>)}
    </div>
    <div className={styles.axisLabels}><span>왼쪽 · 재원생(명)</span><span>오른쪽 · 등록·퇴원(명)</span></div>
    {!rows.length ? <div className={styles.chartEmpty} role="status">아직 집계할 학생 기록이 없습니다.</div> : !anyVisible ? <div className={styles.chartEmpty} role="status">위 범례에서 표시할 항목을 선택하세요.</div> :
      <div className={styles.combinedChart}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={rows} margin={{ top:12,right:0,left:0,bottom:0 }}>
        <CartesianGrid stroke="var(--ui-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="chartLabel" fontSize={10} stroke="var(--ui-text-3)" tickLine={false} axisLine={false} minTickGap={12} />
        <YAxis {...axis} yAxisId="enrolled" domain={[0,'auto']} />
        <YAxis {...axis} yAxisId="movement" orientation="right" domain={[0,'auto']} />
        <Tooltip contentStyle={tooltip} formatter={(value,name) => [`${value}명`,name]} labelFormatter={label => rows.find(r => r.chartLabel === label)?.label ?? label} />
        <Bar yAxisId="movement" dataKey="registrations" name="신규 등록" hide={!visible.registrations} fill="var(--ui-success)" radius={[3,3,0,0]} maxBarSize={22} isAnimationActive={false} />
        <Bar yAxisId="movement" dataKey="withdrawals" name="퇴원" hide={!visible.withdrawals} fill="var(--ui-warning)" radius={[3,3,0,0]} maxBarSize={22} isAnimationActive={false} />
        <Line yAxisId="enrolled" dataKey="enrolled" name="재원생" hide={!visible.enrolled} stroke="var(--ui-primary)" strokeWidth={2.5} dot={{ r:3,strokeWidth:2,fill:'var(--ui-surface)' }} activeDot={{ r:5 }} isAnimationActive={false} />
      </ComposedChart></ResponsiveContainer></div>}
    <p className={styles.chartNote}>기간 중 등록·퇴원 변화는 다음 기간 첫날 재원생 수에 이어집니다. 진행 중인 기간은 오늘까지 집계하며, 범례를 눌러 항목을 켜고 끌 수 있습니다.</p>
  </section>
}
