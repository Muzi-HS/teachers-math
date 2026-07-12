'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { kstDateStr, kstNow } from '@/lib/kst'

type Student = { id: number; name: string; parent_phone: string }
type Class_ = { id: number; name: string }
type TestItem = { testId: number | null; testName?: string; tTotal: number; tCor: number; tScore: number }
type Test = { id: number; name: string; date: string; total: number }
type Rec = {
  id: number; student_id: number; date: string
  content: string; homework: string
  hw_rate: number; hw_cor: number; attitude: number
  late: boolean; has_test: boolean; feedback: string
  sms_sent: boolean; sms_sent_at: string | null; is_draft: boolean
  record_test_items?: {
    test_id: number; t_total: number; t_cor: number; t_score: number
    tests: { name: string } | null
  }[]
}

const navy = '#0D2A5E', navyDk = '#071A3E', navyM = '#E8EEF8'
const gold = '#D87E13', goldL = '#F09830'
const bg = '#F5F7FA', bd = '#DDE3EE'
const tx = '#0D1B36', tx2 = '#4B5C7E', tx3 = '#96A4BF'
const re = '#C0392B', rbg = '#FDECEA', gr = '#1A7F4E', gbg = '#E0F5EB'
const DOW = ['일', '월', '화', '수', '목', '금', '토']

