'use client'
import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { kstDateStr } from '@/lib/kst'
import { IconChat, IconBook, IconPencil, IconSave, IconX } from '@/components/icons'
import AutoGrowTextarea from '@/components/AutoGrowTextarea'
import { useMobileMode } from '@/context/MobileModeContext'

type Student = { id: number; name: string; school?: string }
type Test = { id: number; name: string; date: string; total: number }
type TestItem = { testId: number | null; tTotal: number; tCor: number; tScore: number }
type RecForm = {
  student_id: number; content: string; homework: string
  hw_rate: number | ''; hw_cor: number | ''; attitude: number
  hw_rate_na: boolean; hw_not_submitted: boolean; hw_cor_na: boolean
  late: boolean; has_test: boolean; testItems: TestItem[]; feedback: string
}

const BLANK_REC = (sid: number): RecForm => ({
  student_id: sid, content: '', homework: '', hw_rate: '', hw_cor: '', attitude: 10,
  hw_rate_na: false, hw_not_submitted: false, hw_cor_na: false,
  late: false, has_test: false, testItems: [], feedback: ''
})

const navy = '#0D2A5E', navyM = '#E8EEF8'
const gold = '#D87E13', wa = '#C05621', wbg = '#FEF3E2'
const bg = '#F5F7FA', bd = '#DDE3EE'
const tx = '#0D1B36', tx2 = '#4B5C7E', tx3 = '#96A4BF'
const re = '#C0392B', gr = '#1A7F4E', gbg = '#E0F5EB'

