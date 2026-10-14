'use client'

import { useState } from 'react'
import GrowthIllustration from '@/components/streak-preview/GrowthIllustration'
import s from './OriginalCouponPreview.module.css'

export function OriginalCoupon({ used = false, milestone = 10, code = '7X9K2A' }: { used?: boolean; milestone?: number; code?: string }) {
  const [status, setStatus] = useState('')
  async function copy() {
    try { await navigator.clipboard.writeText(code); setStatus('쿠폰 코드를 복사했어요.') }
    catch { setStatus('코드를 직접 선택해 복사해주세요.') }
  }
  return <div>
    <article className={`${s.ticket} ${used ? s.used : ''}`} aria-label={`${milestone}일 연속 달성 쿠폰 · ${used ? '사용 완료' : '사용 가능'}`}>
      <header className={s.header}><span className={s.school}><i aria-hidden="true" />티처스 수학학원</span><span className={s.edition}>STUDY REWARDS</span></header>
      <div className={s.body}>
        <div className={s.topline}><span>꾸준한 나에게 주는 선물</span><b>{used ? '사용 완료' : '사용 가능'}</b></div>
        <span className={s.schoolWatermark} aria-hidden="true" />
        <div className={s.achievement}><span className={s.plant} aria-hidden="true"><GrowthIllustration kind="tree" stage={Math.max(0, Math.min(5, Math.floor(milestone / 5) - 1))} /></span><span>작은 실천이 쌓인<strong>{milestone}일의 꾸준함</strong></span></div>
        <h2>연속 숙제 달성 쿠폰</h2>
        <p>매일 해낸 나의 노력을 기억하는 한 장.<br />앞으로의 도전도 티처스가 함께 응원해요.</p>
        <div className={s.milestone}><span>ACHIEVEMENT</span><b>{milestone}일 연속 · 숙제 이행률 100%</b></div>
      </div>
      <div className={s.stub}>
        <span className={s.codeLabel}>나의 쿠폰 코드</span>
        <div className={s.codeRow}><code>{code}</code><button type="button" disabled={used} onClick={copy} aria-label="쿠폰 코드 복사">{used ? '사용 완료' : '코드 복사'}{!used && <span aria-hidden="true">↗</span>}</button></div>
        <p>{used ? '이미 사용한 쿠폰이에요.' : '사용할 때 선생님께 이 코드를 보여주세요.'}</p>
        <footer><span>TEACHERS MATH</span><span>REWARD NO. {String(milestone).padStart(3, '0')}</span></footer>
      </div>
    </article>
    <p className={s.copyStatus} role="status">{status}</p>
  </div>
}

export default function OriginalCouponPreview() {
  return <main className={s.page}>
    <div className={s.intro}><span className={s.eyebrow}>TEACHERS MATH · COUPON DESIGN</span><h1>꾸준함에 어울리는,<br />조금 특별한 한 장.</h1><p>기존 그린 테마를 바탕으로 만든 별도 쿠폰 시안입니다.<br />딥그린과 크림색, 은은한 금색으로 학습 리워드의 느낌을 담았어요.</p><a href="/preview/giants/coupons">자이언츠 쿠폰과 비교하기 ↗</a></div>
    <div className={s.examples}><section><h2 className={s.exampleLabel}>01 <span>사용 가능한 쿠폰</span></h2><OriginalCoupon /></section><section><h2 className={s.exampleLabel}>02 <span>사용 완료된 쿠폰</span></h2><OriginalCoupon used code="3M8P6R" /></section></div>
    <p className={s.disclaimer}>샘플 코드로 만든 디자인 시안입니다. 실제 쿠폰에는 아직 적용되지 않았으며 사용할 수 없습니다.</p>
  </main>
}
