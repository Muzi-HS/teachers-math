'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import GrowthIllustration from '@/components/streak-preview/GrowthIllustration'
import { CouponTicket } from '@/components/streak-preview/GrowthCards'
import s from './StudentPreview.module.css'

const classes = ['수학 정규반', '심화 문제풀이반']
const lessons = [
  { date: '9월 25일 · 금요일', content: '이차함수의 꼭짓점과 축의 방정식을 구하고, 그래프를 이용해 최댓값과 최솟값을 구했어요.', homework: '개념원리 p.82–85, 1–18번 풀기\n틀린 문제 3개는 풀이 과정을 다시 적어오기', hwRate: 100, hwCor: 89, late: false },
  { date: '9월 23일 · 수요일', content: '이차함수 그래프의 평행이동과 꼭짓점의 관계를 연습했어요.', homework: '개념원리 p.76–81 풀기', hwRate: 100, hwCor: 85, late: false },
  { date: '9월 21일 · 월요일', content: '계수에 따라 달라지는 이차함수 그래프의 모양을 확인했어요.', homework: '기본 유형 1–12번 풀기', hwRate: 100, hwCor: 92, late: true },
]
// 실제 수업기록 화면(app/student/records/page.tsx)의 카드 구조를 그대로 가져오고
// 색상만 이 시안의 민트/그린 테마에 맞췄다.
function Gauge({ value }: { value: number }) {
  const r = 12.5, c = 2 * Math.PI * r
  return <svg width="28" height="28" viewBox="0 0 32 32" style={{ flexShrink: 0 }}>
    <circle cx="16" cy="16" r={r} fill="none" stroke="#E3EBE3" strokeWidth="3.2" />
    <circle cx="16" cy="16" r={r} fill="none" stroke="#2B6B45" strokeWidth="3.2"
      strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} strokeLinecap="round" transform="rotate(-90 16 16)" />
  </svg>
}
function RecordCard({ lesson }: { lesson: typeof lessons[number] }) {
  return <div className={s.recordCard}>
    <div className={s.recordHead}>
      <b>{lesson.date}</b>
      {lesson.late
        ? <span className={s.pillWarn}>지각</span>
        : <span className={s.pillGood}>정시 등원</span>}
    </div>
    <div className={s.statRow}>
      <div className={s.statBox}>
        <p className={s.statLabel}>숙제 이행률</p>
        <div className={s.statValueRow}><p className={s.statValue}>{lesson.hwRate}<span>%</span></p><Gauge value={lesson.hwRate} /></div>
      </div>
      <div className={s.statBox}>
        <p className={s.statLabel}>숙제 정답률</p>
        <div className={s.statValueRow}><p className={s.statValue}>{lesson.hwCor}<span>%</span></p><Gauge value={lesson.hwCor} /></div>
      </div>
    </div>
    <div className={s.block}><span className={s.blockBar} /><div><p className={s.blockLabel}>진도</p><p className={s.blockText}>{lesson.content}</p></div></div>
    <div className={s.block}><span className={s.blockBar} /><div><p className={s.blockLabel}>숙제</p><p className={s.blockText}>{lesson.homework}</p></div></div>
  </div>
}
function PreviewTrend({ lessons: rows, field, title }: { lessons: typeof lessons; field: 'hwRate' | 'hwCor'; title: string }) {
  const values = [...rows].reverse().map(row => row[field])
  const points = values.map((value, index) => `${20 + index * (240 / Math.max(values.length - 1, 1))},${110 - value}`).join(' ')
  return <div className={s.plainCard} style={{ marginBottom: 12 }}><h3>{title}</h3><svg viewBox="0 0 280 120" width="100%" height="140" role="img" aria-label={`${title} 그래프`}><path d="M20 10V110H260" fill="none" stroke="#DDE8DF" /><polyline points={points} fill="none" stroke="#2B6B45" strokeWidth="3" />{values.map((value, index) => <circle key={index} cx={20 + index * (240 / Math.max(values.length - 1, 1))} cy={110 - value} r="4" fill="#2B6B45" />)}</svg></div>
}
type Tab = 'homework' | 'records' | 'growth' | 'tests' | 'notices' | 'schedule' | 'coupons'
export type StudentPreviewTopic = Tab | 'stats' | 'class'
type NavTab = 'homework' | 'tests' | 'schedule' | 'notices' | 'coupons'
function NavIcon({ tab }: { tab: NavTab }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {tab === 'homework' ? <path d="m4 11 8-7 8 7M6 10v9h12v-9" />
      : tab === 'tests' ? <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="m9 8 1 1 2-2M14 8h2m-7 6 1 1 2-2M14 14h2" /></>
      : tab === 'notices' ? <><path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z" /><path d="M10 19a2 2 0 0 0 4 0" /></>
      : tab === 'schedule' ? <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 9h16M8 3v4M16 3v4" /></>
      : <><path d="M4 9a2 2 0 0 1 0-4h16a2 2 0 0 1 0 4 2 2 0 0 0 0 6 2 2 0 0 1 0 4H4a2 2 0 0 1 0-4 2 2 0 0 0 0-6Z" /><path d="M14 6v12" strokeDasharray="2 2" /></>}
  </svg>
}
function BackLink({ onClick }: { onClick: () => void }) {
  return <button type="button" className={s.backLink} onClick={onClick}>
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
    홈으로
  </button>
}

