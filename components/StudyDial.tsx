import { useId } from 'react'
import { studyClock } from '@/lib/study'
import styles from './Study.module.css'

export default function StudyDial({ seconds, stopwatch = false, paused = false, label = '집중을 준비해요' }: { seconds: number; stopwatch?: boolean; paused?: boolean; label?: string }) {
 const id = useId()
 const fraction = stopwatch ? (seconds % 3600) / 3600 : Math.min(1, Math.max(0, seconds / 3600))
 const angle = fraction * Math.PI * 2
 const x = 200 + 132 * Math.sin(angle), y = 200 - 132 * Math.cos(angle)
 return <div className={styles.dialWrap}>
  <p className={styles.dialStatus}>{label}{paused ? ' · 일시정지' : ''}</p>
   <svg width="400" height="400" viewBox="0 0 400 400" style={{ display: 'block', width: '100%', height: 'auto', aspectRatio: '1 / 1' }} className={styles.dialFace} aria-hidden="true">
    <defs><radialGradient id={`${id}-face`}><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#f6f9f5" /></radialGradient><radialGradient id={`${id}-knob`}><stop offset="0" stopColor="#f2f7ef" /><stop offset="1" stopColor="#d4e2d1" /></radialGradient></defs>
    <circle cx="200" cy="200" r="187" fill={`url(#${id}-face)`} stroke="#dde8df" strokeWidth="2" />
    <circle cx="200" cy="200" r="179" fill="none" stroke="#edf2eb" />
    {fraction >= 1 ? <circle cx="200" cy="200" r="132" fill="#37694c" /> : fraction > 0 ? <path d={`M200 200 L200 68 A132 132 0 ${fraction > .5 ? 1 : 0} 1 ${x} ${y} Z`} fill={stopwatch ? '#6a9268' : '#37694c'} /> : null}
    {fraction > 0 && fraction < 1 && <line x1="200" y1="200" x2={x} y2={y} stroke="#abc7a7" strokeWidth="3" strokeLinecap="round" />}
    {Array.from({length:60},(_,i)=>{
     const a=i*Math.PI/30, inner=i%5===0?158:165
     return <line key={i} x1={200+inner*Math.sin(a)} y1={200-inner*Math.cos(a)} x2={200+173*Math.sin(a)} y2={200-173*Math.cos(a)} stroke="#658274" strokeWidth={i%5===0?1.6:.8} />
    })}
    {Array.from({length:12},(_,i)=>{const a=i*Math.PI/6;return <text key={i} x={200+146*Math.sin(a)} y={200-146*Math.cos(a)} textAnchor="middle" dominantBaseline="middle" fill="#527363" fontSize="12">{i*5}</text>})}
    <circle cx="200" cy="202" r="25" fill="#294431" opacity=".06" />
    <circle cx="200" cy="200" r="23" fill={`url(#${id}-knob)`} stroke="#cbdcc8" strokeWidth="1.5" />
    <path d="M207 207l6 4" stroke="#89a384" strokeWidth="2" strokeLinecap="round" />
   </svg>
   <div className={styles.dialReadout}><strong role="timer" aria-label={stopwatch ? '공부한 시간' : '남은 시간'}>{studyClock(seconds)}</strong></div>
 </div>
}