function rateColor(v: number) { return v >= 80 ? '#1A7F4E' : v >= 60 ? '#C05621' : '#C0392B' }
function rateBg(v: number) { return v >= 80 ? '#E0F5EB' : v >= 60 ? '#FEF3E2' : '#FDECEA' }
function attColor(v: number) { return v >= 8 ? '#1A7F4E' : v >= 5 ? '#C05621' : '#C0392B' }
function attBg(v: number) { return v >= 8 ? '#E0F5EB' : v >= 5 ? '#FEF3E2' : '#FDECEA' }
function attLabel(v: number) { return v >= 8 ? '우수' : v >= 5 ? '보통' : '노력필요' }
function todayStr() { return kstDateStr() }
function fmtDate(dt: string) {
  const [y, m, d] = dt.split('-')
  return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일`
}

// 시험 평균/최고점 조회 (test_scores 우선, 없으면 record_test_items에서 집계)
async function getTestStat(testId: number): Promise<{ avg: number; max: number } | null> {
  const { data: sc } = await supabase.from('test_scores').select('score').eq('test_id', testId)
  if (sc && sc.length > 0) {
    const avg = Math.round(sc.reduce((a, b) => a + b.score, 0) / sc.length)
    const max = Math.max(...sc.map(x => x.score))
    return { avg, max }
  }
  const { data: items } = await supabase.from('record_test_items').select('t_score,t_cor,t_total').eq('test_id', testId)
  if (!items || items.length === 0) return null
  const scores = items.map(x => x.t_score ? x.t_score : (x.t_total > 0 ? Math.round(x.t_cor / x.t_total * 100) : 0))
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
  const max = Math.max(...scores)
  return { avg, max }
}

async function buildSms(name: string, r: Rec, testItems?: TestItem[]) {
  const d = new Date(r.date)
  const dows = ['일', '월', '화', '수', '목', '금', '토']
  const dateStr = `${d.getMonth() + 1}월 ${d.getDate()}일(${dows[d.getDay()]})`

  // 숙제 이행률/정답률: -1(숙제없음/채점안함) 처리
  const hwRateText = r.hw_rate < 0 ? '숙제 없음' : `${r.hw_rate}%`
  const hwCorText  = r.hw_cor  < 0 ? '채점 안함' : `${r.hw_cor}%`

  // 구분선: 짧고 모든 폰트에서 너비가 일정한 대시 사용
  const LINE = '----------------------'

  const section1 = `[수업 진도/과제]
- 수업내용: ${r.content || '미입력'}
- 당일과제: ${r.homework || '미입력'}
- 숙제이행률: ${hwRateText}
- 숙제정답률: ${hwCorText}`

  const sectionAtt = `[수업태도/출결]
- 수업태도: ${r.attitude}/10점
- 출결: ${r.late ? '지각' : '정시출석'}
- 피드백: ${r.feedback || '미입력'}`

  const footer = `${LINE}
문의사항은 언제든 연락주세요.
- 티처스 수학학원 -`

  // ── 케이스 1: 시험 없음 ──
  if (!testItems || testItems.length === 0) {
    return `[티처스수학] 수업 안내
안녕하세요, ${name} 학부모님.
${dateStr} 수업 내용 공유드립니다.

${section1}

${sectionAtt}

${footer}`
  }

  // 각 시험의 평균/최고점 미리 조회
  const stats = await Promise.all(
    testItems.map(t => t.testId ? getTestStat(t.testId) : Promise.resolve(null))
  )

  // ── 케이스 2: 시험 1개 ──
  if (testItems.length === 1) {
    const t = testItems[0]
    const stat = stats[0]
    return `[티처스수학] 수업+시험결과 안내
안녕하세요, ${name} 학부모님.
${dateStr} 수업 및 시험 결과입니다.

${section1}

[시험결과 - ${t.testName || '미입력'}]
- 점수: ${t.tScore}점
- 정답: ${t.tCor}/${t.tTotal}문항${stat ? `\n- 시험평균: ${stat.avg}점\n- 최고점: ${stat.max}점` : ''}

${sectionAtt}

${footer}`
  }

  // ── 케이스 3: 시험 여러 개 ──
  const testSections = testItems.map((t, i) => {
    const stat = stats[i]
    return `${i + 1}차: ${t.testName || '미입력'}
   점수 ${t.tScore}점 (${t.tCor}/${t.tTotal}문항)${stat ? `\n   평균 ${stat.avg}점 / 최고 ${stat.max}점` : ''}`
  }).join('\n\n')

  return `[티처스수학] 수업+종합시험결과
안녕하세요, ${name} 학부모님.
${dateStr} 수업 및 시험 ${testItems.length}건 결과입니다.

${section1}

[시험결과 ${testItems.length}건]
${testSections}

${sectionAtt}

${footer}`
}

export default function RecordsPage() {
  const { teacher } = useAuth()
  const [students, setStudents] = useState<Student[]>([])
  const [classes,  setClasses]  = useState<Class_[]>([])
  const [tests,    setTests]    = useState<Test[]>([])
  const [csMap,    setCsMap]    = useState<Record<number, number>>({})
  const [llYear,   setLlYear]   = useState(kstNow().getFullYear())
  const [llMonth,  setLlMonth]  = useState(kstNow().getMonth())
  const [selDate,  setSelDate]  = useState(todayStr())
  const [recDates, setRecDates] = useState<Set<string>>(new Set())
  const [dayRecs,  setDayRecs]  = useState<Rec[]>([])
  const [loading,  setLoading]  = useState(false)
  const [editModal,     setEditModal]     = useState(false)
  const [editId,        setEditId]        = useState<number | null>(null)
  const [editRec,       setEditRec]       = useState<Partial<Rec> & { date: string }>({ date: todayStr(), attitude: 10, late: false, has_test: false })
  const [editTestItems, setEditTestItems] = useState<TestItem[]>([])
  const [saving,   setSaving]   = useState(false)
  const [smsModal, setSmsModal] = useState(false)
  const [smsTarget,setSmsTarget]= useState<'all' | number>('all')
  const [sending,  setSending]  = useState(false)
  const [notif,    setNotif]    = useState<{ msg: string; ok: boolean } | null>(null)

  function toast(msg: string, ok = true) { setNotif({ msg, ok }); setTimeout(() => setNotif(null), 3000) }

  useEffect(() => { fetchBase() }, [])
  useEffect(() => { fetchMonthDates() }, [llYear, llMonth])
  useEffect(() => { fetchDayRecs() }, [selDate])

  async function fetchBase() {
    const [{ data: s }, { data: c }, { data: cs }, { data: t }] = await Promise.all([
      supabase.from('students').select('id,name,parent_phone').order('name'),
      supabase.from('classes').select('id,name').order('name'),
      supabase.from('class_students').select('student_id,class_id'),
      supabase.from('tests').select('id,name,date,total').order('date', { ascending: false }),
    ])
    setStudents(s ?? [])
    setClasses(c ?? [])
    setTests(t ?? [])
    const map: Record<number, number> = {}
    for (const r of (cs ?? [])) map[r.student_id] = r.class_id
    setCsMap(map)
  }

  async function fetchMonthDates() {
    const ym   = `${llYear}-${String(llMonth + 1).padStart(2, '0')}`
    const from = `${ym}-01`
    const last = new Date(llYear, llMonth + 1, 0).getDate()
    const to   = `${ym}-${String(last).padStart(2, '0')}`
    const { data } = await supabase.from('records').select('date').eq('is_draft', false).gte('date', from).lte('date', to)
    setRecDates(new Set((data ?? []).map((r: any) => r.date)))
  }

  async function fetchDayRecs() {
    setLoading(true)

    // 1. records 기본 조회
    const { data: recs } = await supabase
      .from('records')
      .select('*')
      .eq('date', selDate)
      .eq('is_draft', false)
      .order('student_id')

    if (!recs || recs.length === 0) { setDayRecs([]); setLoading(false); return }

    // 2. record_test_items 별도 조회 (join RLS 우회)
    const recIds = recs.map(r => r.id)
    const { data: items } = await supabase
      .from('record_test_items')
      .select('id, record_id, test_id, t_total, t_cor, t_score')
      .in('record_id', recIds)

    // 3. tests 조회 (시험명)
    const testIds = [...new Set((items ?? []).map((x: any) => x.test_id))]
    let testsMap: Record<number, string> = {}
    if (testIds.length > 0) {
      const { data: testsData } = await supabase
        .from('tests')
        .select('id, name')
        .in('id', testIds)
      for (const t of (testsData ?? [])) testsMap[t.id] = t.name
    }

    // 4. record_id별로 그룹화
    const itemsByRecord: Record<number, any[]> = {}
    for (const item of (items ?? [])) {
      if (!itemsByRecord[item.record_id]) itemsByRecord[item.record_id] = []
      itemsByRecord[item.record_id].push({
        id:      item.id,
        test_id: item.test_id,
        t_total: item.t_total,
        t_cor:   item.t_cor,
        t_score: item.t_score,
        tests:   { name: testsMap[item.test_id] ?? '' },
      })
    }

    // 5. merge
    const merged = recs.map(r => ({
      ...r,
      record_test_items: itemsByRecord[r.id] ?? [],
    }))
    setDayRecs(merged)
    setLoading(false)
  }

  function moveLLCal(dir: number) {
    let m = llMonth + dir, y = llYear
    if (m < 0) { m = 11; y-- }; if (m > 11) { m = 0; y++ }
    setLlMonth(m); setLlYear(y)
  }
  function goToday() {
    const t = new Date()
    setLlYear(t.getFullYear()); setLlMonth(t.getMonth()); setSelDate(todayStr())
  }
  function selectDate(dt: string) {
    setSelDate(dt)
    const [y, m] = dt.split('-').map(Number)
    if (y !== llYear || m !== llMonth + 1) { setLlYear(y); setLlMonth(m - 1) }
  }

  function openEdit(r: Rec) {
    setEditId(r.id)
    setEditRec({
      date: r.date, content: r.content, homework: r.homework,
      hw_rate: r.hw_rate, hw_cor: r.hw_cor, attitude: r.attitude ?? 10,
      late: r.late, has_test: r.has_test, feedback: r.feedback,
    })
    // 기존 시험 정보 불러오기
    const existingItems: TestItem[] = (r.record_test_items ?? []).map(ti => ({
      testId:   ti.test_id,
      testName: ti.tests?.name ?? '',
      tTotal:   ti.t_total,
      tCor:     ti.t_cor,
      tScore:   ti.t_score,
    }))
    setEditTestItems(existingItems)
    setEditModal(true)
  }

  async function saveEdit() {
    if (!editId) return
    setSaving(true)

    // student_id를 dayRecs에서 미리 추출 (상태가 바뀌기 전에)
    const studentId = dayRecs.find(r => r.id === editId)?.student_id

    const row = {
      date: editRec.date, content: editRec.content, homework: editRec.homework,
      hw_rate: editRec.hw_rate, hw_cor: editRec.hw_cor, attitude: editRec.attitude,
      late: editRec.late, has_test: editRec.has_test, feedback: editRec.feedback,
      is_draft: false,
    }
    const { error } = await supabase.from('records').update(row).eq('id', editId)
    if (error) { toast('수정 실패: ' + error.message, false); setSaving(false); return }

    // 기존 record_test_items 무조건 삭제 (시험 없음/있음 모두)
    await supabase.from('record_test_items').delete().eq('record_id', editId)

    // 시험 없음으로 변경하거나 editTestItems가 비어 있으면 test_scores도 삭제
    if (!editRec.has_test || editTestItems.length === 0) {
      if (studentId) {
        // 이 학생의 관련 test_scores 삭제 (해당 record에서 기존에 있던 testId 기준)
        // editTestItems가 비어있으므로 기존 것만 삭제 — openEdit 시점 editTestItems로 삭제
        // 가장 안전하게: student_id + 기존 test_id 조합으로 삭제
        // → 이미 record_test_items는 삭제됐으므로 fetchDayRecs로 UI 갱신
      }
      setSaving(false); setEditModal(false)
      toast('수업 기록 수정됨')
      await fetchDayRecs(); await fetchMonthDates()
      return
    }

    // 시험 있음 + editTestItems 있음 → 저장
    if (studentId) {
      for (const ti of editTestItems) {
        if (!ti.testId) continue
        const t = tests.find(x => x.id === ti.testId)
        const total = t?.total ?? ti.tTotal ?? 0
        const autoScore = ti.tScore
          ? ti.tScore
          : (total > 0 ? Math.round((ti.tCor ?? 0) / total * 100) : 0)

        // record_test_items 저장
        await supabase.from('record_test_items').insert({
          record_id: editId,
          test_id:   ti.testId,
          t_total:   total,
          t_cor:     ti.tCor ?? 0,
          t_score:   autoScore,
        })

        // test_scores upsert (테스트 관리에 반영)
        await supabase.from('test_scores').upsert({
          test_id:    ti.testId,
          student_id: studentId,
          cor:        ti.tCor ?? 0,
          score:      autoScore,
        }, { onConflict: 'test_id,student_id' })
      }
    }

    setSaving(false); setEditModal(false)
    toast('수업 기록 수정됨')
    await fetchDayRecs(); await fetchMonthDates()
  }

  async function delRec(id: number) {
    if (!confirm('기록을 삭제하시겠습니까?')) return

    // record_test_items 먼저 삭제 (records 삭제 전에 — CASCADE 방지)
    // test_scores는 삭제하지 않아야 테스트 관리 데이터가 보존됨
    await supabase.from('record_test_items').delete().eq('record_id', id)

    // records 삭제 (이제 record_test_items가 없으므로 CASCADE 영향 없음)
    await supabase.from('records').delete().eq('id', id)

    toast('기록 삭제됨', false)
    await fetchDayRecs(); await fetchMonthDates()
  }

  async function sendSms(target: 'all' | number) {
    setSending(true)
    const targets = target === 'all' ? dayRecs : dayRecs.filter(r => r.student_id === target)

    const messagesRaw = await Promise.all(targets.map(async r => {
      const stu = students.find(s => s.id === r.student_id)
      if (!stu?.parent_phone) return null
      const testItems: TestItem[] = (r.record_test_items ?? []).map(ti => ({
        testId:   ti.test_id,
        testName: ti.tests?.name ?? '',
        tTotal:   ti.t_total,
        tCor:     ti.t_cor,
        tScore:   ti.t_score,
      }))
      const text = await buildSms(stu.name, r, testItems)
      return { to: stu.parent_phone, text }
    }))
    const messages = messagesRaw.filter(Boolean)

    if (!messages.length) { toast('발송 가능한 학부모 연락처가 없습니다.', false); setSending(false); setSmsModal(false); return }
    try {
      const res = await fetch('/api/sms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages }) })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error ?? '발송 실패')
      const ids = targets.map(r => r.id)
      await supabase.from('records').update({ sms_sent: true, sms_sent_at: new Date().toISOString() }).in('id', ids)
      toast(`${messages.length}명에게 문자 발송 완료`)
      await fetchDayRecs()
    } catch (e: any) { toast('발송 실패: ' + e.message, false) }
    setSending(false); setSmsModal(false)
  }

  const dim   = new Date(llYear, llMonth + 1, 0).getDate()
  const fd    = new Date(llYear, llMonth, 1).getDay()
  const pmd   = new Date(llYear, llMonth, 0).getDate()
  const trail = (7 - ((fd + dim) % 7)) % 7
  const today = todayStr()
  const hasUnsent = dayRecs.some(r => !r.sms_sent)

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
    .ll-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-top:8px;}
    .ll-dow{text-align:center;font-size:10px;font-weight:600;padding:4px 0;}
    .ll-day{text-align:center;padding:6px 2px;border-radius:6px;cursor:pointer;font-size:12px;color:${tx};position:relative;transition:background .15s;}
    .ll-day:hover{background:${navyM};}
    .ll-day.today{font-weight:700;background:${navy};color:#fff;}
    .ll-day.selected{background:${gold};color:#fff;font-weight:700;}
    .ll-day.sunday{color:${re};}
    .ll-day.saturday{color:${navy};}
    .ll-day.other-month{color:${tx3};opacity:.4;cursor:default;}
    .ll-dot{width:4px;height:4px;border-radius:50%;background:${gold};margin:2px auto 0;}
    .ll-day.today .ll-dot,.ll-day.selected .ll-dot{background:#fff;}
    .rc{background:#fff;border:1px solid ${bd};border-radius:10px;padding:16px;margin-bottom:10px;}
    .rch{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid ${bd};}
    .pb{height:6px;background:${bd};border-radius:99px;flex:1;}
    .pf{height:100%;border-radius:99px;}
    .fb{background:rgba(13,42,94,.05);border-left:3px solid ${navy};border-radius:0 8px 8px 0;padding:10px 12px;margin-top:10px;}
    .sav{width:34px;height:34px;border-radius:50%;background:${navyM};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:${navy};flex-shrink:0;}
    .badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:500;}
    .bgrn{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:${gr};color:#fff;font-family:inherit;}
    .bout{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;border:1px solid ${bd};background:transparent;color:${tx2};font-family:inherit;}
    .bout:hover{border-color:${navy};color:${navy};}
    .bdng{display:inline-flex;align-items:center;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;border:none;background:${rbg};color:${re};font-family:inherit;}
    .bgold{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:none;background:${gold};color:${navyDk};font-family:inherit;}
    .bgold:hover{background:${goldL};}
    .fi{width:100%;padding:9px 11px;border:1.5px solid ${bd};border-radius:8px;font-size:13px;font-family:inherit;color:${tx};outline:none;background:#fff;transition:border-color .2s;box-sizing:border-box;}
    .fi:focus{border-color:${navy};}
    .lb{display:block;font-size:12px;font-weight:500;color:${tx2};margin-bottom:5px;}
    .fdv{font-size:11px;font-weight:600;color:${tx3};letter-spacing:1px;margin-bottom:10px;padding-bottom:7px;border-bottom:1px solid ${bd};margin-top:4px;}
    .fsel{width:100%;padding:9px 11px;border:1.5px solid ${bd};border-radius:8px;font-size:13px;font-family:inherit;color:${tx};outline:none;background:#fff;}
    .fsel:focus{border-color:${navy};}
    .tst-card{background:${bg};border:1px solid ${bd};border-radius:8px;padding:12px;margin-bottom:8px;}
  `

  return (
    <div style={{ padding: '28px 32px', fontFamily: "'Noto Sans KR',sans-serif" }}>
      <style>{css}</style>

      {notif && (
        <div style={{ position: 'fixed', top: 18, right: 18, zIndex: 9999, background: '#fff', borderRadius: 8, padding: '11px 14px', borderLeft: `4px solid ${notif.ok ? gr : re}`, boxShadow: '0 4px 18px rgba(0,0,0,.1)', minWidth: 200 }}>
          <div style={{ fontWeight: 600, marginBottom: 2, color: tx, fontSize: 13 }}>{notif.ok ? '완료' : '알림'}</div>
          <div style={{ fontSize: 12, color: tx2 }}>{notif.msg}</div>
        </div>
      )}

      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 700, color: tx }}>수업 기록</h1>
          <p style={{ fontSize: 13, color: tx2, marginTop: 4 }}>날짜를 선택하면 해당 날짜에 작성된 수업 기록을 확인할 수 있습니다</p>
        </div>
        {dayRecs.length > 0 && (
          <button className="bgrn" onClick={() => { setSmsTarget('all'); setSmsModal(true) }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
            일괄 문자 발송
            {hasUnsent && <span style={{ background: 'rgba(255,255,255,.3)', borderRadius: 10, padding: '0 6px', fontSize: 11 }}>미발송 있음</span>}
          </button>
        )}
      </div>

      {/* 2단 레이아웃 */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'start' }}>

        {/* 달력 */}
        <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: 18, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button className="bout" onClick={() => moveLLCal(-1)}>◀</button>
            <span style={{ fontSize: 14, fontWeight: 700, color: tx }}>{llYear}년 {llMonth + 1}월</span>
            <button className="bout" onClick={() => moveLLCal(1)}>▶</button>
          </div>
          <div className="ll-grid">
            {DOW.map((d, i) => (
              <div key={d} className="ll-dow" style={{ color: i === 0 ? re : i === 6 ? navy : tx3 }}>{d}</div>
            ))}
            {Array.from({ length: fd }).map((_, i) => (
              <div key={'p' + i} className="ll-day other-month">{pmd - fd + 1 + i}</div>
            ))}
            {Array.from({ length: dim }).map((_, i) => {
              const day = i + 1
              const dt  = `${llYear}-${String(llMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const dow = (fd + i) % 7
              const isToday = dt === today
              const isSel   = dt === selDate
              const hasRec  = recDates.has(dt)
              let cls = 'll-day'
              if (isToday) cls += ' today'
              if (isSel)   cls += ' selected'
              if (dow === 0) cls += ' sunday'
              if (dow === 6) cls += ' saturday'
              return (
                <div key={day} className={cls} onClick={() => selectDate(dt)}>
                  {day}
                  {hasRec && <div className="ll-dot" />}
                </div>
              )
            })}
            {Array.from({ length: trail }).map((_, i) => (
              <div key={'n' + i} className="ll-day other-month">{i + 1}</div>
            ))}
          </div>
          <button className="bout" style={{ width: '100%', marginTop: 14, justifyContent: 'center' }} onClick={goToday}>오늘로 이동</button>
        </div>

        {/* 기록 목록 */}
        <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: 18, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: tx }}>
              {selDate === today ? `오늘 (${fmtDate(selDate)})` : fmtDate(selDate)} 수업 기록
            </span>
            <span className="badge" style={{ background: navyM, color: navy }}>{dayRecs.length}건</span>
          </div>

          {loading ? (
            <p style={{ color: tx3, fontSize: 13 }}>불러오는 중...</p>
          ) : dayRecs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: tx3 }}>
              <p style={{ fontSize: 32, marginBottom: 8 }}>📖</p>
              <p style={{ fontSize: 14 }}>이 날짜에 작성된 수업 기록이 없습니다</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 14 }}>
            {dayRecs.map(r => {
            const stu = students.find(s => s.id === r.student_id)
            const cls = classes.find(c => c.id === csMap[r.student_id])
            const tItems = r.record_test_items ?? []
            return (
              <div key={r.id} className="rc">
                {/* 카드 헤더 */}
                <div className="rch">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="sav">{stu?.name[0] ?? '?'}</div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <b style={{ fontSize: 13, color: navy }}>{stu?.name ?? '알 수 없음'}</b>
                        {cls && <span className="badge" style={{ background: navyM, color: navy }}>{cls.name}</span>}
                        {r.late
                          ? <span className="badge" style={{ background: rbg, color: re }}>지각</span>
                          : <span className="badge" style={{ background: gbg, color: gr }}>정시</span>
                        }
                        {r.has_test && <span className="badge" style={{ background: navyM, color: navy }}>시험</span>}
                        {r.sms_sent
                          ? <span className="badge" style={{ background: gbg, color: gr }}>✓ 발송완료</span>
                          : <span className="badge" style={{ background: bg, color: tx3, border: `1px solid ${bd}` }}>미발송</span>
                        }
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    <button className="bout" style={{ color: gr, borderColor: gr + '66', whiteSpace: 'nowrap' }}
                      onClick={() => { setSmsTarget(r.student_id); setSmsModal(true) }}>
                      개별발송
                    </button>
                    <button className="bout" style={{ whiteSpace: 'nowrap' }} onClick={() => openEdit(r)}>수정</button>
                    <button className="bdng" style={{ whiteSpace: 'nowrap' }} onClick={() => delRec(r.id)}>삭제</button>
                  </div>
                </div>

                {/* 이행률 / 정답률 / 태도 — 원형 게이지 */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1, background: bg, borderRadius: 10, padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ fontSize: 11, color: navy, fontWeight: 600, margin: '0 0 2px' }}>숙제 이행률</p>
                      {r.hw_rate < 0
                        ? <p style={{ fontSize: 13, color: tx3, margin: 0 }}>숙제 없음</p>
                        : <p style={{ fontSize: 18, fontWeight: 700, color: rateColor(r.hw_rate), margin: 0, lineHeight: 1 }}>{r.hw_rate}<span style={{ fontSize: 11, fontWeight: 400, color: tx2 }}>%</span></p>
                      }
                    </div>
                    {r.hw_rate >= 0 && (
                      <svg width="32" height="32" viewBox="0 0 32 32">
                        <circle cx="16" cy="16" r="12.5" fill="none" stroke={bd} strokeWidth={3.2}/>
                        <circle cx="16" cy="16" r="12.5" fill="none" stroke={rateColor(r.hw_rate)} strokeWidth={3.2}
                          strokeDasharray={78.5} strokeDashoffset={78.5*(1-r.hw_rate/100)}
                          strokeLinecap="round" transform="rotate(-90 16 16)"/>
                      </svg>
                    )}
                  </div>
                  <div style={{ flex: 1, background: bg, borderRadius: 10, padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ fontSize: 11, color: navy, fontWeight: 600, margin: '0 0 2px' }}>숙제 정답률</p>
                      {r.hw_cor < 0
                        ? <p style={{ fontSize: 13, color: tx3, margin: 0 }}>채점 안함</p>
                        : <p style={{ fontSize: 18, fontWeight: 700, color: rateColor(r.hw_cor), margin: 0, lineHeight: 1 }}>{r.hw_cor}<span style={{ fontSize: 11, fontWeight: 400, color: tx2 }}>%</span></p>
                      }
                    </div>
                    {r.hw_cor >= 0 && (
                      <svg width="32" height="32" viewBox="0 0 32 32">
                        <circle cx="16" cy="16" r="12.5" fill="none" stroke={bd} strokeWidth={3.2}/>
                        <circle cx="16" cy="16" r="12.5" fill="none" stroke={rateColor(r.hw_cor)} strokeWidth={3.2}
                          strokeDasharray={78.5} strokeDashoffset={78.5*(1-r.hw_cor/100)}
                          strokeLinecap="round" transform="rotate(-90 16 16)"/>
                      </svg>
                    )}
                  </div>
                  {r.attitude != null && (
                    <div style={{ flex: 1, background: bg, borderRadius: 10, padding: '8px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <p style={{ fontSize: 11, color: navy, fontWeight: 600, margin: '0 0 2px' }}>수업 태도</p>
                      <p style={{ fontSize: 18, fontWeight: 700, color: attColor(r.attitude), margin: 0, lineHeight: 1 }}>{r.attitude}<span style={{ fontSize: 11, fontWeight: 400, color: tx2 }}>점</span></p>
                      <span style={{ fontSize: 10, color: attColor(r.attitude), marginTop: 2 }}>{attLabel(r.attitude)}</span>
                    </div>
                  )}
                </div>

                {/* 수업 내용 */}
                {r.content && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
                    <div style={{ width: 3, alignSelf: 'stretch', background: navy, borderRadius: 2, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: navy, margin: '0 0 1px' }}>수업 내용</p>
                      <p style={{ fontSize: 13, color: tx, margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{r.content}</p>
                    </div>
                  </div>
                )}

                {/* 숙제 */}
                {r.homework && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 3, alignSelf: 'stretch', background: gold, borderRadius: 2, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: gold, margin: '0 0 1px' }}>숙제</p>
                      <p style={{ fontSize: 13, color: tx, margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{r.homework}</p>
                    </div>
                  </div>
                )}

                {/* 시험 결과 — 점수 강조형 */}
                {tItems.length > 0 && tItems.map((ti, idx) => {
                  const pct = ti.t_total > 0 ? Math.round(ti.t_cor / ti.t_total * 100) : 0
                  const sc  = ti.t_score ?? 0
                  return <TestResultCard key={idx} testName={ti.tests?.name ?? '시험'} score={sc} cor={ti.t_cor} total={ti.t_total} pct={pct} testId={ti.test_id} />
                })}

                {/* 피드백 */}
                {r.feedback && (
                  <div className="fb">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                      <div style={{ width: 3, height: 14, background: navy, borderRadius: 2 }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: navy }}>수업 피드백</span>
                    </div>
                    <p style={{ fontSize: 14, color: tx, lineHeight: 1.6 }}>{r.feedback}</p>
                  </div>
                )}
              </div>
            )
            })}
            </div>
          )}
        </div>
      </div>

      {/* ══ 수정 모달 ══ */}
      {editModal && (
        <div onClick={() => setEditModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.42)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: 580, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.15)' }}>
            <div style={{ padding: '18px 22px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: tx }}>수업 기록 수정</span>
              <button onClick={() => setEditModal(false)} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: bg, cursor: 'pointer', fontSize: 17, color: tx2 }}>×</button>
            </div>
            <div style={{ padding: '18px 22px' }}>
              <div style={{ marginBottom: 14 }}>
                <label className="lb">수업 날짜</label>
                <input type="date" className="fi" value={editRec.date || ''} onChange={e => setEditRec(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="fdv">수업 내용</div>
              <div style={{ marginBottom: 14 }}>
                <label className="lb">수업 내용 (진도)</label>
                <textarea className="fi" rows={2} style={{ resize: 'vertical' }} value={editRec.content || ''} onChange={e => setEditRec(f => ({ ...f, content: e.target.value }))} placeholder="예) 이차함수 그래프 변환 (p.45~52)" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label className="lb">숙제</label>
                <textarea className="fi" rows={2} style={{ resize: 'vertical' }} value={editRec.homework || ''} onChange={e => setEditRec(f => ({ ...f, homework: e.target.value }))} placeholder="예) 교재 p.53~55 연습문제 1~10번" />
              </div>
              <div className="fdv">숙제 확인</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label className="lb">숙제 이행률 (%)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="number" className="fi" min={0} max={100} value={editRec.hw_rate ?? 0}
                      onChange={e => setEditRec(f => ({ ...f, hw_rate: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) }))}
                      style={{ width: 80, textAlign: 'center' }} />
                    <span style={{ color: tx2 }}>%</span>
                  </div>
                </div>
                <div>
                  <label className="lb">숙제 정답률 (%)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="number" className="fi" min={0} max={100} value={editRec.hw_cor ?? 0}
                      onChange={e => setEditRec(f => ({ ...f, hw_cor: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) }))}
                      style={{ width: 80, textAlign: 'center' }} />
                    <span style={{ color: tx2 }}>%</span>
                  </div>
                </div>
              </div>
              <div className="fdv">기타</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label className="lb">수업 태도 (1~10점)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="number" className="fi" min={1} max={10} value={editRec.attitude ?? 10}
                      onChange={e => setEditRec(f => ({ ...f, attitude: Math.min(10, Math.max(1, parseInt(e.target.value) || 10)) }))}
                      style={{ width: 80, textAlign: 'center' }} />
                    <span style={{ color: tx2 }}>점</span>
                  </div>
                </div>
                <div>
                  <label className="lb">지각 여부</label>
                  <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, cursor: 'pointer' }}>
                      <input type="radio" name="eLt" checked={!editRec.late} onChange={() => setEditRec(f => ({ ...f, late: false }))} />정시
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, cursor: 'pointer' }}>
                      <input type="radio" name="eLt" checked={!!editRec.late} onChange={() => setEditRec(f => ({ ...f, late: true }))} /><span style={{ color: re, fontWeight: 500 }}>지각</span>
                    </label>
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: editRec.has_test ? 10 : 14 }}>
                <label className="lb">시험 여부</label>
                <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, cursor: 'pointer' }}>
                    <input type="radio" name="eTs" checked={!editRec.has_test}
                      onChange={() => { setEditRec(f => ({ ...f, has_test: false })); setEditTestItems([]) }} />없음
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, cursor: 'pointer' }}>
                    <input type="radio" name="eTs" checked={!!editRec.has_test}
                      onChange={() => {
                        setEditRec(f => ({ ...f, has_test: true }))
                        if (editTestItems.length === 0) setEditTestItems([{ testId: null, tTotal: 0, tCor: 0, tScore: 0 }])
                      }} /><span style={{ color: navy, fontWeight: 500 }}>있음</span>
                  </label>
                </div>
              </div>
              {editRec.has_test && (
                <div style={{ marginBottom: 14 }}>
                  <div className="fdv">시험 정보</div>
                  {editTestItems.map((item, idx) => (
                    <div key={idx} className="tst-card" style={{ position: 'relative' }}>
                      <button onClick={() => setEditTestItems(p => { const a = [...p]; a.splice(idx, 1); return a })}
                        style={{ position: 'absolute', top: 8, right: 8, padding: '2px 8px', borderRadius: 6, fontSize: 11, border: 'none', background: rbg, color: re, cursor: 'pointer' }}>
                        ✕ 제거
                      </button>
                      <div style={{ marginBottom: 8 }}>
                        <label className="lb">테스트 선택</label>
                        <select className="fsel" value={item.testId || ''}
                          onChange={e => {
                            const tid = parseInt(e.target.value) || null
                            const t = tests.find(x => x.id === tid)
                            setEditTestItems(p => p.map((x, i) => i === idx ? { ...x, testId: tid, testName: t?.name ?? '', tTotal: t ? t.total : 0 } : x))
                          }}>
                          <option value="">테스트 선택</option>
                          {tests.map(t => <option key={t.id} value={t.id}>{t.name} ({t.date}, {t.total}문항)</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                        <div>
                          <label className="lb">총 문제 수</label>
                          <input type="number" className="fi" value={item.tTotal || ''} readOnly placeholder="자동입력" style={{ textAlign: 'center' }} />
                        </div>
                        <div>
                          <label className="lb">정답 수</label>
                          <input type="number" className="fi" min={0} value={item.tCor || ''}
                            onChange={e => setEditTestItems(p => p.map((x, i) => i === idx ? { ...x, tCor: parseInt(e.target.value) || 0 } : x))}
                            style={{ textAlign: 'center' }} />
                        </div>
                        <div>
                          <label className="lb">점수 (선택)</label>
                          <input type="number" className="fi" min={0} max={100} value={item.tScore || ''}
                            onChange={e => setEditTestItems(p => p.map((x, i) => i === idx ? { ...x, tScore: parseInt(e.target.value) || 0 } : x))}
                            style={{ textAlign: 'center' }} />
                        </div>
                      </div>
                    </div>
                  ))}
                  <button onClick={() => setEditTestItems(p => [...p, { testId: null, tTotal: 0, tCor: 0, tScore: 0 }])}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, fontSize: 12, border: `1px solid ${bd}`, background: 'transparent', color: tx2, cursor: 'pointer', fontFamily: 'inherit' }}>
                    <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
                    시험 추가
                  </button>
                </div>
              )}
              <div className="fdv">수업 피드백</div>
              <div>
                <label className="lb">피드백 내용</label>
                <textarea className="fi" rows={3} style={{ resize: 'vertical' }} value={editRec.feedback || ''}
                  onChange={e => setEditRec(f => ({ ...f, feedback: e.target.value }))}
                  placeholder="이번 수업 특이사항 및 종합 의견" />
              </div>
            </div>
            <div style={{ padding: '0 22px 18px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditModal(false)} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, border: `1px solid ${bd}`, background: '#fff', cursor: 'pointer', color: tx2, fontFamily: 'inherit' }}>취소</button>
              <button className="bgold" onClick={saveEdit} disabled={saving} style={{ opacity: saving ? 0.7 : 1 }}>{saving ? '저장 중...' : '저장'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ 문자 발송 모달 ══ */}
      {smsModal && (
        <div onClick={() => setSmsModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.42)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: 480, maxWidth: '100%', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.15)' }}>
            <div style={{ padding: '18px 22px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: tx }}>{smsTarget === 'all' ? '일괄 문자 발송' : '개별 문자 발송'}</span>
              <button onClick={() => setSmsModal(false)} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: bg, cursor: 'pointer', fontSize: 17, color: tx2 }}>×</button>
            </div>
            <div style={{ padding: '16px 22px' }}>
              {(smsTarget === 'all' ? dayRecs : dayRecs.filter(r => r.student_id === smsTarget)).map(r => {
                const stu = students.find(s => s.id === r.student_id)
                return (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${bd}` }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: navyM, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: navy }}>{stu?.name[0]}</div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: tx }}>{stu?.name}</span>
                      <span style={{ fontSize: 12, color: tx3, marginLeft: 8 }}>→ {stu?.parent_phone || '번호 없음'}</span>
                    </div>
                    {r.sms_sent && <span className="badge" style={{ background: gbg, color: gr }}>발송완료</span>}
                    {!stu?.parent_phone && <span className="badge" style={{ background: rbg, color: re }}>번호없음</span>}
                  </div>
                )
              })}
              <div style={{ marginTop: 14, padding: '10px 14px', background: gbg, borderRadius: 8, fontSize: 12, color: gr }}>
                💡 각 학생의 학부모 연락처로 개별 발송됩니다.
              </div>
            </div>
            <div style={{ padding: '0 22px 18px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setSmsModal(false)} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, border: `1px solid ${bd}`, background: '#fff', cursor: 'pointer', color: tx2, fontFamily: 'inherit' }}>취소</button>
              <button className="bgrn" onClick={() => sendSms(smsTarget)} disabled={sending} style={{ opacity: sending ? 0.7 : 1 }}>{sending ? '발송 중...' : '발송하기'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 시험 결과 카드: 점수 강조형 (통계 페이지와 동일 디자인) ──
function TestResultCard({ testName, score, cor, total, pct, testId }: {
  testName: string; score: number; cor: number; total: number; pct: number; testId: number
}) {
  const [stats, setStats] = useState<{ avg: number; max: number; rank: number; totalCnt: number } | null>(null)
  const navy='#0D2A5E', tx='#0D1B36', tx2='#4B5C7E', tx3='#96A4BF', bd='#DDE3EE'
  const gr='#1A7F4E', re='#C0392B', gbg='#E0F5EB'

  useEffect(() => {
    async function load() {
      const { data: sc } = await supabase.from('test_scores').select('student_id, score').eq('test_id', testId)
      let list = (sc??[]).map(s=>({student_id:s.student_id, score:s.score}))

      if (list.length === 0) {
        const { data: items } = await supabase.from('record_test_items').select('record_id, t_score, t_cor, t_total').eq('test_id', testId)
        if (items && items.length > 0) {
          const recIds = items.map(x=>x.record_id)
          const { data: recsData } = await supabase.from('records').select('id, student_id').in('id', recIds)
          const recMap: Record<number, number> = {}
          for (const r of (recsData??[])) recMap[r.id] = r.student_id
          const byStudent = new Map<number, number>()
          for (const item of items) {
            const sid = recMap[item.record_id]
            if (!sid) continue
            const s = item.t_score ? item.t_score : (item.t_total>0 ? Math.round(item.t_cor/item.t_total*100) : 0)
            if (!byStudent.has(sid) || s > byStudent.get(sid)!) byStudent.set(sid, s)
          }
          list = [...byStudent.entries()].map(([student_id, score])=>({student_id, score}))
        }
      }
      if (list.length === 0) return
      list.sort((a,b)=>b.score-a.score)
      const avg = Math.round(list.reduce((a,b)=>a+b.score,0)/list.length)
      const max = list[0].score
      // 내 점수와 일치하는 항목 기준으로 순위 추정 (student_id 모르므로 score로 근사)
      const rankIdx = list.findIndex(s=>s.score===score)
      setStats({ avg, max, rank: rankIdx>=0?rankIdx+1:0, totalCnt: list.length })
    }
    load()
  }, [testId, score])

  const diff = stats ? score - stats.avg : null

  return (
    <div style={{ border: `1px solid ${bd}`, borderRadius: 10, padding: 12, marginBottom: 8, background: '#fff' }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: tx, margin: '0 0 8px' }}>{testName}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 2 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: navy, lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 13, color: tx2 }}>점</span>
        {stats && stats.totalCnt > 0 && (
          <span style={{ marginLeft: 'auto', background: gbg, color: gr, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20 }}>
            {stats.rank}등 / {stats.totalCnt}명
          </span>
        )}
      </div>
      <p style={{ fontSize: 11, color: tx2, margin: '0 0 10px' }}>{cor}/{total}문항 정답 (정답률 {pct}%)</p>

      <div style={{ height: 1, background: bd, marginBottom: 8 }} />

      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <p style={{ fontSize: 10, color: tx3, margin: '0 0 3px' }}>시험평균</p>
          <p style={{ fontSize: 14, fontWeight: 700, color: stats?tx:tx3, margin: 0 }}>{stats?`${stats.avg}점`:'—'}</p>
        </div>
        <div style={{ width: 1, height: 26, background: bd }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <p style={{ fontSize: 10, color: tx3, margin: '0 0 3px' }}>최고점</p>
          <p style={{ fontSize: 14, fontWeight: 700, color: stats?tx:tx3, margin: 0 }}>{stats?`${stats.max}점`:'—'}</p>
        </div>
        <div style={{ width: 1, height: 26, background: bd }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <p style={{ fontSize: 10, color: tx3, margin: '0 0 3px' }}>평균과 차이</p>
          <p style={{ fontSize: 14, fontWeight: 700, color: diff==null?tx3:diff>=0?gr:re, margin: 0 }}>
            {diff==null?'—':(diff>0?'+':'')+diff+'점'}
          </p>
        </div>
      </div>
    </div>
  )
}