export default function StudentPreview({ embedded = false, onAction }: { embedded?: boolean; onAction?: (topic: StudentPreviewTopic) => void }) {
  const [tab, setTab] = useState<Tab>('homework')
  const [classIndex, setClassIndex] = useState(0)
  const [showStats, setShowStats] = useState(false)
  const [exam, setExam] = useState<'upcoming' | 'results'>('upcoming')
  const [examOpen, setExamOpen] = useState(false)
  const days = 25
  const tabs: { id: NavTab; label: string }[] = [
    { id: 'homework', label: '홈' }, { id: 'tests', label: '시험' }, { id: 'schedule', label: '학원일정' }, { id: 'notices', label: '공지' }, { id: 'coupons', label: '쿠폰함' },
  ]
  const homework = classIndex === 0 ? lessons[0].homework : '심화 프린트 2장, 1–8번 풀기\n4번·7번은 다른 풀이 방법도 생각해오기'
  const selectedLessons = classIndex === 0 ? lessons : [{ ...lessons[0], content: '조건에 맞는 이차함수의 식을 세우고 여러 풀이 방법을 비교했어요.', homework, hwRate: 100, hwCor: 91, late: false }]
  const noticeCount = 2
  // 심화 문제풀이반은 휴강 등록 예시 — 다음 수업이 자동으로 다음 정상 수업일로 안내된다.
  const nextClass = classIndex === 0
    ? { date: '9.28 (월) 오후 5:00', cancelled: false as const }
    : { cancelledDate: '9.29 (화)', date: '10.1 (수) 오후 6:30', cancelled: true as const }
  useEffect(() => {
    onAction?.(tab === 'records' && showStats ? 'stats' : tab === 'homework' && classIndex > 0 ? 'class' : tab)
  }, [tab, showStats, classIndex, onAction])
  return <div className={embedded ? s.embeddedPage : s.page}>
    <aside className={s.explanation}><span className={s.kicker}>STUDENT · MOBILE PREVIEW</span><h1>열자마자 숙제,<br />그다음 수업기록.</h1><p>현재 학생 홈의 구성과 동선을 예시 데이터로 보여드립니다.</p><ol><li><strong>탭은 홈·시험·학원일정·공지·쿠폰함</strong><span>수업기록과 학습 성장은 홈의 바로가기로 열어요.</span></li><li><strong>숙제 카드 하나로 통합</strong><span>다음 수업 일정, 최근 기록 날짜와 숙제 이행 상태를 함께 봐요.</span></li><li><strong>휴강도 자동 안내</strong><span>휴강이 등록되면 다음 정상 수업일로 자동 안내돼요.</span></li><li><strong>성장은 별도 화면에서</strong><span>연속 숙제 이행 카드를 누르면 성장 단계를 자세히 볼 수 있어요.</span></li></ol><Link href="/preview/streak-v2">쿠폰·성장 시안도 보기 →</Link></aside>
    <div className={s.app}>
      <div className={s.previewLabel}>학생 화면 시안 · 모든 내용은 예시입니다</div>
      <header className={s.header}>
        <span className={s.brand}><span className={s.logo} aria-hidden="true" />티처스 수학학원</span>
        <div className={s.headerRight}>
          <button className={s.bellButton} aria-label={`공지 ${noticeCount}건`} onClick={() => setTab('notices')}>
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z" /><path d="M10 19a2 2 0 0 0 4 0" /></svg>
            {noticeCount > 0 && <span className={s.badge}>{noticeCount}</span>}
          </button>
          <span className={s.studentName}>민준 학생</span>
        </div>
      </header>
      <main className={s.main}>
        {tab === 'homework' && <>
          <div className={s.heading}><div><p>오늘도 차근차근</p><h2>이번 숙제</h2></div><span className={s.count}>2개 반</span></div>
          <div className={s.segment} aria-label="숙제 반 선택">{classes.map((name, i) => <button key={name} aria-pressed={classIndex === i} onClick={() => setClassIndex(i)}>{name}</button>)}</div>
          <section className={s.homeworkCard}>
            <div className={s.due}>
              <p className={s.dueMain}>다음 수업 <strong>{nextClass.date}</strong>까지</p>
              {nextClass.cancelled && (
                <p className={s.cancelInline}>
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m8 8 8 8" /></svg>
                  {nextClass.cancelledDate} 수업은 <b>휴강</b>이에요
                </p>
              )}
            </div>
            <div className={s.recentStatus}><span>최근 수업기록</span><strong>{selectedLessons[0].date}</strong><b>지난 숙제 이행 {selectedLessons[0].hwRate}%</b></div>
            <p className={s.assignment}>{homework}</p>
            <p className={s.homeworkRates}>숙제 이행률 <b>{selectedLessons[0].hwRate}%</b>　정답률 <b>{selectedLessons[0].hwCor}%</b></p>
            <button className={s.textButton} onClick={() => { setTab('records'); setShowStats(false) }}>관련 수업기록 보기 <span>→</span></button>
          </section>
          <button className={s.quickLink} onClick={() => setTab('tests')}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="m9 8 1 1 2-2M14 8h2m-7 6 1 1 2-2M14 14h2" /></svg>
            확인할 시험 <b>1</b>
          </button>
          <button className={s.scheduleCard} onClick={() => setTab('schedule')}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 9h16M8 3v4M16 3v4" /></svg>
            <span><strong>이번주 학원일정</strong><small>9.28(월) 정기고사 안내 외 1건</small></span>
            <span aria-hidden="true">›</span>
          </button>
          <button className={s.growthSummary} onClick={() => setTab('growth')}><GrowthIllustration kind="tree" stage={4} /><span><strong>25일 연속 숙제 이행</strong><small>차곡차곡 쌓인 나의 학습 습관</small></span><span aria-hidden="true">›</span></button>
        </>}
        {tab === 'records' && <>
          <BackLink onClick={() => setTab('homework')} />
          <div className={s.heading}><div><p>배운 내용과 나의 변화</p><h2>수업기록</h2></div></div>
          <button className={s.textButton} onClick={() => setShowStats(value => !value)}>{showStats ? '기록 보기' : '통계 보기'} <span>→</span></button>
          {showStats ? <><div className={s.previewStats}><div>숙제 이행률 평균 <b>{Math.round(selectedLessons.reduce((a, l) => a + l.hwRate, 0) / selectedLessons.length)}%</b></div><div>숙제 정답률 평균 <b>{Math.round(selectedLessons.reduce((a, l) => a + l.hwCor, 0) / selectedLessons.length)}%</b></div></div><PreviewTrend lessons={selectedLessons} field="hwRate" title="숙제 이행률 추이" /><PreviewTrend lessons={selectedLessons} field="hwCor" title="숙제 정답률 추이" /></> : <><p className={s.sectionNote}>{classes[classIndex]} · 최근 수업</p>{selectedLessons.map(lesson => <RecordCard key={lesson.date} lesson={lesson} />)}</>}
        </>}
        {tab === 'growth' && <><BackLink onClick={() => setTab('homework')} /><section className={s.growthDetail}><h3>꾸준히 쌓이는 나의 성장</h3><div className={s.progress}><div className={s.progressLine}><span style={{ width: `${(days - 5) / 25 * 100}%` }} /></div><ol>{[5,10,15,20,25,30].map(day => <li key={day} aria-current={day === days ? 'step' : undefined}><span data-reached={day <= days} />{day}일</li>)}</ol></div><div className={s.largeTree}><GrowthIllustration kind="tree" stage={days / 5 - 1} current /></div><strong className={s.growthNumber}>{days}일 연속 달성</strong><p>꾸준한 습관이 자라고 있어요.</p><div className={s.growthFooter}><span>최고 기록 <b>25일</b></span><span>다음 성장까지 <b>5일</b></span></div></section></>}
        {tab === 'tests' && <>
          <BackLink onClick={() => setTab('homework')} />
          <div className={s.heading}><div><p>필요할 때 확인하는</p><h2>시험</h2></div></div><div className={s.segment}><button aria-pressed={exam === 'upcoming'} onClick={() => { setExam('upcoming'); setExamOpen(false) }}>응시할 시험 · 1</button><button aria-pressed={exam === 'results'} onClick={() => { setExam('results'); setExamOpen(false) }}>시험 결과</button></div>
          <section className={s.plainCard}><span className={s.date}>{exam === 'upcoming' ? '9월 28일 · 수학 정규반' : '9월 21일 · 수학 정규반'}</span><h3>{exam === 'upcoming' ? '이차함수 단원 확인' : '이차함수 기본 개념'}</h3><p>{exam === 'upcoming' ? '10문항 · 답안 입력 시간 2분' : '90점 · 정답 9 / 10문항'}</p>{exam === 'upcoming' && <><button className={s.primary} onClick={() => setExamOpen(v => !v)}>{examOpen ? '안내 닫기' : '시험 안내 확인'}</button>{examOpen && <p className={s.notice} role="status">실제 화면에서는 시작 전 제한 시간을 안내하고 답안 입력으로 이어집니다. 이 시안에서는 시험이 시작되지 않습니다.</p>}</>}</section>
        </>}
        {tab === 'notices' && <>
          <div className={s.heading}><div><p>학원에서 보낸</p><h2>공지</h2></div></div>
          <section className={s.plainCard}><span className={s.date}>9월 25일 · 수학 정규반</span><h3>다음 수업 준비물 안내</h3><p>개념원리 교재와 오답 노트를 챙겨주세요.</p></section>
        </>}
        {tab === 'schedule' && <>
          <div className={s.heading}><div><p>이번 달</p><h2>학원일정</h2></div></div>
          <section className={s.plainCard}><span className={s.date}>9월 28일 · 월요일</span><h3>수학 정규반</h3><p>오후 5:00–7:00 · 2강의실</p></section>
        </>}
        {tab === 'coupons' && <>
          <div className={s.heading}><div><p>연속 숙제 이행으로 받은</p><h2>쿠폰함</h2></div></div>
          <CouponTicket milestone={10} code="7X9K2A" />
        </>}
      </main>
      <nav className={s.nav} aria-label="학생 메뉴">{tabs.map(item => {
        const active = item.id === 'homework' ? (tab === 'homework' || tab === 'records' || tab === 'growth') : tab === item.id
        return <button key={item.id} aria-current={active ? 'page' : undefined} onClick={() => setTab(item.id)}><NavIcon tab={item.id} /><span>{item.label}</span></button>
      })}</nav>
    </div>
  </div>
}
