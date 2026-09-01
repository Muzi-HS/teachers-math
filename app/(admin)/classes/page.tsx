'use client'
import React, { useEffect, useState, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { can } from '@/lib/permissions'
import { useSearchParams } from 'next/navigation'
import { kstDateStr } from '@/lib/kst'
import ClassBulkRecordModal from '@/components/ClassBulkRecordModal'
import { IconClock } from '@/components/icons'
import { useMobileMode } from '@/context/MobileModeContext'

type Class = { id: number; name: string; days: string; time: string; mode?: string; active?: boolean }
type Student = { id: number; name: string; birth_year: number; school: string; parent_phone?: string }
type Test = { id: number; name: string; date: string; total: number }
type TestItem = { testId: number | null; tTotal: number; tCor: number; tScore: number }
type RecForm = {
  student_id: number; content: string; homework: string
  hw_rate: number; hw_cor: number; attitude: number
  hw_rate_na: boolean; hw_not_submitted: boolean; hw_cor_na: boolean
  late: boolean; has_test: boolean; testItems: TestItem[]; feedback: string
}
type Rec = RecForm & {
  id: number; date: string; sms_sent: boolean; is_draft: boolean
  record_test_items?: {
    id: number; test_id: number; t_total: number; t_cor: number; t_score: number
    tests: { name: string } | null
  }[]
}

const navy = '#0D2A5E', navyDk = '#071A3E', navyM = '#E8EEF8'
const gold = '#D87E13', goldL = '#F09830', wa = '#C05621'
const bg = '#F5F7FA', bd = '#DDE3EE'
const tx = '#0D1B36', tx2 = '#4B5C7E', tx3 = '#96A4BF'
const re = '#C0392B', rbg = '#FDECEA', gr = '#1A7F4E', gbg = '#E0F5EB'

function rateColor(v: number) { return v >= 80 ? '#1A7F4E' : v >= 60 ? '#C05621' : '#C0392B' }
function rateBg(v: number) { return v >= 80 ? '#E0F5EB' : v >= 60 ? '#FEF3E2' : '#FDECEA' }
function attColor(v: number) { return v >= 8 ? '#1A7F4E' : v >= 5 ? '#C05621' : '#C0392B' }
function attBg(v: number) { return v >= 8 ? '#E0F5EB' : v >= 5 ? '#FEF3E2' : '#FDECEA' }
function attLabel(v: number) { return v >= 8 ? '우수' : v >= 5 ? '보통' : '노력필요' }

export default function ClassesPage() {
  const { role } = useAuth()
  const { mobileMode } = useMobileMode()
  // view: list | detail | sturec
  const [view, setView] = useState<'list' | 'detail' | 'sturec'>('list')
  const [classes, setClasses] = useState<Class[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [tests, setTests] = useState<Test[]>([])
  const [csMap, setCsMap] = useState<Record<number, number[]>>({}) // class_id→student_ids
  const [recCnt, setRecCnt] = useState<Record<number, number>>({})
  const [stuRecs, setStuRecs] = useState<Rec[]>([])
  const [detailCls, setDetailCls] = useState<Class | null>(null)
  const [curStu, setCurStu] = useState<Student | null>(null)
  // 반 추가/수정
  const [clsModal, setClsModal] = useState(false)
  const [clsForm, setClsForm] = useState({ name: '', days: '', time: '', mode: '강의' })
  const [editClsId, setEditClsId] = useState<number | null>(null)
  // 요일 필터 (default: 오늘 요일)
  const [dayFlt, setDayFlt] = useState<string>(() => ['일','월','화','수','목','금','토'][new Date().getDay()])
  // 학생 추가
  const [stuModal, setStuModal] = useState(false)
  const [s2cSrch, setS2cSrch] = useState('')
  const [selStus, setSelStus] = useState<Set<number>>(new Set())
  const [ageFilter, setAgeFilter] = useState('')
  // mBulkRec (반 수업기록 일괄) — 실제 폼/저장 로직은 ClassBulkRecordModal 컴포넌트가 담당
  const [bulkModal, setBulkModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [notif, setNotif] = useState<{ msg: string; ok: boolean } | null>(null)
  // 오늘 등록된 결석/지각 (반 상세에서 소속 학생 중 해당자 표시용)
  const [todayAttNotices, setTodayAttNotices] = useState<{ student_id: number; type: 'absence' | 'late'; reason: string | null }[]>([])

  const searchParams = useSearchParams()
  const openDetailHandled = useRef(false)

  useEffect(() => { fetchAll() }, [])

  useEffect(() => {
    async function fetchTodayAttNotices() {
      const { data } = await supabase.from('attendance_notices').select('student_id,type,reason').eq('date', kstDateStr())
      setTodayAttNotices((data ?? []) as { student_id: number; type: 'absence' | 'late'; reason: string | null }[])
    }
    fetchTodayAttNotices()
  }, [])

  useEffect(() => {
    if (openDetailHandled.current || classes.length === 0) return
    const id = searchParams.get('openDetail')
    if (!id) return
    const cls = classes.find(c => c.id === Number(id))
    if (cls) {
      openDetailHandled.current = true
      setDetailCls(cls)
      setView('detail')
    }
  }, [classes, searchParams])

  async function fetchAll() {
    const [{ data: c }, { data: s }, { data: cs }, { data: rc }, { data: t }] = await Promise.all([
      supabase.from('classes').select('*').order('name'),
      supabase.from('students').select('id,name,birth_year,school,parent_phone').order('name'),
      supabase.from('class_students').select('class_id,student_id'),
      supabase.from('records').select('student_id').eq('is_draft', false),
      supabase.from('tests').select('id,name,date,total').order('date', { ascending: false }),
    ])
    setClasses(c ?? [])
    setStudents(s ?? [])
    setTests(t ?? [])
    const map: Record<number, number[]> = {}
    for (const r of (cs ?? [])) { if (!map[r.class_id]) map[r.class_id] = []; map[r.class_id].push(r.student_id) }
    setCsMap(map)
    const cnt: Record<number, number> = {}
    for (const r of (rc ?? [])) cnt[r.student_id] = (cnt[r.student_id] ?? 0) + 1
    setRecCnt(cnt)
  }

  async function fetchStuRecs(stuId: number) {
    // 1. records 기본 조회
    const { data: recs } = await supabase
      .from('records')
      .select('*')
      .eq('student_id', stuId)
      .eq('is_draft', false)
      .order('date', { ascending: false })

    if (!recs || recs.length === 0) { setStuRecs([]); return }

    // 2. record_test_items 별도 조회 (join RLS 우회)
    const recIds = recs.map(r => r.id)
    const { data: items } = await supabase
      .from('record_test_items')
      .select('id,record_id,test_id,t_total,t_cor,t_score')
      .in('record_id', recIds)

    // 3. tests 조회 (시험명)
    const testIds = [...new Set((items ?? []).map((x: any) => x.test_id))]
    let testsMap: Record<number, string> = {}
    if (testIds.length > 0) {
      const { data: testsData } = await supabase.from('tests').select('id,name').in('id', testIds)
      for (const t of (testsData ?? [])) testsMap[t.id] = t.name
    }

    // 4. record_id별로 그룹화
    const itemsByRecord: Record<number, any[]> = {}
    for (const item of (items ?? [])) {
      if (!itemsByRecord[item.record_id]) itemsByRecord[item.record_id] = []
      itemsByRecord[item.record_id].push({
        id: item.id,
        test_id: item.test_id,
        t_total: item.t_total,
        t_cor: item.t_cor,
        t_score: item.t_score,
        tests: { name: testsMap[item.test_id] ?? '' },
      })
    }

    // 5. merge
    const merged = recs.map(r => ({ ...r, record_test_items: itemsByRecord[r.id] ?? [] }))
    setStuRecs(merged as Rec[])
  }

  function toast(msg: string, ok = true) { setNotif({ msg, ok }); setTimeout(() => setNotif(null), 3000) }
  function ageOf(b: number) { return new Date().getFullYear() - b + 1 }

  // 한국 시간 기준 날짜 포맷 (YYYY년 M월 D일)
  function fmtKorDate(dateStr: string) {
    const [y, m, d] = dateStr.split('-')
    return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일`
  }
  const isAdmin = role === 'admin'
  // 반 추가/수정/삭제, 반에 학생 추가/제외 — admin만 가능
  const canManageClassInfo = role ? can.manageClassInfo(role as any) : false

  /* ─── 반 추가/수정 ─── */
  function openAddCls() { setEditClsId(null); setClsForm({ name: '', days: '', time: '', mode: '강의' }); setClsModal(true) }
  function openEditCls(c: Class) { setEditClsId(c.id); setClsForm({ name: c.name, days: c.days ?? '', time: c.time ?? '', mode: c.mode ?? '강의' }); setClsModal(true) }
  async function saveCls() {
    if (!clsForm.name.trim()) return toast('반 이름을 입력하세요.', false)
    setSaving(true)
    const { mode, ...base } = clsForm
    const payload = { ...base, ...(mode ? { mode } : {}) }
    if (editClsId) {
      const { error } = await supabase.from('classes').update(payload).eq('id', editClsId)
      if (error) await supabase.from('classes').update(base).eq('id', editClsId)
      if (detailCls?.id === editClsId) setDetailCls(p => p ? { ...p, ...clsForm } : null)
      toast(clsForm.name + ' 수정됨')
    } else {
      const { error } = await supabase.from('classes').insert(payload)
      if (error) {
        const { error: e2 } = await supabase.from('classes').insert(base)
        if (e2) { toast('저장 실패: ' + e2.message, false); setSaving(false); return }
      }
      toast(clsForm.name + ' 추가됨')
    }
    setSaving(false); setClsModal(false); setDayFlt(''); await fetchAll()
  }
  async function delCls(id: number, name: string) {
    if (!confirm(`"${name}" 반을 삭제하시겠습니까?`)) return
    await supabase.from('classes').delete().eq('id', id)
    if (detailCls?.id === id) { setDetailCls(null); setView('list') }
    toast(name + ' 삭제됨', false); await fetchAll()
  }
  async function toggleClsActive(cls: Class) {
    const next = !(cls.active ?? true)
    await supabase.from('classes').update({ active: next }).eq('id', cls.id)
    toast(cls.name + (next ? ' 활성화됨' : ' 비활성화됨'), next)
    await fetchAll()
  }

  /* ─── 학생 제외/추가 ─── */
  async function removeStu(classId: number, stuId: number) {
    if (!confirm('이 학생을 반에서 제외하시겠습니까?')) return
    await supabase.from('class_students').delete().eq('class_id', classId).eq('student_id', stuId)
    toast('학생 제외됨', false); await fetchAll()
  }
  async function addStuToCls() {
    if (!selStus.size || !detailCls) return
    let added = 0
    for (const sid of selStus) {
      const { error } = await supabase.from('class_students').insert({ class_id: detailCls.id, student_id: sid })
      if (!error) added++
    }
    if (added > 0) toast(added + '명 추가됨')
    else toast('이미 소속된 학생이거나 오류 발생', false)
    setSelStus(new Set()); setStuModal(false); await fetchAll()
  }

  async function delRec(id: number) {
    if (!confirm('기록을 삭제하시겠습니까?')) return
    // record_test_items 먼저 삭제 (test_scores 보존을 위해 CASCADE 방지)
    await supabase.from('record_test_items').delete().eq('record_id', id)
    // records 삭제
    await supabase.from('records').delete().eq('id', id)
    toast('기록 삭제됨', false)
    if (curStu) await fetchStuRecs(curStu.id); await fetchAll()
  }

  const filtered = classes.filter(c => {
    const nameMatch = !search || c.name.includes(search)
    const dayMatch = !dayFlt || (c.days ?? '').split(',').map(d => d.trim()).includes(dayFlt)
    return nameMatch && dayMatch
  })
  const detailStus = detailCls ? (csMap[detailCls.id] ?? []).map(id => students.find(s => s.id === id)).filter(Boolean) as Student[] : []
  // 오늘 이 반 소속 학생 중 결석/지각이 등록된 학생
  const detailStuIds = new Set(detailStus.map(s => s.id))
  const classTodayAtt = todayAttNotices.filter(n => detailStuIds.has(n.student_id))
  const alreadyIn = new Set(detailCls ? (csMap[detailCls.id] ?? []) : [])
  const available = students.filter(s =>
    !alreadyIn.has(s.id) &&
    (s.name.includes(s2cSrch) || s.school.includes(s2cSrch)) &&
    (ageFilter === '' || String(ageOf(s.birth_year)) === ageFilter)
  )
  const availableAges = [...new Set(students.filter(s => !alreadyIn.has(s.id)).map(s => ageOf(s.birth_year)))].sort((a, b) => a - b)

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
    .srow{display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;transition:background .15s;border-bottom:1px solid ${bd};}
    .srow:last-child{border-bottom:none;}
    .srow:hover{background:${navyM};}
    .rc{background:#fff;border:1px solid ${bd};border-radius:10px;padding:16px;margin-bottom:0;}
    .rch{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid ${bd};}
    .pb{height:6px;background:${bd};border-radius:99px;flex:1;}
    .pf{height:100%;border-radius:99px;}
    .fb{background:rgba(13,42,94,.05);border-left:3px solid ${navy};border-radius:0 8px 8px 0;padding:10px 12px;margin-top:10px;}
    .ssl-item{display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;transition:background .15s;border-bottom:1px solid ${bd};}
    .ssl-item:last-child{border-bottom:none;}
    .ssl-item:hover{background:${navyM};}
    .ssl-item.sel{background:rgba(13,42,94,.12);}
    .bgold{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:none;background:${gold};color:${navyDk};font-family:inherit;}
    .bgold:hover{background:${goldL};}
    .bprim{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:${navy};color:#fff;font-family:inherit;}
    .bprim:hover{background:#1A4080;}
    .bout{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:500;cursor:pointer;border:1px solid ${bd};background:transparent;color:${tx2};font-family:inherit;}
    .bout:hover{border-color:${navy};color:${navy};}
    .bdng{display:inline-flex;align-items:center;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;border:none;background:${rbg};color:${re};font-family:inherit;}
    .sbox{display:flex;align-items:center;gap:7px;padding:7px 12px;background:#fff;border:1px solid ${bd};border-radius:8px;}
    .sbox input{border:none;outline:none;font-size:13px;font-family:inherit;color:${tx};background:transparent;width:100%;}
    .sav{width:34px;height:34px;border-radius:50%;background:${navyM};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:${navy};flex-shrink:0;}
    .fi{width:100%;padding:9px 11px;border:1.5px solid ${bd};border-radius:8px;font-size:13px;font-family:inherit;color:${tx};outline:none;background:#fff;transition:border-color .2s;box-sizing:border-box;}
    .fi:focus{border-color:${navy};}
    .fi-sm{padding:7px 9px!important;font-size:12px!important;}
    .no-spinner::-webkit-outer-spin-button,.no-spinner::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}
    .no-spinner[type=number]{-moz-appearance:textfield;}
    .lb{display:block;font-size:12px;font-weight:500;color:${tx2};margin-bottom:5px;}
    .badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:500;}
    .bc{font-size:12px;color:${tx3};margin-bottom:14px;display:flex;align-items:center;gap:5px;}
    .bc span{cursor:pointer;color:${tx2};}
    .bc span:last-child{color:${tx};font-weight:500;cursor:default;}
    .rg{display:flex;gap:14px;margin-top:4px;}
    .rg label{display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer;}
    .fdv{font-size:11px;font-weight:600;color:${tx3};letter-spacing:1px;margin:16px 0 10px;padding-bottom:7px;border-bottom:1px solid ${bd};}
    .fr{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
    .fg{display:flex;flex-direction:column;}
    .fsel{padding:9px 11px;border:1.5px solid ${bd};border-radius:8px;font-size:13px;font-family:inherit;color:${tx};outline:none;background:#fff;width:100%;}
    .fsel:focus{border-color:${navy};}
  `

  return (
    <div style={{ padding: mobileMode ? '16px 14px 88px' : '28px 32px', fontFamily: "'Noto Sans KR',sans-serif" }}>
      <style>{css}</style>

      {notif && (
        <div style={{ position: 'fixed', top: 18, right: 18, zIndex: 9999, background: '#fff', borderRadius: 8, padding: '11px 14px', borderLeft: `4px solid ${notif.ok ? gr : re}`, boxShadow: '0 4px 18px rgba(0,0,0,.1)', minWidth: 200 }}>
          <div style={{ fontWeight: 600, marginBottom: 2, color: tx, fontSize: 13 }}>{notif.ok ? '완료' : '알림'}</div>
          <div style={{ fontSize: 12, color: tx2 }}>{notif.msg}</div>
        </div>
      )}

      {/* ════ 반 목록 ════ */}
      {view === 'list' && <>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: mobileMode ? 12 : 16 }}>
          <div><h1 style={{ fontSize: mobileMode ? 17 : 21, fontWeight: 700, color: tx }}>반 관리</h1>{!mobileMode && <p style={{ fontSize: 13, color: tx2, marginTop: 4 }}>반을 클릭하면 학생 목록을 확인합니다</p>}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: mobileMode ? 14 : 18, flexWrap: mobileMode ? 'wrap' : 'nowrap' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {['월','화','수','목','금','토','일'].map(d => (
              <button key={d} type="button"
                onClick={() => setDayFlt(p => p === d ? '' : d)}
                style={{ width: mobileMode ? 30 : 36, height: mobileMode ? 30 : 36, borderRadius: 8, cursor: 'pointer', border: `1.5px solid ${dayFlt === d ? navy : bd}`, background: dayFlt === d ? navy : '#fff', color: dayFlt === d ? '#fff' : tx2, fontSize: mobileMode ? 12 : 13, fontWeight: 600, fontFamily: 'inherit', transition: 'all .15s' }}
              >{d}</button>
            ))}
          </div>
          <div className="sbox" style={{ width: mobileMode ? '100%' : 200 }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={tx3}><circle cx="11" cy="11" r="8" strokeWidth={2} /><path strokeWidth={2} d="M21 21l-4.35-4.35" /></svg>
            <input placeholder="반 이름 검색..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        {/* 대시보드 스타일 목록 */}
        <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: mobileMode ? 12 : 16, boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>

          {filtered.length === 0 && (
            <p style={{ textAlign: 'center', padding: '30px 0', color: tx3, fontSize: 13 }}>검색 결과가 없습니다</p>
          )}

          {filtered.map((c, idx) => {
            const barColors = [navy, gold, '#1A7F4E', '#7C3AED', '#C0392B', '#0891B2']
            const barColor = barColors[idx % barColors.length]
            return (
              <div
                key={c.id}
                onClick={() => { setDetailCls(c); setView('detail') }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: idx < filtered.length - 1 ? `1px solid ${bd}` : 'none', cursor: 'pointer', opacity: c.active === false ? 0.55 : 1 }}
                onMouseEnter={e => (e.currentTarget.style.background = navyM)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ width: 4, height: 36, background: c.active === false ? tx3 : barColor, borderRadius: 2, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: c.active === false ? tx3 : tx, margin: 0 }}>{c.name}</p>
                    {c.active === false && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: '#F0F0F0', color: tx3, border: `1px solid ${bd}` }}>비활성</span>}
                  </div>
                  <p style={{ fontSize: 11, color: tx3, margin: 0 }}>
                    {[c.days, c.time, `학생 ${(csMap[c.id] ?? []).length}명`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {canManageClassInfo && (
                  <div style={{ display: 'flex', gap: 5 }} onClick={e => e.stopPropagation()}>
                    <button className="bout" onClick={() => toggleClsActive(c)} style={{ color: c.active === false ? gr : wa, borderColor: (c.active === false ? gr : wa) + '88' }}>
                      {c.active === false ? '활성화' : '비활성화'}
                    </button>
                    <button className="bout" onClick={() => openEditCls(c)}>수정</button>
                    <button className="bdng" onClick={() => delCls(c.id, c.name)}>삭제</button>
                  </div>
                )}
              </div>
            )
          })}

          {canManageClassInfo && (
            <div
              onClick={openAddCls}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0 2px', color: tx3, cursor: 'pointer', borderTop: `1px dashed ${bd}`, marginTop: 4, fontSize: 13 }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.color = navy }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.color = tx3 }}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
              새 반 추가
            </div>
          )}
        </div>
      </>}

      {/* ════ 반 상세 (v18: pg-clsdt) ════ */}
      {view === 'detail' && detailCls && <>
        <div className="bc"><span onClick={() => setView('list')}>반 관리</span><span>›</span><span>{detailCls.name}</span></div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ fontSize: mobileMode ? 17 : 21, fontWeight: 700, color: tx }}>{detailCls.name}</h1>
              {detailCls.mode && <span style={{ fontSize: 12, padding: '3px 9px', borderRadius: 20, background: navyM, color: navy, fontWeight: 500 }}>{detailCls.mode}</span>}
            </div>
            <p style={{ fontSize: 13, color: tx2, marginTop: 4 }}>{detailCls.days} | {detailCls.time}</p>
          </div>
          {/* v18: bprim 수업기록작성 + bgold 학생추가 (학생추가는 admin만) */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="bprim" onClick={() => setBulkModal(true)}>
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M11 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-4M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              수업기록 작성
            </button>
            {canManageClassInfo && (
              <button className="bgold" onClick={() => { setStuModal(true); setS2cSrch(''); setSelStus(new Set()); setAgeFilter('') }}>
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
                학생 추가
              </button>
            )}
          </div>
        </div>

        {classTodayAtt.length > 0 && (
          <div style={{ background: rbg, border: `1px solid ${re}33`, borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: re, margin: '0 0 8px' }}>오늘 결석·지각 {classTodayAtt.length}명</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {classTodayAtt.map((n, idx) => {
                const s = students.find(x => x.id === n.student_id)
                const isLate = n.type === 'late'
                return (
                  <span key={idx} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20,
                    background: '#fff', border: `1px solid ${isLate ? wa : re}55`, color: isLate ? wa : re, fontSize: 12, fontWeight: 600,
                  }} title={n.reason ?? undefined}>
                    {isLate && <IconClock size={11} />}
                    {s?.name ?? '학생'} · {isLate ? '지각' : '결석'}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, boxShadow: '0 1px 4px rgba(0,0,0,.06)', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${bd}`, fontSize: 13, fontWeight: 600, color: tx }}>
            소속 학생 <span style={{ fontSize: 12, color: tx3, fontWeight: 400 }}>{detailStus.length}명</span>
          </div>
          {detailStus.length === 0
            ? <div style={{ padding: '40px 0', textAlign: 'center', color: tx3, fontSize: 14 }}>소속 학생이 없습니다</div>
            : detailStus.map((s, idx) => {
              const avatarColors = [
                { bg: navyM,    color: navy },
                { bg: '#FEF3E2', color: '#D87E13' },
                { bg: '#E0F5EB', color: '#1A7F4E' },
                { bg: '#FDECEA', color: '#C0392B' },
                { bg: '#F3E8FF', color: '#7C3AED' },
              ]
              const ac = avatarColors[idx % avatarColors.length]
              return (
                <div
                  key={s.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', borderBottom: idx < detailStus.length - 1 ? `1px solid ${bg}` : 'none', transition: 'background .12s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = navyM)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  onClick={async () => { setCurStu(s); await fetchStuRecs(s.id); setView('sturec') }}
                >
                  {/* 아바타 */}
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: ac.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: ac.color, flexShrink: 0 }}>
                    {s.name[0]}
                  </div>

                  {/* 이름 + 학교/나이 */}
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: tx, margin: 0 }}>{s.name}</p>
                    <p style={{ fontSize: 11, color: tx3, margin: 0 }}>{s.school} · {ageOf(s.birth_year)}세</p>
                  </div>

                  {/* 기록 수 배지 */}
                  <span style={{ background: navyM, color: navy, fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20, flexShrink: 0 }}>
                    기록 {recCnt[s.id] ?? 0}개
                  </span>

                  {/* 제외 버튼 */}
                  {canManageClassInfo && (
                    <button
                      className="bout"
                      onClick={e => { e.stopPropagation(); removeStu(detailCls.id, s.id) }}
                    >
                      제외
                    </button>
                  )}

                  {/* 화살표 */}
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={tx3} style={{ flexShrink: 0 }}>
                    <path strokeWidth={2} d="M9 18l6-6-6-6" />
                  </svg>
                </div>
              )
            })
          }
        </div>
      </>}

      {/* ════ 학생 기록 (v18: pg-sturec) ════ */}
      {view === 'sturec' && curStu && <>
        <div className="bc">
          <span onClick={() => setView('list')}>반 관리</span><span>›</span>
          <span onClick={() => setView('detail')}>{detailCls?.name}</span><span>›</span>
          <span>{curStu.name}</span>
        </div>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: mobileMode ? 17 : 21, fontWeight: 700, color: tx }}>{curStu.name}</h1>
          <p style={{ fontSize: 13, color: tx2, marginTop: 4 }}>{curStu.school} · {curStu.birth_year}년생 ({ageOf(curStu.birth_year)}세)</p>
        </div>
        {stuRecs.length === 0
          ? <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: '60px 0', textAlign: 'center', color: tx3, fontSize: 14 }}>수업 기록 없음</div>
          : <div style={{ display: 'grid', gridTemplateColumns: mobileMode ? '1fr' : 'repeat(auto-fill, minmax(400px, 1fr))', gap: 12 }}>
            {stuRecs.map(r => {
            const tItems = (r.record_test_items ?? [])
            return (
              <div key={r.id} className="rc">
                {/* 헤더 */}
                <div className="rch">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 13 }}>{r.date}</b>
                    {r.late ? <span className="badge" style={{ background: rbg, color: re }}>지각</span> : <span className="badge" style={{ background: gbg, color: gr }}>정시</span>}
                    {r.has_test && <span className="badge" style={{ background: navyM, color: navy }}>시험</span>}
                  </div>
                  <span style={{ fontSize: 11, color: tx3 }}>열람 전용</span>
                </div>

                {/* 이행률 / 정답률 / 태도 — 원형 게이지 */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1, background: bg, borderRadius: 10, padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ fontSize: 11, color: navy, fontWeight: 600, margin: '0 0 2px' }}>숙제 이행률</p>
                      {r.hw_rate === -1
                        ? <p style={{ fontSize: 13, color: tx3, margin: 0 }}>숙제 없음</p>
                        : r.hw_rate === -2
                        ? <p style={{ fontSize: 13, color: re, margin: 0 }}>숙제 미제출</p>
                        : <p style={{ fontSize: 18, fontWeight: 700, color: rateColor(r.hw_rate), margin: 0, lineHeight: 1 }}>{r.hw_rate}<span style={{ fontSize: 11, fontWeight: 400, color: tx2 }}>%</span></p>
                      }
                    </div>
                    {r.hw_rate >= 0 && (
                      <svg width="32" height="32" viewBox="0 0 32 32">
                        <circle cx="16" cy="16" r="12.5" fill="none" stroke={bd} strokeWidth={3.2} />
                        <circle cx="16" cy="16" r="12.5" fill="none" stroke={rateColor(r.hw_rate)} strokeWidth={3.2}
                          strokeDasharray={78.5} strokeDashoffset={78.5 * (1 - r.hw_rate / 100)}
                          strokeLinecap="round" transform="rotate(-90 16 16)" />
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
                        <circle cx="16" cy="16" r="12.5" fill="none" stroke={bd} strokeWidth={3.2} />
                        <circle cx="16" cy="16" r="12.5" fill="none" stroke={rateColor(r.hw_cor)} strokeWidth={3.2}
                          strokeDasharray={78.5} strokeDashoffset={78.5 * (1 - r.hw_cor / 100)}
                          strokeLinecap="round" transform="rotate(-90 16 16)" />
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
                {tItems.length > 0 && tItems.map((ti: any, idx: number) => {
                  const pct = ti.t_total > 0 ? Math.round(ti.t_cor / ti.t_total * 100) : 0
                  const sc = ti.t_score ?? 0
                  return <StuTestResultCard key={idx} testName={ti.tests?.name ?? '시험'} score={sc} cor={ti.t_cor} total={ti.t_total} pct={pct} testId={ti.test_id} />
                })}

                {/* 피드백 */}
                {r.feedback && (
                  <div className="fb">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                      <div style={{ width: 3, height: 14, background: navy, borderRadius: 2 }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: navy }}>수업 피드백</span>
                    </div>
                    <p style={{ fontSize: 14, color: tx, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{r.feedback}</p>
                  </div>
                )}
              </div>
            )
          })}
          </div>
        }
      </>}

      {/* ════ mBulkRec: 반 수업기록 일괄 작성/수정 (공용 컴포넌트) ════ */}
      {bulkModal && detailCls && (
        <ClassBulkRecordModal
          classId={detailCls.id}
          className={detailCls.name}
          students={detailStus}
          tests={tests}
          onClose={() => setBulkModal(false)}
          onSaved={fetchAll}
        />
      )}

      {/* ════ 반 추가/수정 모달 ════ */}
      {clsModal && (
        <Modal title={editClsId ? '반 편집' : '반 추가'} onClose={() => setClsModal(false)}
          footer={<>
            <button onClick={() => setClsModal(false)} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, border: `1px solid ${bd}`, background: '#fff', cursor: 'pointer', color: tx2, fontFamily: 'inherit' }}>취소</button>
            <button className="bgold" onClick={saveCls} disabled={saving} style={{ opacity: saving ? 0.7 : 1 }}>{saving ? '저장 중...' : '저장'}</button>
          </>}
        >
          <div className="fg" style={{ marginBottom: 14 }}>
            <label className="lb">반 이름</label>
            <input className="fi" value={clsForm.name} onChange={e => setClsForm(f => ({ ...f, name: e.target.value }))} placeholder="예) 중등심화A반" />
          </div>

          <div className="fg" style={{ marginBottom: 14 }}>
            <label className="lb">강의 방식</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['강의', '개별지도', '특강'].map(m => (
                <button key={m} type="button"
                  onClick={() => setClsForm(f => ({ ...f, mode: m }))}
                  style={{ padding: '7px 16px', borderRadius: 8, cursor: 'pointer', border: `1.5px solid ${clsForm.mode === m ? navy : bd}`, background: clsForm.mode === m ? navy : '#fff', color: clsForm.mode === m ? '#fff' : tx2, fontSize: 13, fontWeight: 500, fontFamily: 'inherit', transition: 'all .15s' }}
                >{m}</button>
              ))}
            </div>
          </div>

          {/* 요일 선택 — 다중 토글 */}
          <div className="fg" style={{ marginBottom: 14 }}>
            <label className="lb">수업 요일</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {['월', '화', '수', '목', '금', '토', '일'].map(d => {
                const daysArr = clsForm.days ? clsForm.days.split(',') : []
                const isSel = daysArr.includes(d)
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      const next = isSel ? daysArr.filter(x => x !== d) : [...daysArr, d]
                      // 월~일 순서로 정렬
                      const order = ['월', '화', '수', '목', '금', '토', '일']
                      next.sort((a, b) => order.indexOf(a) - order.indexOf(b))
                      setClsForm(f => ({ ...f, days: next.join(',') }))
                    }}
                    style={{
                      width: 38, height: 38, borderRadius: 8, cursor: 'pointer',
                      border: `1.5px solid ${isSel ? navy : bd}`,
                      background: isSel ? navy : '#fff',
                      color: isSel ? '#fff' : tx2,
                      fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                      transition: 'all .15s',
                    }}
                  >
                    {d}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 시간 선택 — 시작/종료 드롭다운 + 직접 입력 */}
          <div className="fg">
            <label className="lb">수업 시간</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <select
                className="fsel"
                style={{ width: 'auto', flex: 1 }}
                value={clsForm.time.split('~')[0]?.trim() || ''}
                onChange={e => {
                  const end = clsForm.time.split('~')[1]?.trim() || ''
                  setClsForm(f => ({ ...f, time: end ? `${e.target.value} ~ ${end}` : e.target.value }))
                }}
              >
                <option value="">시작 시간</option>
                {Array.from({ length: 28 }).map((_, i) => {
                  const h = Math.floor(i / 2) + 9 // 09:00 ~ 22:30
                  const m = i % 2 === 0 ? '00' : '30'
                  const label = `${String(h).padStart(2, '0')}:${m}`
                  return <option key={label} value={label}>{label}</option>
                })}
              </select>
              <span style={{ color: tx3, fontSize: 13 }}>~</span>
              <select
                className="fsel"
                style={{ width: 'auto', flex: 1 }}
                value={clsForm.time.split('~')[1]?.trim() || ''}
                onChange={e => {
                  const start = clsForm.time.split('~')[0]?.trim() || ''
                  setClsForm(f => ({ ...f, time: `${start} ~ ${e.target.value}` }))
                }}
              >
                <option value="">종료 시간</option>
                {Array.from({ length: 28 }).map((_, i) => {
                  const h = Math.floor(i / 2) + 9
                  const m = i % 2 === 0 ? '00' : '30'
                  const label = `${String(h).padStart(2, '0')}:${m}`
                  return <option key={label} value={label}>{label}</option>
                })}
              </select>
            </div>
            <input
              className="fi"
              value={clsForm.time}
              onChange={e => setClsForm(f => ({ ...f, time: e.target.value }))}
              placeholder="직접 입력도 가능 (예: 오후 4:00~6:00)"
            />
          </div>
        </Modal>
      )}

      {/* ════ 학생 추가 모달 ════ */}
      {stuModal && detailCls && (
        <Modal title={(detailCls?.name ?? '') + '에 학생 추가'} onClose={() => setStuModal(false)}
          footer={<>
            <button onClick={() => setStuModal(false)} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, border: `1px solid ${bd}`, background: '#fff', cursor: 'pointer', color: tx2, fontFamily: 'inherit' }}>취소</button>
            <button className="bgold" onClick={addStuToCls} disabled={selStus.size === 0} style={{ opacity: selStus.size === 0 ? 0.5 : 1 }}>추가{selStus.size > 0 ? ` (${selStus.size}명)` : ''}</button>
          </>}
        >
          <p style={{ fontSize: 13, color: tx2, marginBottom: 12 }}>학생 관리에 등록된 학생만 추가 가능합니다.</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div className="sbox" style={{ flex: 1 }}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={tx3}><circle cx="11" cy="11" r="8" strokeWidth={2} /><path strokeWidth={2} d="M21 21l-4.35-4.35" /></svg>
              <input placeholder="이름 검색..." value={s2cSrch} onChange={e => setS2cSrch(e.target.value)} />
            </div>
            <select value={ageFilter} onChange={e => setAgeFilter(e.target.value)} style={{ padding: '7px 9px', border: `1.5px solid ${bd}`, borderRadius: 8, fontSize: 12, fontFamily: 'inherit', color: tx2, background: '#fff', outline: 'none', cursor: 'pointer' }}>
              <option value="">전체 나이</option>
              {availableAges.map(age => <option key={age} value={String(age)}>{age}세</option>)}
            </select>
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto', border: `1.5px solid ${bd}`, borderRadius: 8 }}>
            {available.length === 0
              ? <div style={{ textAlign: 'center', padding: '20px', color: tx3, fontSize: 13 }}>추가 가능한 학생 없음</div>
              : available.map(s => (
                <div key={s.id} className={`ssl-item${selStus.has(s.id) ? ' sel' : ''}`} onClick={() => setSelStus(p => { const n = new Set(p); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n })}>
                  <div className="sav">{s.name[0]}</div>
                  <div style={{ flex: 1 }}><p style={{ fontSize: 13, fontWeight: 600, color: tx }}>{s.name}</p><span style={{ fontSize: 12, color: tx3 }}>{s.school} · {ageOf(s.birth_year)}세</span></div>
                  {selStus.has(s.id) && <svg width="14" height="14" viewBox="0 0 24 24" fill={navy}><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>}
                </div>
              ))
            }
          </div>
          <p style={{ fontSize: 12, color: tx3, marginTop: 8 }}>{available.length}명 표시 중{selStus.size > 0 ? ` · ${selStus.size}명 선택됨` : ''}</p>
        </Modal>
      )}
    </div>
  )
}

// ── 시험평균/최고점 셀 (records-page의 TestAvgCell과 동일) ──
function StuTestResultCard({ testName, score, cor, total, pct, testId }: {
  testName: string; score: number; cor: number; total: number; pct: number; testId: number
}) {
  const [stats, setStats] = useState<{ avg: number; max: number; rank: number; totalCnt: number } | null>(null)
  const navy = '#0D2A5E', tx = '#0D1B36', tx2 = '#4B5C7E', tx3 = '#96A4BF', bd = '#DDE3EE'
  const gr = '#1A7F4E', re = '#C0392B', gbg = '#E0F5EB'

  useEffect(() => {
    async function load() {
      const { data: sc } = await supabase.from('test_scores').select('student_id, score').eq('test_id', testId)
      let list = (sc ?? []).map(s => ({ student_id: s.student_id, score: s.score }))

      if (list.length === 0) {
        const { data: items } = await supabase.from('record_test_items').select('record_id, t_score, t_cor, t_total').eq('test_id', testId)
        if (items && items.length > 0) {
          const recIds = items.map(x => x.record_id)
          const { data: recsData } = await supabase.from('records').select('id, student_id').in('id', recIds)
          const recMap: Record<number, number> = {}
          for (const r of (recsData ?? [])) recMap[r.id] = r.student_id
          const byStudent = new Map<number, number>()
          for (const item of items) {
            const sid = recMap[item.record_id]
            if (!sid) continue
            const s = item.t_score ? item.t_score : (item.t_total > 0 ? Math.round(item.t_cor / item.t_total * 100) : 0)
            if (!byStudent.has(sid) || s > byStudent.get(sid)!) byStudent.set(sid, s)
          }
          list = [...byStudent.entries()].map(([student_id, score]) => ({ student_id, score }))
        }
      }
      if (list.length === 0) return
      list.sort((a, b) => b.score - a.score)
      const avg = Math.round(list.reduce((a, b) => a + b.score, 0) / list.length)
      const max = list[0].score
      const rankIdx = list.findIndex(s => s.score === score)
      setStats({ avg, max, rank: rankIdx >= 0 ? rankIdx + 1 : 0, totalCnt: list.length })
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
          <p style={{ fontSize: 14, fontWeight: 700, color: stats ? tx : tx3, margin: 0 }}>{stats ? `${stats.avg}점` : '—'}</p>
        </div>
        <div style={{ width: 1, height: 26, background: bd }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <p style={{ fontSize: 10, color: tx3, margin: '0 0 3px' }}>최고점</p>
          <p style={{ fontSize: 14, fontWeight: 700, color: stats ? tx : tx3, margin: 0 }}>{stats ? `${stats.max}점` : '—'}</p>
        </div>
        <div style={{ width: 1, height: 26, background: bd }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <p style={{ fontSize: 10, color: tx3, margin: '0 0 3px' }}>평균과 차이</p>
          <p style={{ fontSize: 14, fontWeight: 700, color: diff == null ? tx3 : diff >= 0 ? gr : re, margin: 0 }}>
            {diff == null ? '—' : (diff > 0 ? '+' : '') + diff + '점'}
          </p>
        </div>
      </div>
    </div>
  )
}

const Modal = React.memo(function Modal({ onClose, title, children, footer, wide = false }: {
  onClose: () => void; title: string; children: React.ReactNode; footer: React.ReactNode; wide?: boolean
}) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.42)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 12, width: wide ? 820 : 560, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.15)' }}
      >
        <div style={{ padding: '18px 22px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#fff', zIndex: 1, borderBottom: `1px solid #DDE3EE`, marginBottom: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#0D1B36' }}>{title}</span>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: '#F5F7FA', cursor: 'pointer', fontSize: 17, color: '#4B5C7E' }}>×</button>
        </div>
        <div style={{ padding: '14px 22px' }}>{children}</div>
        <div style={{ padding: '0 22px 18px', display: 'flex', gap: 8, justifyContent: 'flex-end', position: 'sticky', bottom: 0, background: '#fff', borderTop: `1px solid #DDE3EE`, paddingTop: 12 }}>{footer}</div>
      </div>
    </div>
  )
})
