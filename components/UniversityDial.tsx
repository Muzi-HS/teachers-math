'use client'
import { useStudentTheme } from '@/context/StudentThemeContext'
import { isUniversityTheme, UNIVERSITY_THEMES, type UniversityTheme } from '@/lib/student-theme'
import { studyClock } from '@/lib/study'
import UniversityEmblem from './UniversityEmblem'
import s from './UniversityTheme.module.css'

export default function UniversityDial({ seconds, totalSeconds = 1500, stopwatch = false, paused = false, label = '집중을 준비해요', theme: previewTheme }: { seconds: number; totalSeconds?: number; stopwatch?: boolean; paused?: boolean; label?: string; theme?: UniversityTheme }) {
  const { theme: savedTheme } = useStudentTheme()
  const theme = previewTheme ?? (isUniversityTheme(savedTheme) ? savedTheme : 'university-snu')
  const progress = stopwatch ? (seconds % 3600) / 3600 : Math.max(0, Math.min(1, seconds / Math.max(1, totalSeconds)))
  return <div className={s.dial}>
    <p className={s.dialLabel}>{label}{paused ? ' · 일시정지' : ''}</p>
    <div className={s.dialFace}>
      <svg viewBox="0 0 300 300" className={s.ring} aria-hidden="true">
        <circle cx="150" cy="150" r="137" fill="none" stroke="var(--campus-line)" strokeWidth="1" />
        <circle cx="150" cy="150" r="122" fill="none" stroke="var(--campus-soft)" strokeWidth="5" />
        <circle cx="150" cy="150" r="112" fill="none" stroke="var(--campus-line)" strokeWidth=".5" />
        <circle cx="150" cy="150" r="122" fill="none" stroke="var(--campus-primary)" strokeWidth="5" strokeLinecap={progress > 0 ? 'round' : 'butt'} pathLength="100" strokeDasharray={`${progress * 100} 100`} transform="rotate(-90 150 150)" />
        {Array.from({ length: 60 }, (_, i) => <line key={i} x1="150" y1="10" x2="150" y2={i % 5 ? 13 : 17} stroke="var(--campus-primary)" opacity={i % 5 ? .25 : .7} transform={`rotate(${i * 6} 150 150)`} />)}
      </svg>
      <div className={s.dialCenter} data-campus={theme}><UniversityEmblem theme={theme} variant="dial" /></div>
    </div>
    <div className={s.dialReadout}><span>{UNIVERSITY_THEMES[theme].short} · STUDY</span><strong role="timer" aria-label={stopwatch ? '공부한 시간' : '남은 시간'}>{studyClock(seconds)}</strong><small>{UNIVERSITY_THEMES[theme].motto}</small></div>
  </div>
}