// 반 소속 학생 전체를 대상으로 특정 날짜의 수업기록을 일괄 작성/수정하는 공용 팝업.
// '반관리 > 수업기록 작성'과 '수업기록 > 일괄수정'이 동일한 인터페이스를 쓰도록 공유된다.
export default function ClassBulkRecordModal({
  classId, className, students, tests, initialDate, title, onClose, onSaved,
}: {
  classId: number | null
  className: string
  students: Student[]
  tests: Test[]
  initialDate?: string
  title?: string
  onClose: () => void
  onSaved: () => void
}) {
  // '모바일로 보기'는 실제 창 너비와 무관하게 켜고 끌 수 있는 수동 스위치이므로
  // 반응형 2열 배치는 반드시 이 값으로 분기해야 한다 (CSS 미디어쿼리만으로는 전환되지 않음)
  const { mobileMode } = useMobileMode()
  // 반 소속 전체 학생 대상(class_id 있음)이든 개별 학생 1명 대상(class_id 없을 수 있음)이든
  // 동일한 세션 임시저장 슬롯을 쓸 수 있도록 학생 구성으로 키를 만든다
  const draftKey = 'bulkDraft_' + (classId ?? 'ind-' + students.map(s => s.id).sort().join('-'))
  const [bulkDate, setBulkDate] = useState(initialDate || kstDateStr())
  const [bulkChks, setBulkChks] = useState<Record<number, boolean>>({})
  const [bulkForms, setBulkForms] = useState<Record<number, RecForm>>({})
  const [bulkRecIds, setBulkRecIds] = useState<Record<number, number>>({})
  const [bulkShowTest, setBulkShowTest] = useState<Record<number, boolean>>({})
  const [bulkContentText, setBulkContentText] = useState('')
  const [bulkHomeworkText, setBulkHomeworkText] = useState('')
  const [bulkFeedbackText, setBulkFeedbackText] = useState('')
  const [hasDraft, setHasDraft] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notif, setNotif] = useState<{ msg: string; ok: boolean } | null>(null)

  function toast(msg: string, ok = true) { setNotif({ msg, ok }); setTimeout(() => setNotif(null), 3000) }

  useEffect(() => { loadForDate(bulkDate) }, [bulkDate, classId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadForDate(date: string) {
    setLoading(true)
    const chks: Record<number, boolean> = {}
    const forms: Record<number, RecForm> = {}
    const showT: Record<number, boolean> = {}
    const recIds: Record<number, number> = {}
    students.forEach(s => { chks[s.id] = true; forms[s.id] = BLANK_REC(s.id); showT[s.id] = false })

    const { data: recs } = await supabase.from('records').select('*').in('student_id', students.map(s => s.id)).eq('date', date).eq('is_draft', false)
    if (recs && recs.length > 0) {
      const recIdList = recs.map(r => r.id)
      const { data: items } = await supabase.from('record_test_items').select('record_id, test_id, t_total, t_cor, t_score').in('record_id', recIdList)
      const itemsByRec: Record<number, TestItem[]> = {}
      for (const it of (items ?? [])) {
        if (!itemsByRec[it.record_id]) itemsByRec[it.record_id] = []
        itemsByRec[it.record_id].push({ testId: it.test_id, tTotal: it.t_total, tCor: it.t_cor, tScore: it.t_score })
      }
      for (const r of recs) {
        if (!(r.student_id in chks)) continue // 반 소속 학생 목록에 없는 경우(제외됨 등) 무시
        recIds[r.student_id] = r.id
        forms[r.student_id] = {
          student_id: r.student_id, content: r.content ?? '', homework: r.homework ?? '',
          hw_rate: r.hw_rate < 0 ? 0 : r.hw_rate, hw_cor: r.hw_cor < 0 ? 0 : r.hw_cor,
          hw_rate_na: r.hw_rate === -1, hw_not_submitted: r.hw_rate === -2, hw_cor_na: r.hw_cor < 0,
          attitude: r.attitude ?? 10, late: r.late, has_test: r.has_test,
          testItems: itemsByRec[r.id] ?? [], feedback: r.feedback ?? '',
        }
        showT[r.student_id] = r.has_test
      }
    }
    setBulkChks(chks); setBulkForms(forms); setBulkShowTest(showT); setBulkRecIds(recIds)
    setHasDraft(!!sessionStorage.getItem(draftKey))
    setLoading(false)
  }

  function loadBulkDraft() {
    const raw = sessionStorage.getItem(draftKey)
    if (!raw) return
    try {
      const d = JSON.parse(raw)
      if (d.date) setBulkDate(d.date)
      setBulkChks(p => ({ ...p, ...(d.chks || {}) }))
      setBulkForms(p => ({ ...p, ...(d.forms || {}) }))
      setBulkShowTest(p => ({ ...p, ...(d.showTest || {}) }))
      setHasDraft(false)
      toast('임시저장 내용을 불러왔습니다')
    } catch { }
  }
  function clearBulkDraft() {
    sessionStorage.removeItem(draftKey)
    setHasDraft(false)
  }
  function saveBulkDraft() {
    sessionStorage.setItem(draftKey, JSON.stringify({ date: bulkDate, chks: bulkChks, forms: bulkForms, showTest: bulkShowTest }))
    setHasDraft(true)
    toast('반 수업기록이 임시저장되었습니다')
  }

  function setBF(sid: number, key: keyof RecForm, val: any) {
    setBulkForms(p => ({ ...p, [sid]: { ...p[sid], [key]: val } }))
  }
  function setBulkTestItem(sid: number, idx: number, key: keyof TestItem, val: any) {
    setBulkForms(p => {
      const items = [...(p[sid]?.testItems || [])]
      items[idx] = { ...items[idx], [key]: val }
      if (key === 'testId') {
        const t = tests.find(x => x.id === Number(val))
        items[idx].tTotal = t ? t.total : 0
      }
      return { ...p, [sid]: { ...p[sid], testItems: items } }
    })
  }
  function addBulkTestItem(sid: number) {
    setBulkForms(p => ({ ...p, [sid]: { ...p[sid], testItems: [...(p[sid]?.testItems || []), { testId: null, tTotal: 0, tCor: 0, tScore: 0 }] } }))
  }
  function removeBulkTestItem(sid: number, idx: number) {
    setBulkForms(p => { const items = [...(p[sid]?.testItems || [])]; items.splice(idx, 1); return { ...p, [sid]: { ...p[sid], testItems: items } } })
  }

  function applyBulkField(field: 'content' | 'homework' | 'feedback', value: string, label: string) {
    if (!value.trim()) return toast(`일괄 작성할 ${label} 내용을 입력하세요.`, false)
    setBulkForms(p => {
      const next = { ...p }
      for (const sid of Object.keys(bulkChks).map(Number)) {
        if (!bulkChks[sid]) continue
        next[sid] = { ...(next[sid] || BLANK_REC(sid)), [field]: value }
      }
      return next
    })
    toast(`개별 ${label}에 일괄 반영되었습니다`)
  }

  async function saveBulkRec() {
    setSaving(true)
    let cnt = 0, errCnt = 0
    const checkedSids = Object.entries(bulkChks).filter(([, v]) => v).map(([k]) => Number(k))
    for (const sid of checkedSids) {
      const f = bulkForms[sid]
      const existingId = bulkRecIds[sid] ?? null
      const blank = !f || (
        !f.content && !f.homework && !f.feedback &&
        f.attitude === 10 && f.hw_rate === '' && f.hw_cor === '' &&
        !f.late && !f.has_test && !f.hw_rate_na && !f.hw_not_submitted && !f.hw_cor_na &&
        (!f.testItems || f.testItems.length === 0)
      )
      if (blank && !existingId) continue

      const row = {
        student_id: sid, date: bulkDate, class_id: classId,
        content: f.content, homework: f.homework,
        hw_rate: f.hw_rate_na ? -1 : f.hw_not_submitted ? -2 : (f.hw_rate === '' ? 0 : f.hw_rate),
        hw_cor: f.hw_cor_na ? -1 : (f.hw_cor === '' ? 0 : f.hw_cor),
        attitude: f.attitude,
        late: f.late, has_test: f.has_test, feedback: f.feedback, is_draft: false,
      }

      let recId: number
      if (existingId) {
        const { error } = await supabase.from('records').update(row).eq('id', existingId)
        if (error) { toast('저장 실패: ' + error.message, false); errCnt++; continue }
        recId = existingId
        await supabase.from('record_test_items').delete().eq('record_id', recId)
      } else {
        const { data: rec, error: recErr } = await supabase.from('records').insert(row).select('id').single()
        if (recErr || !rec) { toast('저장 실패: ' + (recErr?.message || '알 수 없는 오류'), false); errCnt++; continue }
        recId = rec.id
      }

      if (f.has_test && f.testItems && f.testItems.length > 0) {
        for (const ti of f.testItems) {
          if (!ti.testId) continue
          const t = tests.find(x => x.id === ti.testId)
          let total = t?.total ?? ti.tTotal ?? 0
          if (!total) {
            const { data: td } = await supabase.from('tests').select('total').eq('id', ti.testId).single()
            if (td?.total) total = td.total
          }
          const tCorVal = ti.tCor ?? 0
          const autoScore = ti.tScore ? ti.tScore : (total > 0 ? Math.round(tCorVal / total * 100) : 0)
          await supabase.from('record_test_items').insert({ record_id: recId, test_id: ti.testId, t_total: total, t_cor: tCorVal, t_score: autoScore })
          await supabase.from('test_scores').upsert({ test_id: ti.testId, student_id: sid, cor: tCorVal, score: autoScore }, { onConflict: 'test_id,student_id' })
        }
      }
      cnt++
    }
    sessionStorage.removeItem(draftKey)
    setSaving(false)
    setHasDraft(false)
    if (cnt === 0 && errCnt === 0) {
      toast('저장할 내용이 없습니다. 수업 내용·숙제·피드백이나 수치 항목을 수정 후 저장하세요.', false)
      return
    }
    if (cnt > 0) {
      toast(cnt + '명 수업기록 저장됨')
      onSaved()
      onClose()
    }
  }

  const bulkCheckedSids = students.map(s => s.id).filter(sid => bulkChks[sid])
  // 학생 1명(개별 수정)일 때는 여러 명을 나란히 보여주기 위한 폭이 필요 없으므로 좁게 고정
  const isSingleStudent = students.length <= 1

  const css = `
    .bcr-fi{width:100%;padding:9px 11px;border:1.5px solid ${bd};border-radius:8px;font-size:13px;font-family:inherit;color:${tx};outline:none;background:#fff;transition:border-color .2s;box-sizing:border-box;}
    .bcr-fi:focus{border-color:${navy};}
    .bcr-fi-sm{padding:7px 9px!important;font-size:12px!important;}
    .no-spinner::-webkit-outer-spin-button,.no-spinner::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}
    .no-spinner[type=number]{-moz-appearance:textfield;}
    .bcr-lb{display:block;font-size:12px;font-weight:500;color:${tx2};margin-bottom:5px;}
    .bcr-fg{display:flex;flex-direction:column;min-width:0;}
    .bcr-fr{display:grid;grid-template-columns:1fr 1fr;gap:12px;min-width:0;}
    .bcr-rg{display:flex;gap:14px;margin-top:4px;flex-wrap:wrap;}
    .bcr-rg label{display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer;}
    .bcr-badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:500;}
    .bcr-sav{width:30px;height:30px;border-radius:50%;background:${navyM};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:${navy};flex-shrink:0;}
    .bcr-bulk-form{border:1.5px solid ${bd};border-radius:10px;padding:18px;margin-bottom:14px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.05);min-width:0;box-sizing:border-box;}
    .bcr-fsel{padding:9px 11px;border:1.5px solid ${bd};border-radius:8px;font-size:13px;font-family:inherit;color:${tx};outline:none;background:#fff;width:100%;}
    .bcr-fsel:focus{border-color:${navy};}
    .bcr-fdv{font-size:11px;font-weight:600;color:${tx3};letter-spacing:1px;margin:16px 0 10px;padding-bottom:7px;border-bottom:1px solid ${bd};}
    .bcr-bout{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:500;cursor:pointer;border:1px solid ${bd};background:transparent;color:${tx2};font-family:inherit;}
    .bcr-bout:hover{border-color:${navy};color:${navy};}
    .bcr-bdng{display:inline-flex;align-items:center;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;border:none;background:#FDECEA;color:${re};font-family:inherit;}
    .bcr-bprim{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:${navy};color:#fff;font-family:inherit;}
    .bcr-bprim:hover{background:#1A4080;}
    .bcr-bgold{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:none;background:${gold};color:#071A3E;font-family:inherit;}
    .bcr-modal{width:820px;}
    .bcr-content-hw{display:flex;flex-direction:column;gap:10px;margin-bottom:10px;}
    .bcr-grid{display:flex;flex-direction:column;}
    .bcr-grid > .bcr-bulk-form{width:100%;}
    ${!mobileMode && !isSingleStudent ? `
    @media (min-width:900px){
      .bcr-content-hw{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
    }
    @media (min-width:1300px){
      .bcr-modal{width:1180px;}
      .bcr-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start;}
      .bcr-grid > .bcr-bulk-form{margin-bottom:0;}
    }
    ` : ''}
    ${mobileMode ? `
    /* 모바일로 보기: 실제 창 너비와 무관하게 항상 1열 바텀시트로 고정, 터치 영역 확대 */
    .bcr-bulk-form{padding:14px;}
    .bcr-rg label{padding:4px 0;}
    input[type=checkbox], input[type=radio]{ width:17px; height:17px; }
    ` : ''}
  `

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.42)', zIndex: 1000, display: 'flex', alignItems: mobileMode ? 'flex-end' : 'center', justifyContent: 'center', padding: mobileMode ? 0 : 16 }}>
      <style>{css}</style>
      <div className="bcr-modal" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: mobileMode ? '16px 16px 0 0' : 12, width: mobileMode ? '100%' : (isSingleStudent ? 560 : undefined), maxWidth: '100%', maxHeight: mobileMode ? '92vh' : '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.15)' }}>
        <div style={{ padding: mobileMode ? '14px 16px 0' : '18px 22px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#fff', zIndex: 1, borderBottom: `1px solid ${bd}`, marginBottom: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: tx }}>{title ?? `${className} 수업기록 작성`}</span>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: bg, cursor: 'pointer', fontSize: 17, color: tx2 }}>×</button>
        </div>

        <div style={{ padding: mobileMode ? '12px 16px' : '14px 22px' }}>
          {notif && (
            <div style={{ background: notif.ok ? gbg : '#FDECEA', border: `1px solid ${notif.ok ? gr : re}`, borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: notif.ok ? gr : re }}>
              {notif.msg}
            </div>
          )}

          {/* 날짜 + 학생 선택 — 모바일에서는 좁은 반쪽 칸에 학생 목록이 눌리지 않도록 세로로 쌓는다 */}
          <div className="bcr-fr" style={{ marginBottom: 8, ...(mobileMode ? { display: 'flex', flexDirection: 'column', gap: 12 } : {}) }}>
            <div className="bcr-fg">
              <label className="bcr-lb">날짜</label>
              <input type="date" className="bcr-fi" value={bulkDate} onChange={e => setBulkDate(e.target.value)}
                style={{ maxWidth: '100%', display: 'block', WebkitAppearance: 'none', appearance: 'none' }} />
            </div>
            <div className="bcr-fg">
              <label className="bcr-lb">소속 학생 선택</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                {students.map(s => (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: bulkChks[s.id] ? navyM : bg, border: `1px solid ${bulkChks[s.id] ? navy : bd}`, borderRadius: 8, cursor: 'pointer', fontSize: 13, transition: 'all .15s' }}>
                    <input type="checkbox" checked={!!bulkChks[s.id]} onChange={e => setBulkChks(p => ({ ...p, [s.id]: e.target.checked }))} />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* 임시저장 배너 */}
          {hasDraft && (
            <div style={{ background: wbg, border: `1px solid ${wa}`, borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: wa, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><IconSave size={13} /> 임시저장된 내용이 있습니다.</span>
              <button onClick={loadBulkDraft} style={{ padding: '3px 10px', borderRadius: 6, border: `1px solid ${wa}`, background: 'transparent', color: wa, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>불러오기</button>
              <button onClick={clearBulkDraft} style={{ padding: '3px 10px', borderRadius: 6, border: `1px solid ${bd}`, background: 'transparent', color: tx3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>무시</button>
            </div>
          )}

          {/* 일괄 작성 — 수업 내용/숙제/피드백을 선택된 학생 전원에게 한 번에 반영 */}
          <div style={{ background: bg, borderRadius: 8, padding: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label className="bcr-lb"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconBook size={12} /> 수업 내용(진도) 일괄 작성</span> <span style={{ color: tx3, fontWeight: 400 }}>(선택된 학생 전원에게 동일하게 입력됩니다)</span></label>
              <div style={{ display: 'flex', gap: 8 }}>
                <AutoGrowTextarea className="bcr-fi" rows={2} minHeight={56} style={{ background: '#fff' }} value={bulkContentText} onChange={e => setBulkContentText(e.target.value)} placeholder="예) 이차함수 그래프 변환 (p.45~52)" />
                <button type="button" className="bcr-bout" style={{ flexShrink: 0, alignSelf: 'flex-start' }} onClick={() => applyBulkField('content', bulkContentText, '수업 내용')}>일괄작성</button>
              </div>
            </div>
            <div>
              <label className="bcr-lb"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconPencil size={12} /> 숙제 일괄 작성</span> <span style={{ color: tx3, fontWeight: 400 }}>(선택된 학생 전원에게 동일하게 입력됩니다)</span></label>
              <div style={{ display: 'flex', gap: 8 }}>
                <AutoGrowTextarea className="bcr-fi" rows={2} minHeight={56} style={{ background: '#fff' }} value={bulkHomeworkText} onChange={e => setBulkHomeworkText(e.target.value)} placeholder="예) 교재 p.53~55 연습문제 1~10번" />
                <button type="button" className="bcr-bout" style={{ flexShrink: 0, alignSelf: 'flex-start' }} onClick={() => applyBulkField('homework', bulkHomeworkText, '숙제')}>일괄작성</button>
              </div>
            </div>
            <div>
              <label className="bcr-lb"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconChat size={12} /> 피드백 일괄 작성</span> <span style={{ color: tx3, fontWeight: 400 }}>(선택된 학생 전원의 개별 피드백에 동일하게 입력됩니다)</span></label>
              <div style={{ display: 'flex', gap: 8 }}>
                <AutoGrowTextarea className="bcr-fi" rows={3} minHeight={76} style={{ background: '#fff' }} value={bulkFeedbackText} onChange={e => setBulkFeedbackText(e.target.value)} placeholder="예) 이번 주 전반적으로 집중도가 좋았습니다." />
                <button type="button" className="bcr-bout" style={{ flexShrink: 0, alignSelf: 'flex-start' }} onClick={() => applyBulkField('feedback', bulkFeedbackText, '피드백')}>일괄작성</button>
              </div>
            </div>
          </div>

          <div className="bcr-fdv">학생별 수업 기록</div>

          {loading ? (
            <p style={{ color: tx3, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>불러오는 중...</p>
          ) : bulkCheckedSids.length === 0 ? (
            <p style={{ color: tx3, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>선택된 학생이 없습니다.</p>
          ) : (
          <div className="bcr-grid">
          {bulkCheckedSids.map(sid => {
            const s = students.find(x => x.id === sid)
            if (!s) return null
            const f = bulkForms[sid] || BLANK_REC(sid)
            const showT = bulkShowTest[sid] || false
            return (
              <div key={sid} className="bcr-bulk-form">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${bd}` }}>
                  <div className="bcr-sav">{s.name[0]}</div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: tx }}>{s.name}</span>
                  {bulkRecIds[sid] && <span className="bcr-badge" style={{ background: navyM, color: navy, marginLeft: 'auto' }}>기존 기록 수정</span>}
                  {s.school && !bulkRecIds[sid] && <span className="bcr-badge" style={{ background: navyM, color: navy, marginLeft: 'auto' }}>{s.school}</span>}
                </div>
                <div className="bcr-content-hw">
                  <div className="bcr-fg">
                    <label className="bcr-lb" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><IconBook size={12} /> 수업 내용 (진도)</label>
                    <AutoGrowTextarea className="bcr-fi" rows={2} placeholder="예) 이차함수 그래프 변환 (p.45~52)" value={f.content} onChange={e => setBF(sid, 'content', e.target.value)} />
                  </div>
                  <div className="bcr-fg">
                    <label className="bcr-lb" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><IconPencil size={12} /> 숙제</label>
                    <AutoGrowTextarea className="bcr-fi" rows={2} placeholder="예) 교재 p.53~55 연습문제 1~10번" value={f.homework} onChange={e => setBF(sid, 'homework', e.target.value)} />
                  </div>
                </div>
                <div className="bcr-fr" style={{ marginBottom: 10 }}>
                  <div className="bcr-fg">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 5 }}>
                      <label className="bcr-lb" style={{ margin: 0 }}>숙제 이행률 (%)</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'pointer', color: f.hw_rate_na ? re : tx3 }}>
                          <input type="checkbox" checked={!!f.hw_rate_na}
                            onChange={e => { const c = e.target.checked; setBF(sid, 'hw_rate_na', c); if (c) setBF(sid, 'hw_not_submitted', false) }}
                            style={{ cursor: 'pointer' }} />
                          숙제 없음
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'pointer', color: f.hw_not_submitted ? re : tx3 }}>
                          <input type="checkbox" checked={!!f.hw_not_submitted}
                            onChange={e => { const c = e.target.checked; setBF(sid, 'hw_not_submitted', c); if (c) setBF(sid, 'hw_rate_na', false) }}
                            style={{ cursor: 'pointer' }} />
                          숙제 미제출
                        </label>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="number" className="bcr-fi no-spinner" min={0} max={100}
                        value={f.hw_rate_na || f.hw_not_submitted ? '' : f.hw_rate}
                        disabled={!!f.hw_rate_na || !!f.hw_not_submitted}
                        onChange={e => { const v = e.target.value; setBF(sid, 'hw_rate', v === '' ? '' : Math.min(100, Math.max(0, parseInt(v) || 0))) }}
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        style={{ width: 80, textAlign: 'center', opacity: f.hw_rate_na || f.hw_not_submitted ? 0.4 : 1, background: f.hw_rate_na || f.hw_not_submitted ? bg : '#fff' }}
                        placeholder={f.hw_rate_na ? '해당없음' : f.hw_not_submitted ? '미제출' : '입력'} />
                      <span style={{ color: f.hw_rate_na || f.hw_not_submitted ? tx3 : tx2 }}>%</span>
                    </div>
                  </div>
                  <div className="bcr-fg">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 5 }}>
                      <label className="bcr-lb" style={{ margin: 0 }}>숙제 정답률 (%)</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'pointer', color: f.hw_cor_na ? re : tx3, width: 'fit-content' }}>
                        <input type="checkbox" checked={!!f.hw_cor_na}
                          onChange={e => setBF(sid, 'hw_cor_na', e.target.checked)}
                          style={{ cursor: 'pointer' }} />
                        채점 안함
                      </label>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="number" className="bcr-fi no-spinner" min={0} max={100}
                        value={f.hw_cor_na ? '' : f.hw_cor}
                        disabled={!!f.hw_cor_na}
                        onChange={e => { const v = e.target.value; setBF(sid, 'hw_cor', v === '' ? '' : Math.min(100, Math.max(0, parseInt(v) || 0))) }}
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        style={{ width: 80, textAlign: 'center', opacity: f.hw_cor_na ? 0.4 : 1, background: f.hw_cor_na ? bg : '#fff' }}
                        placeholder={f.hw_cor_na ? '해당없음' : '입력'} />
                      <span style={{ color: f.hw_cor_na ? tx3 : tx2 }}>%</span>
                    </div>
                  </div>
                </div>
                <div className="bcr-fr" style={{ marginBottom: 10 }}>
                  <div className="bcr-fg">
                    <label className="bcr-lb">수업 태도 (1~10점)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="number" className="bcr-fi" min={1} max={10} value={f.attitude} onChange={e => setBF(sid, 'attitude', Math.min(10, Math.max(1, parseInt(e.target.value) || 10)))} style={{ width: 80, textAlign: 'center' }} />
                      <span style={{ color: tx2 }}>점</span>
                    </div>
                  </div>
                  <div className="bcr-fg">
                    <label className="bcr-lb">지각 여부</label>
                    <div className="bcr-rg">
                      <label><input type="radio" name={`bLt${sid}`} checked={!f.late} onChange={() => setBF(sid, 'late', false)} />정시</label>
                      <label><input type="radio" name={`bLt${sid}`} checked={f.late} onChange={() => setBF(sid, 'late', true)} /><span style={{ color: re }}>지각</span></label>
                    </div>
                  </div>
                </div>
                <div className="bcr-fg" style={{ marginBottom: 10 }}>
                  <label className="bcr-lb">시험 여부</label>
                  <div className="bcr-rg">
                    <label><input type="radio" name={`bTs${sid}`} checked={!showT} onChange={() => { setBulkShowTest(p => ({ ...p, [sid]: false })); setBF(sid, 'has_test', false); setBF(sid, 'testItems', []) }} />없음</label>
                    <label><input type="radio" name={`bTs${sid}`} checked={showT} onChange={() => { setBulkShowTest(p => ({ ...p, [sid]: true })); setBF(sid, 'has_test', true); if (!f.testItems?.length) addBulkTestItem(sid) }} /><span style={{ color: navy, fontWeight: 500 }}>있음</span></label>
                  </div>
                  {showT && (
                    <div style={{ marginTop: 8 }}>
                      {(f.testItems || []).map((item, idx) => (
                        <div key={idx} style={{ background: bg, borderRadius: 8, padding: 10, marginBottom: 6, position: 'relative' }}>
                          <button className="bcr-bdng" style={{ position: 'absolute', top: 6, right: 6, padding: '2px 7px' }} onClick={() => removeBulkTestItem(sid, idx)}><IconX size={10} /></button>
                          <div className="bcr-fg" style={{ marginBottom: 6 }}>
                            <select className="bcr-fsel bcr-fi-sm" value={item.testId || ''} onChange={e => setBulkTestItem(sid, idx, 'testId', parseInt(e.target.value) || null)}>
                              <option value="">테스트 선택</option>
                              {tests.map(t => <option key={t.id} value={t.id}>{t.name} ({t.date}, {t.total}문항)</option>)}
                            </select>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                            <div className="bcr-fg"><label className="bcr-lb" style={{ fontSize: 10 }}>총 문제 수</label><input type="number" className="bcr-fi bcr-fi-sm" value={item.tTotal || ''} readOnly placeholder="자동입력" /></div>
                            <div className="bcr-fg"><label className="bcr-lb" style={{ fontSize: 10 }}>정답 수</label><input type="number" className="bcr-fi bcr-fi-sm" min={0} value={item.tCor || ''} onChange={e => setBulkTestItem(sid, idx, 'tCor', parseInt(e.target.value) || 0)} /></div>
                            <div className="bcr-fg"><label className="bcr-lb" style={{ fontSize: 10 }}>점수 (선택)</label><input type="number" className="bcr-fi bcr-fi-sm" min={0} max={100} value={item.tScore || ''} onChange={e => setBulkTestItem(sid, idx, 'tScore', parseInt(e.target.value) || 0)} /></div>
                          </div>
                        </div>
                      ))}
                      <button className="bcr-bout" style={{ marginTop: 4, fontSize: 12 }} onClick={() => addBulkTestItem(sid)}>
                        <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M12 5v14M5 12h14" /></svg> 시험 추가
                      </button>
                    </div>
                  )}
                </div>
                <div className="bcr-fg">
                  <label className="bcr-lb" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><IconChat size={12} /> 개별 피드백</label>
                  <AutoGrowTextarea className="bcr-fi" rows={5} minHeight={120} placeholder="이 학생에 대한 개별 메모" value={f.feedback} onChange={e => setBF(sid, 'feedback', e.target.value)} />
                </div>
              </div>
            )
          })}
          </div>
          )}
        </div>

        <div style={{ padding: mobileMode ? '0 16px 14px' : '0 22px 18px', display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', position: 'sticky', bottom: 0, background: '#fff', borderTop: `1px solid ${bd}`, paddingTop: 12 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, border: `1px solid ${bd}`, background: '#fff', cursor: 'pointer', color: tx2, fontFamily: 'inherit' }}>취소</button>
          <button onClick={saveBulkDraft} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, border: `1px solid ${wa}`, background: 'transparent', cursor: 'pointer', color: wa, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5 }}><IconSave size={13} /> 임시저장</button>
          <button className="bcr-bprim" onClick={saveBulkRec} disabled={saving} style={{ opacity: saving ? 0.7 : 1 }}>{saving ? '저장 중...' : '전체 저장'}</button>
        </div>
      </div>
    </div>
  )
}
