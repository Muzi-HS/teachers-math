'use client'

import { useState } from 'react'
import { COUPON_MILESTONES } from '@/lib/streak'
import GrowthIllustration from './GrowthIllustration'
import s from './StreakPreviewV2.module.css'

export function GrowthCard({ kind, current, best }: { kind: 'flame' | 'tree'; current: number; best: number }) {
  const stage = COUPON_MILESTONES.filter(day => day <= current).length - 1
  const next = COUPON_MILESTONES.find(day => day > current)
  const progress = Math.max(0, Math.min(100, (current - 5) / 25 * 100))
  return (
    <section className={s.card} aria-label={kind === 'flame' ? '쿠폰 받기 도전' : '연속 숙제 이행'}>
      <div className={`${s.cardHeading} ${s.growthHeading}`}>
        <div>
          <h2>{kind === 'flame' ? '쿠폰 받기 도전' : '연속 숙제 이행'}</h2>
          <p className={s.record}><strong>{current}</strong>일 연속</p>
          <p className={s.description}>{kind === 'flame' ? '하루하루 이어온 도전, 다음 쿠폰에 가까워지고 있어요.' : '꾸준한 습관이 자라고 있어요.'}</p>
        </div>
        <span className={s.pill}>숙제 이행률 100%</span>
      </div>
      <div className={s.scroll} role="region" aria-label="5일부터 30일까지 성장 단계">
        <div className={s.track}>
          <div className={s.line} role="progressbar" aria-label="성장 단계 진행" aria-valuemin={0} aria-valuemax={30} aria-valuenow={Math.min(30, current)} aria-valuetext={`${current}일 연속, ${next ? `다음 목표 ${next}일` : '30일 단계 달성'}`}>
            <span key={current} style={{ width: `${progress}%` }} />
          </div>
          <ol className={s.steps}>
            {COUPON_MILESTONES.map((day, i) => (
              <li key={day} className={`${s.step} ${i === stage ? s.current : ''}`} aria-current={i === stage ? 'step' : undefined}>
                <span className={s.currentLabel}>{i === stage ? '현재 단계' : '\u00a0'}</span>
                <div className={s.iconCircle}><div className={s.illustration}><GrowthIllustration kind={kind} stage={i} reached={current >= day} current={i === stage} /></div></div>
                <span className={s.dot} data-reached={current >= day} />
                <div className={s.stepText}><strong>{day}일</strong></div>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className={s.mobileGrowthHero}>
        <div className={s.heroTree}><GrowthIllustration kind={kind} stage={Math.max(0, stage)} reached={current >= 5} current /></div>
        <p><strong>{current}일 연속 달성</strong></p>
        <span>꾸준한 습관이 자라고 있어요.</span>
      </div>
      <dl className={s.metrics}>
        <div><dt>현재 기록</dt><dd>{current}일</dd></div>
        <div><dt>최고 기록</dt><dd>{best}일</dd></div>
        <div><dt>{kind === 'tree' ? '다음 성장까지' : '다음 목표까지'}</dt><dd>{next ? <>{next - current}일 <small>남았어요</small></> : '30일 달성'}</dd></div>
      </dl>
      {current < 5 && <p className={s.footnote}>첫 목표까지 {5 - current}일, 차근차근 시작해보세요.</p>}
    </section>
  )
}

export function CouponTicket({ code, milestone, used = false }: { code: string; milestone: number; used?: boolean }) {
  const [copyStatus, setCopyStatus] = useState('')
  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopyStatus('코드를 복사했어요.')
    } catch {
      setCopyStatus('복사하지 못했어요. 코드를 직접 선택해 복사해주세요.')
    }
  }
  return (
    <div>
      <article className={`${s.ticket} ${used ? s.used : ''}`} aria-label={`${milestone}일 연속 달성 쿠폰`}>
        <div className={s.ticketBrand}>
          <span role="img" aria-label="티처스 수학학원 로고" className={s.logo} />
        </div>
        <div className={s.ticketBody}>
          <div className={s.ticketTitle}><span>{milestone}일 연속 달성 쿠폰</span><span className={s.ticketStatus}>{used ? '사용 완료' : '사용 가능'}</span></div>
          <div className={s.codeRow}><code>{code}</code><button type="button" onClick={copy} disabled={used} aria-label="쿠폰 코드 복사"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="2" /><path d="M10 3V2H2v8h1" /></svg>복사</button></div>
          <p>{used ? '사용이 완료된 쿠폰이에요.' : '학원에서 이 코드를 선생님께 보여주세요.'}</p>
        </div>
      </article>
      <p className={s.copyStatus} role="status">{copyStatus}</p>
    </div>
  )
}

export function AchievementCard({ milestone, onClaim, onContinue, claimed }: { milestone: number; onClaim: () => void; onContinue: () => void; claimed: boolean }) {
  const next = COUPON_MILESTONES.find(day => day > milestone)
  const stage = Math.max(0, COUPON_MILESTONES.indexOf(milestone))
  const flameSizes = [38, 52, 68, 86, 104, 122]
  return (
    <section className={`${s.card} ${s.achievement}`} aria-label="쿠폰 달성 안내">
      {!claimed && <div className={s.singleFlame}>
        <div style={{ width: flameSizes[stage], height: flameSizes[stage] }}><GrowthIllustration kind="flame" stage={stage} /></div>
      </div>}
      <h2>{claimed ? '꾸준한 도전으로 받은 쿠폰' : `${milestone}일 연속 숙제 이행률 100%!`}</h2>
      <p className={s.description}>{claimed ? '아래 예시 쿠폰을 확인해보세요.' : <>지금까지 꾸준히 잘 해냈어요.<br />쿠폰을 받고 다음 목표에도 도전해보세요.</>}</p>
      {claimed ? <CouponTicket code="7X9K2A" milestone={milestone} /> : <div className={s.actions}>
        <button className={s.primaryButton} onClick={onClaim}>{milestone}일 연속 달성 쿠폰 받기</button>
        <button className={s.secondaryButton} onClick={onContinue}>{next ? `${next}일 연속 도전하기` : '계속 도전하기'}</button>
      </div>}
      <p className={s.footnote}>{claimed ? '미리보기용 쿠폰으로 실제 사용할 수 없어요.' : '쿠폰을 받으면 쿠폰 도전 기록은 다시 시작해요.'}</p>
    </section>
  )
}
