'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { kstNow } from '@/lib/kst'
import { computeStreak, COUPON_MILESTONES } from '@/lib/streak'
import { nextClassDate, formatClassDate } from '@/lib/nextClass'
import TodayClassBanner from '@/components/TodayClassBanner'
import StreakCouponPrompt from '@/components/StreakCouponPrompt'
import GrowthIllustration from '@/components/streak-preview/GrowthIllustration'
import { IconCalendar, IconClipboard, IconInbox } from '@/components/icons'

// 새 학생 시안(streak-preview/student-v2)의 정확한 색상을 그대로 사용한다 — 사이트 테마 토큰
// 대신 이 화면만의 고정 팔레트로, 홈 화면이 실제로 새 디자인처럼 보이게 한다.
const tx = '#203F30', tx2 = '#6A7B6E', tx3 = '#768478'
const bd = '#DDE8DF', bg = '#E9EFEA', re = '#C2483C'
const accent = '#347653', accentText = '#326244', linkText = '#456650'
const growthBg = '#EDF4EB', growthText = '#2A5338'
const segActive = '#1C5939'

type Rec = { id: number; date: string; content: string; homework: string; hw_rate: number; hw_cor: number; class_id: number | null }
type ClassInfo = { id: number; name: string; days: string; time: string | null }
type EventRow = { id: number; title: string; start_date: string }

function formatEventDate(ds: string): string {
  const d = new Date(ds + 'T00:00:00')
  const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
  return `${d.getMonth() + 1}.${d.getDate()}(${dow})`
}

