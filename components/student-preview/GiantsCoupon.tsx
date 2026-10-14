'use client'

import { useState } from 'react'
import s from './GiantsPreview.module.css'

export default function GiantsCoupon({ milestone, code, used = false, preview = true }: { milestone: number; code: string; used?: boolean; preview?: boolean }) {
  const [status, setStatus] = useState('')
  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setStatus('쿠폰 코드를 복사했어요.')
    } catch {
      setStatus('코드를 직접 선택해 복사해주세요.')
    }
  }
  return <>
    <article className={s.couponTicket} data-used={used} aria-label={`${milestone}일 연속 달성 쿠폰${preview ? ' 예시' : ''}`}>
      <header className={s.couponHeader}><span>GIANTS STUDY CLUB</span><span>REWARD TICKET</span></header>
      <div className={s.couponBody}>
        <span className={s.couponEmblem} aria-hidden="true" />
        <div className={s.couponStatus}><span>꾸준함으로 얻은 나의 티켓</span><b>{used ? '사용 완료' : '사용 가능'}{preview ? ' · 예시' : ''}</b></div>
        <div className={s.couponMilestone}><strong>{milestone}</strong><span>일 연속<br /><b>숙제 이행 달성</b></span></div>
        <h3>매일의 노력이 만든 한 장.</h3>
        <p>차곡차곡 쌓은 공부 습관을 응원해요.</p>
      </div>
      <div className={s.couponStub}>
        <span className={s.couponCodeLabel}>MY REWARD CODE</span>
        <div className={s.couponCode}><code>{code}</code><button type="button" onClick={copy} disabled={used} aria-label="쿠폰 코드 복사"><svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="7" y="7" width="10" height="11" rx="2" /><path d="M13 4V2H2v12h2" /></svg>{used ? '사용 완료' : '복사'}</button></div>
        <p>{used ? '사용이 완료된 쿠폰이에요.' : '학원에서 이 코드를 선생님께 보여주세요.'}</p>
        <div className={s.couponBottom}><span>TEACHERS MATH × GIANTS</span><span>NO. {String(milestone).padStart(3, '0')}</span></div>
      </div>
    </article>
    <p className={s.couponFeedback} role="status">{status}</p>
    {preview && <p className={s.couponDisclaimer}>디자인 미리보기용 쿠폰입니다. 실제로 사용할 수 없습니다.</p>}
  </>
}
