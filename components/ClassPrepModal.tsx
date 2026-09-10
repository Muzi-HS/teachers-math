'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { kstDateStr, kstNow } from '@/lib/kst'
import AutoGrowTextarea from '@/components/AutoGrowTextarea'
import { IconBook, IconPencil } from '@/components/icons'
import { useMobileMode } from '@/context/MobileModeContext'

type Student = { id: number; name: string; school?: string }

const navy = '#0D2A5E'
const gold = '#D87E13'
const bg = '#F5F7FA', bd = '#DDE3EE'
const tx = '#0D1B36', tx2 = '#4B5C7E', tx3 = '#96A4BF'
const re = '#C0392B', gr = '#1A7F4E'

const DOW = ['일', '월', '화', '수', '목', '금', '토']

// 반관리·수업기록에서 공유하는 '수업 준비' 팝업 — 학생별 지난 숙제를 자동으로 불러와 보여주고,
// 오늘의 진도를 입력해 학생별 "오늘의 공부" 안내문(엑셀, 한 시트=한 학생)을 생성한다.
// 여기서 입력한 진도는 class_prep_progress에 저장되어, 같은 날짜로 "수업기록 작성"을 열면
// 아직 저장된 기록이 없는 학생에 한해 수업 내용(진도) 칸에 자동으로 반영된다.
export default function ClassPrepModal({
  classId, className, students, onClose,
}: {
  classId: number | null
  className: string
  students: Student[]
  onClose: () => void
}) {
  const { mobileMode } = useMobileMode()
  const [chks, setChks] = useState<Record<number, boolean>>({})
  const [prevHomework, setPrevHomework] = useState<Record<number, string>>({})
  const [progress, setProgress] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [notif, setNotif] = useState<{ msg: string; ok: boolean } | null>(null)

  function toast(msg: string, ok = true) { setNotif({ msg, ok }); setTimeout(() => setNotif(null), 3000) }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    const today = kstDateStr()
    const ids = students.map(s => s.id)
    const chksInit: Record<number, boolean> = {}
    students.forEach(s => { chksInit[s.id] = true })

    // 학생별 '바로 직전' 숙제 — 오늘 이전 날짜 중 가장 최근 기록의 숙제 내용
    const { data: recs } = await supabase
      .from('records').select('student_id, date, homework')
      .in('student_id', ids).eq('is_draft', false).lt('date', today)
      .order('date', { ascending: false })
    const prevHw: Record<number, string> = {}
    for (const r of (recs ?? [])) {
      if (!(r.student_id in prevHw)) prevHw[r.student_id] = r.homework ?? ''
    }

    // 이미 오늘자로 준비해둔 진도가 있으면 이어서 편집 가능하도록 불러오기
    const { data: preps } = await supabase
      .from('class_prep_progress').select('student_id, progress, prev_homework')
      .in('student_id', ids).eq('date', today)
    const progInit: Record<number, string> = {}
    for (const p of (preps ?? [])) {
      progInit[p.student_id] = p.progress ?? ''
      if (p.prev_homework) prevHw[p.student_id] = p.prev_homework
    }

    setChks(chksInit)
    setPrevHomework(prevHw)
    setProgress(progInit)
    setLoading(false)
  }

  const checkedStudents = students.filter(s => chks[s.id])

  async function generate() {
    if (checkedStudents.length === 0) return toast('학생을 1명 이상 선택하세요.', false)
    setGenerating(true)
    try {
      const today = kstDateStr()
      const now = kstNow()
      const dateLabel = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}(${DOW[now.getDay()]})`

      // 1) class_prep_progress에 저장 — 수업기록 작성 시 진도 자동 반영용
      const rows = checkedStudents.map(s => ({
        student_id: s.id, date: today,
        progress: progress[s.id] ?? '', prev_homework: prevHomework[s.id] ?? '',
        updated_at: new Date().toISOString(),
      }))
      const { error: saveErr } = await supabase.from('class_prep_progress').upsert(rows, { onConflict: 'student_id,date' })
      if (saveErr) { toast('저장 실패: ' + saveErr.message, false); setGenerating(false); return }

      // 2) today study.xlsx 원본 양식을 100% 그대로 복제해서 학생별 시트를 담은
      //    엑셀 워크북 한 개(시트 여러 장)를 생성 — 스타일/로고/인쇄설정 등은
      //    전혀 건드리지 않고, 서버에서 시트별로 필요한 값만 채워 넣는다.
      const res = await fetch('/api/class-prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          className, dateLabel,
          students: checkedStudents.map(s => ({
            name: s.name, school: s.school || '',
            prevHomework: prevHomework[s.id] || '', progress: progress[s.id] || '',
          })),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        toast('생성 실패: ' + (err?.error ?? res.statusText), false)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `오늘의공부_${className}_${today}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast(`${checkedStudents.length}명 안내문 생성 완료`)
    } catch (e: any) {
      toast('생성 실패: ' + e.message, false)
    } finally {
      setGenerating(false)
    }
  }

  const css = `
    .cp-fi{width:100%;padding:9px 11px;border:1.5px solid ${bd};border-radius:8px;font-size:13px;font-family:inherit;color:${tx};outline:none;background:#fff;box-sizing:border-box;}
    .cp-fi:focus{border-color:${navy};}
    .cp-lb{display:block;font-size:12px;font-weight:500;color:${tx2};margin-bottom:5px;}
    .cp-card{border:1.5px solid ${bd};border-radius:10px;padding:14px;margin-bottom:12px;background:#fff;}
    .cp-modal{width:640px;}
    ${mobileMode ? `
    .cp-modal{width:100%;}
    ` : ''}
  `

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.42)', zIndex: 1000, display: 'flex', alignItems: mobileMode ? 'flex-end' : 'center', justifyContent: 'center', padding: mobileMode ? 0 : 16 }}>
      <style>{css}</style>
      <div className="cp-modal" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: mobileMode ? '16px 16px 0 0' : 12, maxWidth: '100%', maxHeight: mobileMode ? '92vh' : '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.15)' }}>
        <div style={{ padding: '18px 22px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#fff', zIndex: 1, borderBottom: `1px solid ${bd}`, marginBottom: 0, paddingBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: tx }}>{className} 수업 준비</span>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: bg, cursor: 'pointer', fontSize: 17, color: tx2 }}>×</button>
        </div>

        <div style={{ padding: '14px 22px' }}>
          {notif && (
            <div style={{ background: notif.ok ? '#E0F5EB' : '#FDECEA', border: `1px solid ${notif.ok ? gr : re}`, borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: notif.ok ? gr : re }}>
              {notif.msg}
            </div>
          )}

          <p style={{ fontSize: 12, color: tx3, marginBottom: 14 }}>
            학생을 선택하고 오늘의 진도를 입력하면, 학생별 "오늘의 공부" 안내문(엑셀, 원본 양식 그대로)이
            한 워크북에 학생별 시트로 담겨 파일 1개로 다운로드됩니다.
            입력한 진도는 오늘 날짜의 수업기록 작성 시 수업 내용(진도)에 자동으로 반영됩니다.
          </p>

          {loading ? (
            <p style={{ textAlign: 'center', color: tx3, fontSize: 13, padding: '30px 0' }}>불러오는 중...</p>
          ) : students.map(s => (
            <div key={s.id} className="cp-card">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!chks[s.id]} onChange={e => setChks(p => ({ ...p, [s.id]: e.target.checked }))} />
                <span style={{ fontSize: 14, fontWeight: 700, color: tx }}>{s.name}</span>
                {s.school && <span style={{ fontSize: 12, color: tx3 }}>{s.school}</span>}
              </label>
              <div style={{ marginBottom: 8 }}>
                <label className="cp-lb" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><IconPencil size={12} /> 지난 숙제 (자동 입력됨 — 수정 가능)</label>
                <AutoGrowTextarea className="cp-fi" rows={2} value={prevHomework[s.id] ?? ''} onChange={e => setPrevHomework(p => ({ ...p, [s.id]: e.target.value }))} placeholder="이전 숙제 내용" />
              </div>
              <div>
                <label className="cp-lb" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><IconBook size={12} /> 오늘의 진도</label>
                <AutoGrowTextarea className="cp-fi" rows={2} value={progress[s.id] ?? ''} onChange={e => setProgress(p => ({ ...p, [s.id]: e.target.value }))} placeholder="예) 이차함수 그래프 변환 (p.45~52)" />
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: '0 22px 18px', display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', position: 'sticky', bottom: 0, background: '#fff', borderTop: `1px solid ${bd}`, paddingTop: 12 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, border: `1px solid ${bd}`, background: '#fff', cursor: 'pointer', color: tx2, fontFamily: 'inherit' }}>취소</button>
          <button onClick={generate} disabled={generating || loading} style={{
            padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none',
            background: gold, color: '#071A3E', cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.7 : 1, fontFamily: 'inherit',
          }}>
            {generating ? '생성 중...' : `파일 생성 (${checkedStudents.length}명)`}
          </button>
        </div>
      </div>
    </div>
  )
}
