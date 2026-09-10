'use client'
import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx-js-style'
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

// ── 엑셀 스타일(반관리 > 선생님 출근부 다운로드와 동일한 방식: xlsx-js-style로 셀 단위 스타일 지정) ──
const XLSX_FONT = '맑은 고딕'
function setCell(ws: XLSX.WorkSheet, r: number, c: number, style: XLSX.CellStyle) {
  const addr = XLSX.utils.encode_cell({ r, c })
  if (!ws[addr]) ws[addr] = { t: 's', v: '' }
  ws[addr].s = style
}
function titleStyle(): XLSX.CellStyle {
  return { font: { name: XLSX_FONT, sz: 16, bold: true, color: { rgb: '0D2A5E' } }, fill: { fgColor: { rgb: 'E8EEF8' }, patternType: 'solid' }, alignment: { horizontal: 'center', vertical: 'center' }, border: allBorder() }
}
function sectionStyle(): XLSX.CellStyle {
  return { font: { name: XLSX_FONT, sz: 12, bold: true, color: { rgb: '0D2A5E' } }, fill: { fgColor: { rgb: 'E8EEF8' }, patternType: 'solid' }, alignment: { horizontal: 'left', vertical: 'center' }, border: allBorder() }
}
function bodyStyle(): XLSX.CellStyle {
  return { font: { name: XLSX_FONT, sz: 11, color: { rgb: '1A1A1A' } }, alignment: { horizontal: 'left', vertical: 'top', wrapText: true }, border: allBorder() }
}
function infoLabelStyle(): XLSX.CellStyle {
  return { font: { name: XLSX_FONT, sz: 11, bold: true, color: { rgb: 'D87E13' } }, fill: { fgColor: { rgb: 'FEF3E2' }, patternType: 'solid' }, alignment: { horizontal: 'center', vertical: 'center' }, border: allBorder() }
}
function infoValueStyle(): XLSX.CellStyle {
  return { font: { name: XLSX_FONT, sz: 12, bold: true, color: { rgb: '1A1A1A' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: allBorder() }
}
function noteStyle(): XLSX.CellStyle {
  return { font: { name: XLSX_FONT, sz: 9, color: { rgb: '96A4BF' } }, alignment: { horizontal: 'left', vertical: 'center' } }
}
function allBorder() {
  const line = { style: 'thin' as const, color: { rgb: 'CCCCCC' } }
  return { top: line, bottom: line, left: line, right: line }
}
function sheetName(name: string, used: Set<string>) {
  const base = (name.replace(/[\\/?*[\]:]/g, '').trim() || '학생').slice(0, 31)
  let candidate = base, n = 2
  while (used.has(candidate)) {
    const suffix = '_' + n
    candidate = base.slice(0, 31 - suffix.length) + suffix
    n++
  }
  used.add(candidate)
  return candidate
}

const NOTE_LINES = [
  '- 숙제를 해 오지 않을 시 원활한 수업이 어렵습니다.',
  '- 숙제만큼은 책임감을 갖고 수행할 것!!!',
  '- 중단원 종료 후 10문항 테스트',
  '- 대단원 종료 후 22문항 테스트',
  '- 당일 숙제는 부담이 큽니다. 계획을 세워서 분산시켜 공부하세요.',
]

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

      // 2) 학생별 한 시트씩 "오늘의 공부" 안내문 생성
      const wb = XLSX.utils.book_new()
      const used = new Set<string>()
      for (const s of checkedStudents) {
        const aoa: (string | number)[][] = [
          ['오늘의 공부', '', '', '', '', '', '', '', '', ''],
          ['날짜', dateLabel, '', '', '', '', '학교', s.school || '', '', ''],
          ['', '', '', '', '', '', '이름', s.name, '', ''],
          ['', '', '', '', '', '', '', '', '', ''],
          ['1. 숙제 채점 및 오답 정리', '', '', '', '', '', '', '', '', ''],
          [prevHomework[s.id] || '(지난 숙제 없음)', '', '', '', '', '', '', '', '', ''],
          ['', '', '', '', '', '', '', '', '', ''],
          ['2. 오늘의 진도', '', '', '', '', '', '', '', '', ''],
          [progress[s.id] || '', '', '', '', '', '', '', '', '', ''],
          ...Array.from({ length: 12 }, () => ['', '', '', '', '', '', '', '', '', '']),
          ['참고', '', '', '', '', '', '', '', '', ''],
          ...NOTE_LINES.map(l => [l, '', '', '', '', '', '', '', '', '']),
        ]
        const ws = XLSX.utils.aoa_to_sheet(aoa)
        ws['!merges'] = [
          { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
          { s: { r: 1, c: 1 }, e: { r: 1, c: 5 } },
          { s: { r: 1, c: 7 }, e: { r: 1, c: 9 } },
          { s: { r: 2, c: 0 }, e: { r: 2, c: 6 } },
          { s: { r: 2, c: 7 }, e: { r: 2, c: 9 } },
          { s: { r: 4, c: 0 }, e: { r: 4, c: 9 } },
          { s: { r: 5, c: 0 }, e: { r: 5, c: 9 } },
          { s: { r: 7, c: 0 }, e: { r: 7, c: 9 } },
          { s: { r: 8, c: 0 }, e: { r: 8, c: 9 } },
          { s: { r: 20, c: 0 }, e: { r: 20, c: 9 } },
          ...NOTE_LINES.map((_, i) => ({ s: { r: 21 + i, c: 0 }, e: { r: 21 + i, c: 9 } })),
        ]
        ws['!cols'] = Array.from({ length: 10 }, () => ({ wch: 9 }))
        ws['!rows'] = aoa.map((_, i) => (i === 5 || i === 8 ? { hpt: 60 } : undefined)) as any

        setCell(ws, 0, 0, titleStyle())
        setCell(ws, 1, 0, infoLabelStyle()); setCell(ws, 1, 1, infoValueStyle())
        setCell(ws, 1, 7, infoLabelStyle()); setCell(ws, 1, 8, infoValueStyle())
        setCell(ws, 2, 0, infoLabelStyle()); setCell(ws, 2, 7, infoLabelStyle()); setCell(ws, 2, 8, infoValueStyle())
        setCell(ws, 4, 0, sectionStyle())
        setCell(ws, 5, 0, bodyStyle())
        setCell(ws, 7, 0, sectionStyle())
        setCell(ws, 8, 0, bodyStyle())
        setCell(ws, 20, 0, sectionStyle())
        NOTE_LINES.forEach((_, i) => setCell(ws, 21 + i, 0, noteStyle()))

        XLSX.utils.book_append_sheet(wb, ws, sheetName(s.name, used))
      }
      XLSX.writeFile(wb, `오늘의공부_${className}_${today}.xlsx`)
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
            학생을 선택하고 오늘의 진도를 입력하면, 학생별 "오늘의 공부" 안내문(엑셀)이 한 시트씩 생성됩니다.
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