// 학생 홈 — 자주 보는 화면(이번 숙제·다음 수업·수업기록 바로가기·연속 이행 요약·학원일정 요약)을
// 한 화면에 모았다. 하단 탭은 홈/시험/학원일정/공지/쿠폰함 다섯 개뿐이라, 수업기록은 여기
// "관련 수업기록 보기"로 들어간다.
export default function StudentHome() {
  const { student } = useAuth()
  const router = useRouter()
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [classIndex, setClassIndex] = useState(0)
  const [latestByClass, setLatestByClass] = useState<Record<number, Rec>>({})
  const [nextByClass, setNextByClass] = useState<Record<number, { date: Date | null; cancelledDate: string | null }>>({})
  const [streak, setStreak] = useState(0)
  const [chronoRecs, setChronoRecs] = useState<{ date: string; hw_rate: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [upcomingEvents, setUpcomingEvents] = useState<EventRow[]>([])

  useEffect(() => {
    const today = kstNow()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    supabase.from('events').select('id,title,start_date')
      .eq('student_visible', true).gte('start_date', todayStr)
      .order('start_date', { ascending: true }).limit(2)
      .then(({ data }) => setUpcomingEvents((data ?? []) as EventRow[]))
  }, [])

  async function load(studentId: number, token: string, isActive: () => boolean) {
    setLoading(true)
    const { data: csRows } = await supabase.rpc('client_class_students', { p_token: token, p_student_id: studentId })
    if (!isActive()) return
    const classIds = [...new Set(((csRows ?? []) as { class_id: number }[]).map(r => r.class_id))]
    if (classIds.length === 0) { setClasses([]); setLoading(false); return }

    const [{ data: classesData }, { data: recsRaw }] = await Promise.all([
      supabase.from('classes').select('id,name,days,time').in('id', classIds),
      supabase.rpc('client_records', { p_token: token, p_student_id: studentId }),
    ])
    if (!isActive()) return
    const recs = (recsRaw ?? []) as Rec[]

    const today = kstNow()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const { data: cancelRows } = await supabase
      .from('class_cancellations').select('class_id,cancel_date')
      .in('class_id', classIds).gte('cancel_date', todayStr)
    if (!isActive()) return
    const cancelSets: Record<number, Set<string>> = {}
    for (const row of (cancelRows ?? []) as { class_id: number; cancel_date: string }[]) {
      (cancelSets[row.class_id] ??= new Set()).add(row.cancel_date)
    }

    const latest: Record<number, Rec> = {}
    for (const r of recs) {
      if (r.class_id != null && !(r.class_id in latest)) latest[r.class_id] = r
    }

    const next: Record<number, { date: Date | null; cancelledDate: string | null }> = {}
    for (const c of (classesData ?? []) as ClassInfo[]) {
      const cancelled = cancelSets[c.id] ?? new Set<string>()
      const nd = nextClassDate(c.days, cancelled, today)
      // 원래대로라면(휴강 없이) 돌아왔을 가장 이른 날짜가 취소돼 있으면 그 날짜를 함께 보여준다.
      let cancelledDate: string | null = null
      const raw = nextClassDate(c.days, new Set(), today)
      if (raw) {
        const ds = `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, '0')}-${String(raw.getDate()).padStart(2, '0')}`
        if (cancelled.has(ds)) cancelledDate = formatClassDate(raw)
      }
      next[c.id] = { date: nd, cancelledDate }
    }

    setClasses((classesData ?? []) as ClassInfo[])
    setLatestByClass(latest)
    setNextByClass(next)
    const chrono = [...recs].reverse().map(r => ({ date: r.date, hw_rate: r.hw_rate }))
    setChronoRecs(chrono)
    setStreak(computeStreak(chrono).current)
    setLoading(false)
  }

  useEffect(() => {
    if (!student?.studentId || !student?.sessionToken) return
    let active = true
    queueMicrotask(() => { if (active) void load(student.studentId, student.sessionToken, () => active) })
    return () => { active = false }
  }, [student?.studentId, student?.sessionToken])

  const cls = classes[classIndex]
  const rec = cls ? latestByClass[cls.id] : undefined
  const next = cls ? nextByClass[cls.id] : undefined
  const stage = Math.max(0, COUPON_MILESTONES.filter(d => d <= streak).length - 1)

  return (
    <div>
      {student?.studentId && <StreakCouponPrompt studentId={student.studentId} sessionToken={student.sessionToken} chronoRecs={chronoRecs} />}
      <TodayClassBanner studentId={student?.studentId ?? null} sessionToken={student?.sessionToken} />

      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 11, color: tx3, margin: '0 0 4px' }}>오늘도 차근차근</p>
        <p style={{ fontSize: 20, fontWeight: 700, color: tx, margin: 0 }}>이번 숙제</p>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: tx3, padding: '40px 0' }}>불러오는 중...</p>
      ) : classes.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: '60px 0', textAlign: 'center', color: tx3 }}>
          <p style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><IconInbox size={28} /></p>
          <p style={{ fontSize: 14 }}>등록된 반이 없습니다</p>
        </div>
      ) : <>
        {classes.length > 1 && (
          <div style={{ display: 'flex', gap: 4, background: bg, padding: 4, borderRadius: 9, marginBottom: 18 }}>
            {classes.map((c, i) => (
              <button key={c.id} onClick={() => setClassIndex(i)} style={{
                flex: 1, minHeight: 40, border: 0, borderRadius: 6, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                fontWeight: classIndex === i ? 700 : 500, color: classIndex === i ? segActive : tx2,
                background: classIndex === i ? '#fff' : 'transparent', boxShadow: classIndex === i ? '0 1px 4px rgba(0,0,0,.05)' : 'none',
              }}>{c.name}</button>
            ))}
          </div>
        )}

        <section style={{ background: '#fff', border: `1px solid ${bd}`, borderTop: `3px solid ${accent}`, borderRadius: 13, padding: '20px 18px 4px', marginBottom: 14 }}>
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: tx2, margin: 0 }}>
              다음 수업 <strong style={{ color: accentText, fontWeight: 600 }}>{next?.date ? formatClassDate(next.date) : '일정 없음'}{cls?.time ? ` ${cls.time.split('~')[0]?.trim()}` : ''}</strong>까지
            </p>
            {next?.cancelledDate && (
              <p style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#8B6A6A', margin: '6px 0 0' }}>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m8 8 8 8" /></svg>
                {next.cancelledDate} 수업은 <b style={{ color: re, fontWeight: 600 }}>휴강</b>이에요
              </p>
            )}
          </div>
          <p style={{ whiteSpace: 'pre-line', fontSize: 14, lineHeight: 1.95, color: tx, margin: '0 0 4px', wordBreak: 'keep-all' }}>
            {rec?.homework || '등록된 숙제가 없습니다'}
          </p>
          {rec && <div style={{ display: 'flex', gap: 16, padding: '12px 0', fontSize: 11, color: tx2 }}>
            <span>숙제 이행률 <b style={{ color: accentText }}>{rec.hw_rate >= 0 ? `${rec.hw_rate}%` : '기록 없음'}</b></span>
            <span>정답률 <b style={{ color: accentText }}>{rec.hw_cor >= 0 ? `${rec.hw_cor}%` : '기록 없음'}</b></span>
          </div>}
          <button onClick={() => router.push('/student/records')} style={{
            width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 48,
            border: 0, borderTop: `1px solid ${bd}`, background: 'none', color: linkText, fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
          }}>수업기록 보기 <span>→</span></button>
        </section>

        <button onClick={() => router.push('/student/tests')} style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 46,
          background: '#fff', border: `1px solid ${bd}`, borderRadius: 10, color: tx2, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', marginBottom: 14,
        }}>
          <IconClipboard size={16} />확인할 시험
        </button>

        <button onClick={() => router.push('/student/schedule')} style={{
          width: '100%', border: `1px solid ${bd}`, background: '#fff', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 15px', marginBottom: 14, color: tx, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
        }}>
          <span style={{ flexShrink: 0, color: tx2, display: 'flex' }}><IconCalendar size={20} /></span>
          <span style={{ flex: 1 }}>
            <strong style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>학원일정 확인하기</strong>
            <small style={{ display: 'block', fontSize: 10, color: tx3, marginTop: 5 }}>
              {upcomingEvents.length === 0
                ? '예정된 일정이 없어요'
                : `${formatEventDate(upcomingEvents[0].start_date)} ${upcomingEvents[0].title}${upcomingEvents.length > 1 ? ` 외 ${upcomingEvents.length - 1}건` : ''}`}
            </small>
          </span>
          <span aria-hidden="true">›</span>
        </button>

        <button onClick={() => router.push('/student/growth')} style={{
          width: '100%', border: `1px solid ${bd}`, background: growthBg, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 15px', color: growthText, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
        }}>
          <GrowthIllustration kind="tree" stage={stage} current />
          <span style={{ flex: 1 }}>
            <strong style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{streak}일 연속 숙제 이행</strong>
            <small style={{ display: 'block', fontSize: 10, color: tx3, marginTop: 5 }}>차곡차곡 쌓인 나의 학습 습관</small>
          </span>
          <span aria-hidden="true">›</span>
        </button>
      </>}
    </div>
  )
}
