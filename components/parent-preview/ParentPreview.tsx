'use client'

import { useState } from 'react'
import Link from 'next/link'
import HomeworkStatsView from '@/components/HomeworkStatsView'
import s from './ParentPreview.module.css'

const children = [
  { name: '민준', class: '수학 정규반' },
  { name: '서연', class: '심화 문제풀이반' },
]

const recordsByChild = [
  [
    { date: '9월 25일 · 금요일', content: '이차함수의 꼭짓점과 축의 방정식을 구하고, 그래프를 이용해 최댓값과 최솟값을 구했어요.', homework: '개념원리 p.82–85, 1–18번 풀기\n틀린 문제 3개는 풀이 과정을 다시 적어오기', hwRate: 100, hwCor: 89, attitude: 9, late: false },
    { date: '9월 23일 · 수요일', content: '이차함수 그래프의 평행이동과 꼭짓점의 관계를 연습했어요.', homework: '개념원리 p.76–81 풀기', hwRate: 100, hwCor: 85, attitude: 8, late: false },
    { date: '9월 21일 · 월요일', content: '계수에 따라 달라지는 이차함수 그래프의 모양을 확인했어요.', homework: '기본 유형 1–12번 풀기', hwRate: 100, hwCor: 92, attitude: 9, late: true },
  ],
  [
    { date: '9월 24일 · 목요일', content: '조건에 맞는 이차함수의 식을 세우고 여러 풀이 방법을 비교했어요.', homework: '심화 프린트 2장, 1–8번 풀기\n4번·7번은 다른 풀이 방법도 생각해오기', hwRate: 100, hwCor: 91, attitude: 10, late: false },
    { date: '9월 22일 · 화요일', content: '이차함수의 최대·최소 활용 문제를 풀었어요.', homework: '심화 프린트 1장 풀기', hwRate: 90, hwCor: 88, attitude: 8, late: false },
  ],
]

type Lesson = (typeof recordsByChild)[number][number]

function Gauge({ value }: { value: number }) {
  const r = 12.5, c = 2 * Math.PI * r
  return <svg width="28" height="28" viewBox="0 0 32 32" style={{ flexShrink: 0 }}>
    <circle cx="16" cy="16" r={r} fill="none" stroke="#E3EBE3" strokeWidth="3.2" />
    <circle cx="16" cy="16" r={r} fill="none" stroke="#2B6B45" strokeWidth="3.2"
      strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} strokeLinecap="round" transform="rotate(-90 16 16)" />
  </svg>
}

// 학생 화면과 같은 수업기록 카드 구조에 학부모 전용 의견 남기기 기능을 더한 카드.
function RecordCard({ lesson, withFeedback, home = false, className, onComment }: { lesson: Lesson; withFeedback?: boolean; home?: boolean; className: string; onComment?: () => void }) {
  const [feedback, setFeedback] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  return <div className={s.recordCard}>
    <div className={s.recordHead}>
      {home && <span className={s.date} style={{ margin: 0 }}>최근 수업</span>}
      <b>{lesson.date}</b>
      <span className={s.pillGood}>{className}</span>
      {lesson.late ? <span className={s.pillWarn}>지각</span> : <span className={s.pillGood}>정시 등원</span>}
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
      <div className={s.statBox}>
        <p className={s.statLabel}>수업 태도</p>
        <div className={s.statValueRow}><p className={s.statValue}>{lesson.attitude}<span>점</span></p></div>
        <span style={{ fontSize: 10, color: '#2B6B45' }}>{lesson.attitude >= 8 ? '우수' : lesson.attitude >= 5 ? '보통' : '노력필요'}</span>
      </div>
    </div>
    <div className={s.block}><span className={s.blockBar} /><div><p className={s.blockLabel}>수업 내용</p><p className={s.blockText}>{lesson.content}</p></div></div>
    <div className={s.block}><span className={s.blockBar} /><div><p className={s.blockLabel}>숙제</p><p className={s.blockText}>{lesson.homework}</p></div></div>
    <div className={s.sampleFeedback}><strong>수업 피드백</strong><p>이차함수 그래프의 꼭짓점과 축을 정확하게 찾았습니다. 최댓값과 최솟값 문제도 풀이 과정을 차분히 정리했어요. 다음 수업 전에는 틀린 문제의 그래프를 다시 그려보면 좋겠습니다.</p></div>
    {withFeedback && (
      <div className={s.feedback}>
        {saved ? (
          <div className={s.feedbackSaved}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
            <p>선생님께 전달했어요: “{saved}”</p>
          </div>
        ) : <>
          <p>선생님께 의견 남기기</p>
          <textarea value={feedback} onFocus={onComment} onChange={e => setFeedback(e.target.value)} placeholder="궁금한 점이나 전하고 싶은 말을 적어주세요" />
          <div className={s.feedbackRow}><button type="button" disabled={!feedback.trim()} onClick={() => setSaved(feedback.trim())}>보내기</button></div>
        </>}
      </div>
    )}
  </div>
}

