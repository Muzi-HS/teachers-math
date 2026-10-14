import { studyClock } from '@/lib/study'
import styles from '../Study.module.css'
import s from './GiantsPreview.module.css'

export default function GiantsRingDial({ seconds, totalSeconds, stopwatch = false, paused = false, resting = false, label }: { seconds: number; totalSeconds: number; stopwatch?: boolean; paused?: boolean; resting?: boolean; label: string }) {
  const ratio = stopwatch ? (seconds % 3600) / 3600 : Math.min(1, Math.max(0, seconds / Math.max(1, totalSeconds)))
  const circumference = 2 * Math.PI * 146
  return <div className={styles.dialWrap}>
    <p className={styles.dialStatus}>{label}{paused ? ' · 일시정지' : ''}</p>
    <div className={s.ringDial}>
      <svg viewBox="0 0 340 340" aria-hidden="true">
        <circle cx="170" cy="170" r="146" fill="none" stroke="#08274412" strokeWidth="10" />
        <circle cx="170" cy="170" r="130" fill="none" stroke="#0827440d" strokeWidth="1" />
        <circle cx="170" cy="170" r="146" fill="none" stroke={resting ? '#62AEDD' : '#CE1237'} strokeWidth="10" strokeLinecap={ratio > 0 ? 'round' : 'butt'} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - ratio)} transform="rotate(-90 170 170)" className={s.ringProgress} />
      </svg>
      <div className={s.ringCenter}><span className={s.timerEmblem} role="img" aria-label="롯데 자이언츠 원형 엠블럼" /></div>
    </div>
    <p className={s.ringCaption}>{paused ? 'PAUSED' : resting ? 'TAKE A BREAK' : 'FOCUS TIME'}</p>
    <div className={`${styles.dialReadout} ${s.ringReadout}`}><strong role="timer" aria-label={stopwatch ? '공부한 시간' : '남은 시간'}>{studyClock(seconds)}</strong></div>
  </div>
}
