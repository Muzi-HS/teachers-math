'use client'
import { useState } from 'react'
import { UNIVERSITY_THEMES, type UniversityTheme } from '@/lib/student-theme'
import UniversityEmblem from '@/components/UniversityEmblem'
import UniversityDial from '@/components/UniversityDial'
import UniversityCoupon from '@/components/UniversityCoupon'
import UniversityBrandPanel from '@/components/UniversityBrandPanel'
import s from './UniversityPreview.module.css'

export default function UniversityPreview() {
  const [theme, setTheme] = useState<UniversityTheme>('university-snu')
  const [screen, setScreen] = useState<'home' | 'timer' | 'coupon'>('home')
  const university = UNIVERSITY_THEMES[theme]
  return <div className={s.page}>
    <header className={s.intro}><span>TEACHERS MATH · DREAM CAMPUS COLLECTION</span><h1>꿈꾸는 곳의 빛으로,<br />오늘의 공부를 채우다.</h1><p>마음에 품은 캠퍼스, 매일 만나는 나의 공부 공간.</p></header>
    <div className={s.picker} role="group" aria-label="대학교 테마 미리보기 선택">{(Object.entries(UNIVERSITY_THEMES) as [UniversityTheme, typeof university][]).map(([id, item]) => <button key={id} type="button" aria-pressed={id === theme} onClick={() => setTheme(id)} data-student-theme={id}><UniversityEmblem theme={id} /><span>{item.name}<small>{item.motif}</small></span></button>)}</div>
    <div className={s.stage}>
      <aside className={s.caption} data-student-theme={theme}><span>0{Object.keys(UNIVERSITY_THEMES).indexOf(theme) + 1} / CAMPUS EDITION</span><h2>{university.name}</h2><p>{university.motto}</p><UniversityEmblem theme={theme} /><small>상징을 선명하게, 공부 공간은 차분하게.<br />학교별 로고와 컬러로 완성한 나의 캠퍼스 에디션.</small></aside>
      <div className={`student-shell ${s.phone}`} data-student-theme={theme} data-student-screen="preview">
        <header className={`student-header ${s.header}`}><span>티처스 수학학원</span><span className="student-university-badge"><UniversityEmblem theme={theme} />{university.short}</span></header>
        <main className={`student-main ${s.main}`}>
          {screen === 'home' ? <>
            <UniversityBrandPanel theme={theme} />
            <div className={s.greeting}><span>MY NEXT CHAPTER</span><h2>오늘도 꿈에 한 걸음 더.</h2><p>지금 쌓는 작은 노력이 내일의 나를 만들어요.</p></div>
            <div className={s.stats}><div><span>이번 주 숙제</span><strong>100<small>%</small></strong></div><div><span>연속 달성</span><strong>12<small>일</small></strong></div><div><span>공부한 시간</span><strong>8<small>시간</small></strong></div></div>
            <section className={s.homeCard}><span className={s.eyebrow}>TODAY’S MISSION</span><h3>오늘의 한 문제, 내일의 가능성.</h3><p>수학Ⅰ · 수열의 합<br />유형 연습 12~24번 풀고 오답 정리하기</p><span className={s.pill}>차근차근 해내는 중</span></section>
            <button type="button" className={s.launch} onClick={() => setScreen('timer')}><span>◷</span><div><strong>꿈을 향한 집중 시간</strong><small>{university.motto}</small></div><b>↗</b></button>
            <section className={s.homeCard}><span className={s.eyebrow}>A NOTE TO MYSELF</span><p>완벽하지 않아도 괜찮아.<br />오늘도 해냈다는 사실이 중요하니까.</p></section>
          </> : screen === 'timer' ? <section className={s.homeCard}><span className={s.eyebrow}>FOCUS ON YOUR DREAM</span><h3>나만의 집중 타이머</h3><UniversityDial theme={theme} seconds={1125} totalSeconds={1500} label="집중 시간 · 미리보기" /><p className={s.sample}>화면 예시입니다. 공부 기록은 저장되지 않습니다.</p></section> : <><h2 className={s.couponTitle}>꾸준함이 만든 나의 티켓</h2><UniversityCoupon theme={theme} milestone={10} code="DREAM10" preview /><UniversityCoupon theme={theme} milestone={5} code="CAMPUS5" used preview /></>}
        </main>
        <nav className={s.nav} aria-label="미리보기 화면">{([{ id: 'home', icon: '⌂', label: '학생 홈' }, { id: 'timer', icon: '◷', label: '집중 타이머' }, { id: 'coupon', icon: '◇', label: '쿠폰함' }] as const).map(item => <button type="button" key={item.id} onClick={() => setScreen(item.id)} aria-pressed={screen === item.id}><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}</nav>
      </div>
    </div>
    <p className={s.disclaimer}>샘플 데이터로 구성한 디자인 미리보기입니다. 실제 학생 테마는 학생 계정의 ‘내 테마’에서 선택할 수 있어요.</p>
  </div>
}