type Tab = 'home' | 'records' | 'notices' | 'schedule' | 'inquiries'
export type ParentPreviewTopic = Tab | 'stats' | 'attendance' | 'comment' | 'child'
function NavIcon({ tab }: { tab: Tab }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {tab === 'home' ? <path d="m4 11 8-7 8 7M6 10v9h12v-9" />
      : tab === 'notices' ? <><path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z" /><path d="M10 19a2 2 0 0 0 4 0" /></>
      : tab === 'records' ? <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 3h6v3H9zM9 11h6M9 15h4" /></>
      : tab === 'schedule' ? <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 9h16M8 3v4M16 3v4" /></>
      : <path d="M21 11.5a8.5 8.5 0 0 1-11.9 7.8L4 21l1.7-5A8.5 8.5 0 1 1 21 11.5Z" />}
  </svg>
}
function ChildSegment({ childIndex, onChange }: { childIndex: number; onChange: (i: number) => void }) {
  if (children.length <= 1) return null
  return <div className={s.segment} aria-label="자녀 선택">
    {children.map((c, i) => <button key={c.name} aria-pressed={childIndex === i} onClick={() => onChange(i)}>{c.name}</button>)}
  </div>
}

export default function ParentPreview({ embedded = false, initialTab = 'home', onAction }: { embedded?: boolean; initialTab?: Tab; onAction?: (topic: ParentPreviewTopic) => void }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [childIndex, setChildIndex] = useState(0)
  const [attendanceOpen, setAttendanceOpen] = useState(false)
  const [attendanceType, setAttendanceType] = useState<'absence' | 'late'>('absence')
  const [attendanceSaved, setAttendanceSaved] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const unreadCount = 1
  const lessons = recordsByChild[childIndex]
  const statRecords = lessons.map(lesson => ({
    date: `2026-09-${lesson.date.match(/9월 (\d+)일/)?.[1].padStart(2, '0') ?? '01'}`,
    hw_rate: lesson.hwRate,
    hw_cor: lesson.hwCor,
  }))
  const tabs: { id: Tab; label: string }[] = [
    { id: 'home', label: '홈' }, { id: 'records', label: '수업기록' }, { id: 'notices', label: '공지사항' },
    { id: 'schedule', label: '학원일정' }, { id: 'inquiries', label: '문의하기' },
  ]
  function selectTab(next: Tab) { setTab(next); onAction?.(next === 'records' && showStats ? 'stats' : next) }

  return <div className={embedded ? s.embeddedPage : s.page}>
    {!embedded && <aside className={s.explanation}>
      <span className={s.kicker}>PARENT · MOBILE PREVIEW</span>
      <h1>학생 화면과 같은<br />구조의 학부모 홈.</h1>
      <p>학생 시안과 같은 톤·레이아웃으로 맞추고, 학부모가 실제로 필요한 기능(의견 남기기·지각결석 등록·문의)만 더했습니다.</p>
      <ol>
        <li><strong>탭은 홈·공지·수업기록·학원일정·문의</strong><span>더보기 없이 자주 쓰는 화면을 모두 하단 메뉴에 바로 두었어요.</span></li>
        <li><strong>홈은 가장 최근 기록만</strong><span>홈에는 최신 수업기록 카드 하나만 보여주고, 지난 기록·그래프는 수업기록 탭에서 봐요.</span></li>
        <li><strong>수업기록에 그래프 추가</strong><span>숙제 이행률·정답률 추이를 꺾은선 그래프로 한눈에 볼 수 있어요.</span></li>
        <li><strong>공지 확인</strong><span>헤더 알림에서 새 공지를 확인할 수 있어요.</span></li>
        <li><strong>지각·결석은 홈에서 바로</strong><span>등록 버튼을 누르면 문의 화면으로 이동하지 않고 입력창이 열려요.</span></li>
      </ol>
      <Link href="/preview/student-v2">학생 화면 시안도 보기 →</Link>
    </aside>}
    <div className={s.app}>
      <div className={s.previewLabel}>학부모 화면 시안 · 모든 내용은 예시입니다</div>
      <header className={s.header}>
        <span className={s.brand}><span className={s.logo} aria-hidden="true" />티처스 수학학원</span>
        <div className={s.headerRight}>
          {!embedded && <button className={s.bellButton} aria-label={`알림 ${unreadCount}건`} onClick={() => selectTab('notices')}>
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z" /><path d="M10 19a2 2 0 0 0 4 0" /></svg>
            {unreadCount > 0 && <span className={s.badge}>{unreadCount}</span>}
          </button>}
          <span className={s.parentName}>김민준 학부모님</span>
        </div>
      </header>
      <main className={s.main}>
        {tab === 'home' && <>
          <div className={s.heading}><div><p>우리 아이의</p><h2>최근 수업기록</h2></div></div>
          <ChildSegment childIndex={childIndex} onChange={index => { setChildIndex(index); onAction?.('child') }} />
          <RecordCard lesson={lessons[0]} className={children[childIndex].class} withFeedback home onComment={() => onAction?.('comment')} />
          <div className={s.cardActions}>
            <button type="button" onClick={() => { if (!embedded) setAttendanceOpen(true); onAction?.('attendance') }}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              지각·결석 등록
            </button>
            <button type="button" onClick={() => selectTab('inquiries')}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-11.9 7.8L4 21l1.7-5A8.5 8.5 0 1 1 21 11.5Z" /></svg>
              문의하기
            </button>
          </div>
          {attendanceSaved && <p role="status" className={s.attendanceSaved}>{children[childIndex].name} 학생의 {attendanceType === 'absence' ? '결석' : '지각'}을 등록한 예시입니다.</p>}
          <button className={s.scheduleCard} onClick={() => selectTab('schedule')}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 9h16M8 3v4M16 3v4" /></svg>
            <span><strong>이번주 학원일정</strong><small>9.28(월) 정기고사 안내 외 1건</small></span>
            <span aria-hidden="true">›</span>
          </button>
        </>}
        {tab === 'records' && <>
          <ChildSegment childIndex={childIndex} onChange={index => { setChildIndex(index); onAction?.('child') }} />
          <div className={s.statsHeader}><span className={s.avatar}>{children[childIndex].name[0]}</span><div><strong>{children[childIndex].name}</strong><small>수업기록 {lessons.length}개</small></div><button type="button" className={s.statsToggle} onClick={() => { setShowStats(value => !value); onAction?.(showStats ? 'records' : 'stats') }}>{showStats ? '기록 보기' : '통계 보기'}</button></div>
          {showStats ? <HomeworkStatsView recs={statRecords} showMilestone={false} /> : <>
          <p className={s.sectionNote}>{children[childIndex].class} · 최근 수업</p>
          {lessons.map(lesson => <RecordCard key={lesson.date} lesson={lesson} className={children[childIndex].class} />)}
          </>}
        </>}
        {tab === 'notices' && <>
          <div className={s.heading}><div><p>학원에서 보낸</p><h2>공지</h2></div></div>
          <section className={s.plainCard}><span className={s.date}>9월 25일 · 수학 정규반</span><h3>다음 수업 준비물 안내</h3><p>개념원리 교재와 오답 노트를 챙겨주세요.</p></section>
        </>}
        {tab === 'schedule' && <>
          <div className={s.heading}><div><p>이번 달</p><h2>학원일정</h2></div></div>
          <section className={s.plainCard}><span className={s.date}>9월 28일 · 월요일</span><h3>수학 정규반</h3><p>오후 5:00–7:00 · 2강의실</p></section>
        </>}
        {tab === 'inquiries' && <>
          <div className={s.heading}><div><p>선생님과 나눈</p><h2>문의</h2></div></div>
          <section className={s.plainCard}><span className={s.date}>9월 20일 문의</span><h3>보충 수업 일정 문의</h3><p>답변 완료 · &ldquo;다음 주 화요일 오후 4시에 가능합니다.&rdquo;</p></section>
        </>}
      </main>
      {attendanceOpen && <div className={s.modalBackdrop} onClick={() => setAttendanceOpen(false)}><div className={s.attendanceModal} role="dialog" aria-modal="true" aria-label="지각·결석 등록 예시" onClick={event => event.stopPropagation()}><div className={s.modalHead}><strong>지각·결석 등록</strong><button type="button" aria-label="닫기" onClick={() => setAttendanceOpen(false)}>×</button></div><p>{children[childIndex].name} 학생</p><div className={s.attendanceChoices}><button type="button" aria-pressed={attendanceType === 'absence'} onClick={() => setAttendanceType('absence')}>결석</button><button type="button" aria-pressed={attendanceType === 'late'} onClick={() => setAttendanceType('late')}>지각</button></div><label>날짜<input type="date" defaultValue="2026-09-28" /></label><label>사유 (선택)<textarea rows={2} placeholder="예) 감기몸살로 결석합니다" /></label><button type="button" className={s.saveAttendance} onClick={() => { setAttendanceSaved(true); setAttendanceOpen(false) }}>등록하기</button></div></div>}
      <nav className={s.nav} aria-label="학부모 메뉴">{tabs.map(item => (
        <button key={item.id} aria-current={tab === item.id ? 'page' : undefined} onClick={() => selectTab(item.id)}><NavIcon tab={item.id} /><span>{item.label}</span></button>
      ))}</nav>
    </div>
  </div>
}
