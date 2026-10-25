'use client'
import EnrollmentTrendChart from './EnrollmentTrendChart'
import EnrollmentTenure from './EnrollmentTenure'
import type { EnrollmentGrain, EnrollmentSummary } from '@/lib/enrollment-stats'
import styles from './EnrollmentStatsDashboard.module.css'

const signed = (value:number) => `${value > 0 ? '+' : ''}${value.toLocaleString()}`
const periodLabel = (date:string,grain:EnrollmentGrain) => grain === 'month' ? `${date.slice(0,4)}.${date.slice(5,7)}` : grain === 'quarter' ? `${date.slice(0,4)}년 ${Math.ceil(Number(date.slice(5,7))/3)}분기` : `${date.slice(0,4)}년`

export default function EnrollmentStatsDashboard({ summary, grain, loading, error, onGrainChange, onRefresh, onDownload, exporting = false, exportMessage }: {
  summary:EnrollmentSummary | null; grain:EnrollmentGrain; loading:boolean; error:string;
  onGrainChange:(grain:EnrollmentGrain) => void; onRefresh:() => void
  onDownload?:() => void; exporting?:boolean; exportMessage?:{ text:string; ok:boolean } | null
}) {
  const rows = summary?.rows.map(row => ({ ...row,label:periodLabel(row.start,grain),chartLabel:grain === 'year' ? row.start.slice(0,4) : grain === 'quarter' ? `${row.start.slice(2,4)}.${Math.ceil(Number(row.start.slice(5,7))/3)}Q` : `${row.start.slice(2,4)}.${row.start.slice(5,7)}`,net:row.registrations-row.withdrawals })) ?? []
  const totals = rows.reduce((a,r) => ({ registrations:a.registrations+r.registrations,withdrawals:a.withdrawals+r.withdrawals,early:a.early+r.earlyWithdrawals }), { registrations:0,withdrawals:0,early:0 })
  const net = totals.registrations-totals.withdrawals
  const baseline = grain === 'month' ? '매월 1일' : grain === 'quarter' ? '각 분기 첫날' : '1월 1일'
  const unit = grain === 'month' ? '개월' : grain === 'quarter' ? '분기' : '년'
  const range = summary?.rangeStart ? `${summary.rangeStart} ~ ${summary.rangeEnd}` : loading ? '조회 기간을 불러오는 중…' : '집계할 데이터가 없습니다'
  return <section className={styles.root} aria-label="학생 인원 추이">
    <div className={styles.toolbar}>
      <div className={styles.periodLabel}><h2>최근 12{unit}</h2><span>{range}</span></div>
      <div className={styles.toolbarRight}>
        <div className={styles.segments} role="group" aria-label="집계 단위">{([['month','월별'],['quarter','분기별'],['year','연도별']] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={grain === value} onClick={() => onGrainChange(value)}>{label}</button>)}</div>
        <button type="button" className={styles.iconButton} aria-label="통계 새로고침" disabled={loading} onClick={onRefresh}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3" /></svg></button>
        {onDownload && <button type="button" className={styles.exportButton} disabled={loading || !summary || !!error || exporting} aria-busy={exporting} onClick={onDownload} title="전체 기간의 월별·분기별·연도별 통계 다운로드">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5" /></svg>{exporting ? '다운로드 준비 중…' : '엑셀 다운로드'}
        </button>}
      </div>
    </div>
    {exportMessage && <p className={styles.exportMessage} role={exportMessage.ok ? 'status' : 'alert'} style={{ color:exportMessage.ok ? 'var(--ui-success)' : 'var(--ui-danger)' }}>{exportMessage.text}</p>}
    {loading ? <div role="status" className={styles.status}>학생 현황을 불러오는 중입니다…</div> : error ? <div role="alert" className={styles.status}><p>{error}</p><button onClick={onRefresh}>다시 시도</button></div> : summary && <>
      <div className={styles.periodLabel}><h2>학생 현황</h2><span>{rows.length < 12 ? `확인 가능한 ${rows.length}${unit} 표시 · ` : ''}조회 기간 내 등록·퇴원 누계</span></div>
      <div className={styles.summary}>
        <article className={`${styles.metric} ${styles.current}`}><h3>현재 재원생</h3><div className={styles.metricValue}><strong>{summary.currentEnrolled.toLocaleString()}</strong><span>명</span></div><p>{summary.today} 기준 · 테스트 제외</p></article>
        {[
          { label:'신규 등록',value:totals.registrations,note:'조회 기간 내 등록일 기준',tone:'' },
          { label:'퇴원',value:totals.withdrawals,note:'조회 기간 내 퇴원일 기준',tone:'' },
          { label:'순증감',value:net,note:'신규 등록 − 퇴원',tone:net > 0 ? styles.positive : net < 0 ? styles.negative : '' },
          { label:'30일 이내 퇴원',value:totals.early,note:'등록 후 30일 이내',tone:'' },
        ].map(item => <article key={item.label} className={styles.metric}><h3>{item.label}</h3><div className={`${styles.metricValue} ${item.tone}`}><strong>{item.label === '순증감' ? signed(item.value) : item.value.toLocaleString()}</strong><span>명</span></div><p>{item.note}</p></article>)}
      </div>
      <p className={styles.caution}>퇴원 기록은 {summary.trackingStartedOn}부터 수집합니다. 이전에 삭제된 학생은 과거 통계에 포함되지 않습니다.</p>
      <EnrollmentTrendChart rows={rows} baseline={baseline} />
      <EnrollmentTenure key={grain} current={summary.tenure} periods={rows.map(row => ({ label:row.label,snapshot:row.tenure }))} />
      <section className={styles.panel} aria-label="기간별 상세 표"><h2>기간별 상세</h2><p className={styles.subtitle}>첫날 재원은 {baseline} 기준 · 단위: 명</p><p className={styles.tableHint}>표를 좌우로 밀어 모든 항목을 확인하세요.</p>
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th scope="col">기간</th><th scope="col">첫날 재원</th><th scope="col">신규</th><th scope="col">퇴원</th><th scope="col">순증감</th><th scope="col">30일 이내 퇴원</th></tr></thead><tbody>{rows.map(row => <tr key={row.start} className={row.start <= summary.today && row.end > summary.today ? styles.inProgress : undefined}><th scope="row">{row.label}</th><td>{row.enrolled}</td><td>{row.registrations}</td><td>{row.withdrawals}</td><td className={row.net > 0 ? styles.positive : row.net < 0 ? styles.negative : undefined}>{signed(row.net)}</td><td>{row.earlyWithdrawals}</td></tr>)}</tbody></table></div>
      </section>
      <details className={styles.rules}><summary>집계 기준과 데이터 범위</summary><ul>
        <li>현재 진행 중인 기간을 포함해 최대 최근 12{unit}을 표시합니다. 데이터 시작 전 기간은 표시하지 않고 중간에 등록·퇴원이 없는 기간은 유지합니다.</li>
        <li>재원생은 기간 첫날 기준입니다. 해당일 등록자는 포함하고 해당일 퇴원자는 제외합니다.</li>
        <li>현재 재원생은 {summary.today}의 현황입니다.</li>
        <li>테스트 학생은 모든 집계에서 제외하며 재등록은 별도로 구분하지 않습니다.</li>
        <li>30일 이내 퇴원은 등록일부터 퇴원일까지 0~30일인 학생을 퇴원일 기준으로 셉니다.</li>
        <li>퇴원 기록 수집 시작일: {summary.trackingStartedOn}. 이전 삭제 이력은 복원되지 않습니다.</li>
        {summary.unknownDates > 0 && <li>등록일 미입력 {summary.unknownDates}명은 날짜별 집계에서 제외됩니다.</li>}
      </ul></details>
    </>}
  </section>
}
