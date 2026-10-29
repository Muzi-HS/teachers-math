'use client'
import { useState } from 'react'
import { UNIVERSITY_THEMES, type UniversityTheme } from '@/lib/student-theme'
import UniversityEmblem from './UniversityEmblem'
import s from './UniversityTheme.module.css'

export default function UniversityCoupon({ theme, milestone, code, used = false, preview = false }: { theme: UniversityTheme; milestone: number; code: string; used?: boolean; preview?: boolean }) {
  const [status, setStatus] = useState('')
  const university = UNIVERSITY_THEMES[theme]
  async function copy() {
    try { await navigator.clipboard.writeText(code); setStatus('쿠폰 코드를 복사했어요.') }
    catch { setStatus('코드를 직접 선택해 복사해주세요.') }
  }
  return <div>
    <article className={s.ticket} data-used={used} aria-label={`${milestone}일 연속 달성 쿠폰${preview ? ' · 예시' : ''} · ${used ? '사용 완료' : '사용 가능'}`}>
      <header className={s.ticketHeader}><span>{university.short} <i>STUDY CLUB</i></span><UniversityEmblem theme={theme} variant="crest" className={s.ticketCrest} /><span>{preview ? 'SAMPLE' : 'REWARD'}<br />TICKET</span></header>
      <div className={s.ticketBody}>
        <UniversityEmblem theme={theme} variant="crest" className={s.watermark} />
        <div className={s.ticketStatus}><span>매일의 노력이, 나의 미래로.</span><b>{used ? '사용 완료' : preview ? '미리보기' : '사용 가능'}</b></div>
        <div className={s.achievement}><strong>{milestone}<em>days</em></strong><span>CONSISTENCY<br />일 연속 숙제 달성</span></div>
        <h3>{university.motto}</h3><p>꿈에 가까워진 오늘의 나에게 주는 한 장.</p>
      </div>
      <footer className={s.ticketStub}><span>나의 리워드 코드{preview ? ' · 예시' : ''}</span><div><code>{code}</code><button type="button" onClick={copy} disabled={used || preview}>{used ? '사용 완료' : preview ? '예시 코드' : '코드 복사 ↗'}</button></div><p>{preview ? '디자인 예시이며 실제로 사용할 수 없습니다.' : used ? '사용이 완료된 쿠폰이에요.' : '학원에서 이 코드를 선생님께 보여주세요.'}</p><small>TEACHERS MATH <span>NO. {String(milestone).padStart(3, '0')}</span></small></footer>
    </article>
    <p className={s.feedback} role="status">{status}</p>
  </div>
}
