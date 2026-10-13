import Link from 'next/link'
import styles from './Study.module.css'

export default function StudyLaunchCard() {
 return <Link href="/student/study" className={styles.launch}>
  <span className={styles.launchIcon} aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2M12 3v1M21 12h-1M12 21v-1M3 12h1" /></svg></span>
  <span><strong>나만의 집중 시간</strong><small>타이머 · 스톱워치 · 나의 공부 기록</small></span>
  <span className={styles.launchArrow} aria-hidden="true">›</span>
 </Link>
}
