'use client'

import { useState } from 'react'
import { AchievementCard, GrowthCard } from './GrowthCards'
import { LegacyCouponCard, LegacyStreakCard } from './LegacyCards'
import s from './StreakPreviewV2.module.css'

export default function StreakPreviewV2() {
  const [kind, setKind] = useState<'flame' | 'tree'>('flame')
  const [version, setVersion] = useState<'new' | 'old'>('new')
  const [days, setDays] = useState(10)
  const [claimed, setClaimed] = useState(false)
  const [continued, setContinued] = useState(false)
  const milestone = Math.min(30, Math.floor(days / 5) * 5)
  const best = Math.max(12, days)
  function reset(value: number) {
    setDays(value)
    setClaimed(false)
    setContinued(false)
  }

  return (
    <div className={s.page}>
      <header className={s.header}><div><span>티처스 수학학원</span><span className={s.previewBadge}>디자인 미리보기</span></div></header>
      <main className={s.main}>
        <div className={s.intro}><p className={s.eyebrow}>꾸준히, 그리고 단단히</p><h1>매일의 노력이 쌓이는 곳</h1><p>작은 실천을 이어가며, 나만의 성장을 만나보세요.</p></div>
        <nav className={s.tabs} aria-label="미리보기 화면 선택">
          <button aria-pressed={kind === 'flame'} onClick={() => setKind('flame')}>쿠폰 받기 도전</button>
          <button aria-pressed={kind === 'tree'} onClick={() => setKind('tree')}>학습 습관 성장</button>
        </nav>
        <div className={s.previewTools}>
          <div className={s.versionSwitch} role="group" aria-label="디자인 비교"><button aria-pressed={version === 'old'} onClick={() => setVersion('old')}>기존 UI</button><button aria-pressed={version === 'new'} onClick={() => setVersion('new')}>새로운 UI</button></div>
          <label>예시 기록 <select value={days} onChange={e => reset(Number(e.target.value))}>{[0, 3, 5, 10, 12, 15, 20, 25, 30, 35].map(day => <option value={day} key={day}>{day}일</option>)}</select></label>
        </div>
        <div key={`${kind}-${version}`} className={s.content}>
          {version === 'old' ? <>
            <p className={s.comparisonNote}>현재 서비스의 {kind === 'flame' ? '쿠폰 카드' : '연속 기록 카드'} · 동일한 예시 기록으로 비교합니다.</p>
            {kind === 'flame' ? <LegacyCouponCard c={{ id: 0, milestone: Math.max(5, milestone), streak_value: days, claimed_at: '2026-09-26', used: false, code: '7X9K2A' }} /> : <LegacyStreakCard current={days} best={best} />}
          </> : <>
            {kind === 'tree' && <GrowthCard key={`${kind}-${days}`} kind={kind} current={days} best={best} />}
            {kind === 'flame' && <>
              {milestone >= 5 && !continued && <AchievementCard key={milestone} milestone={milestone} claimed={claimed} onClaim={() => setClaimed(true)} onContinue={() => setContinued(true)} />}
              {continued && <div className={s.continueNotice} role="status"><strong>{milestone < 30 ? `${milestone + 5}일 연속 도전을 이어가요.` : '30일을 넘어 도전을 이어가요.'}</strong><button onClick={() => setContinued(false)}>달성 카드 다시 보기</button></div>}
              {milestone < 5 && <section className={`${s.card} ${s.achievement}`}><h2>첫 쿠폰까지 {5 - days}일 남았어요.</h2><p className={s.description}>5일 연속 달성하면 쿠폰을 받거나 다음 목표에 도전할 수 있어요.</p></section>}
            </>}
          </>}
        </div>
        <p className={s.previewNote}>예시 데이터로 구성한 비교 시안입니다. 쿠폰은 실제로 발급되지 않습니다.<br />{kind === 'tree' ? '나무는 쿠폰 수령과 별개로 쌓이는 학습 습관을 표현합니다.' : '불꽃은 다음 쿠폰을 향해 이어가는 연속 도전을 표현합니다.'}</p>
      </main>
    </div>
  )
}
