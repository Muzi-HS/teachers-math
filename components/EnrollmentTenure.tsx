'use client'
import { useId, useState } from 'react'
import styles from './EnrollmentTenure.module.css'

export type TenureSnapshot = {
  asOf:string; total:number; eligible:number; unknownDates:number;
  milestones:{ months:number; count:number; percent:number | null }[]
}

export default function EnrollmentTenure({ current, periods, initialDate = 'current' }: {
  current:TenureSnapshot; periods:{ label:string; snapshot:TenureSnapshot }[]; initialDate?:string
}) {
  const id = useId()
  const [date,setDate] = useState(initialDate)
  const snapshot = date === 'current' ? current : periods.find(p => p.snapshot.asOf === date)?.snapshot ?? current
  return <section className={styles.panel} aria-labelledby={id}>
    <div className={styles.header}>
      <div><h2 id={id}>재원 기간별 학생 수</h2><p>얼마나 오래 다니고 있는지 확인하세요.</p></div>
      <label className={styles.picker}>기준일
        <select aria-label="재원 기간 집계 기준일" value={date} onChange={e => setDate(e.target.value)}>
          <option value="current">현재 · {current.asOf}</option>
          {periods.map(p => <option key={p.snapshot.asOf} value={p.snapshot.asOf}>{p.label} · {p.snapshot.asOf}</option>)}
        </select>
      </label>
    </div>
    <div className={styles.baseline}>
      <span>{snapshot.asOf} 재원 <strong>{snapshot.total}명</strong></span>
      <span>등록일 확인 <strong>{snapshot.eligible}명</strong> 기준 비율</span>
    </div>
    <div className={styles.grid}>
      {snapshot.milestones.map(item => <div key={item.months} className={styles.card}>
        <h3>{item.months === 12 ? '1년' : `${item.months}개월`} 이상</h3>
        <div className={styles.values}><p><strong>{item.count.toLocaleString()}</strong><span>명</span></p><span className={styles.percent}>{item.percent === null ? '—' : `${item.percent.toFixed(1)}%`}</span></div>
        <div className={styles.track} aria-hidden="true"><div style={{ width:`${Math.min(100,Math.max(0,item.percent ?? 0))}%` }} /></div>
      </div>)}
    </div>
    <p className={styles.note}>각 기준은 중복 포함됩니다. 예를 들어 1년 이상 재원생은 1·3·6개월 이상에도 포함됩니다. 등록일로부터 달력상 해당 개월이 지난 학생을 집계합니다.</p>
    {snapshot.unknownDates > 0 && <p className={styles.notice}>등록일 미입력 {snapshot.unknownDates}명은 비율 계산에서 제외했습니다.</p>}
    {snapshot.eligible === 0 && <p className={styles.notice}>등록일이 확인된 재원생이 없어 비율을 계산할 수 없습니다.</p>}
  </section>
}
