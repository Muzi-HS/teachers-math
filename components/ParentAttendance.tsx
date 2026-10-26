'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useParentChild } from '@/app/parent/layout'
import Link from 'next/link'
import { kstDateStr } from '@/lib/kst'

type Notice = { id: number; student_id: number; date: string; type: 'absence' | 'late'; reason: string | null }

export default function ParentAttendance({ selectedChild }: { selectedChild: number }) {
  const { parent } = useAuth()
  const { children } = useParentChild()
  const [open, setOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [month, setMonth] = useState(() => kstDateStr().slice(0, 7))
  const historyDialog = useRef<HTMLDialogElement>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [notices, setNotices] = useState<Notice[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [studentId, setStudentId] = useState(selectedChild)
  const [kind, setKind] = useState<'absence' | 'late'>('absence')
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const dialog = historyDialog.current
    if (!historyOpen || !dialog) return
    dialog.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { dialog.close(); document.body.style.overflow = previousOverflow }
  }, [historyOpen])

  function moveMonth(offset: number) {
    const [year, current] = month.split('-').map(Number)
    const next = new Date(year, current - 1 + offset, 1)
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`)
  }

  useEffect(() => { if (parent?.sessionToken) refresh(parent.sessionToken) }, [parent?.sessionToken])
  async function refresh(token: string) {
    setLoadingHistory(true)
    setHistoryError('')
    try {
      const { data, error: loadError } = await supabase.rpc('client_attendance_notices', { p_token: token })
      if (loadError) throw loadError
      setNotices((data ?? []) as Notice[])
    } catch { setHistoryError('등록 내역을 불러오지 못했습니다. 다시 시도해주세요.') }
    finally { setLoadingHistory(false) }
  }
  function start(notice?: Notice) {
    setHistoryOpen(false)
    setEditingId(notice?.id ?? null)
    setStudentId(notice?.student_id ?? selectedChild)
    setKind(notice?.type ?? 'absence')
    setDate(notice?.date ?? kstDateStr())
    setReason(notice?.reason ?? '')
    setError('')
    setOpen(true)
  }
  async function save() {
    if (!parent?.sessionToken || busy) return
    if (!studentId || !date) { setError('자녀와 날짜를 선택해주세요.'); return }
    setBusy(true)
    const { error: saveError } = await supabase.rpc('client_upsert_attendance_notice', {
      p_token: parent.sessionToken, p_id: editingId, p_student_id: studentId,
      p_date: date, p_type: kind, p_reason: reason.trim() || null,
    })
    setBusy(false)
    if (saveError) { setError('저장하지 못했습니다. 다시 시도해주세요.'); return }
    setOpen(false)
    setMonth(date.slice(0, 7))
    refresh(parent.sessionToken)
    if (!editingId) {
      const name = children.find(c => c.id === studentId)?.name ?? '학생'
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ title: '지각·결석 등록', body: `${name} 학생의 ${kind === 'absence' ? '결석' : '지각'}이 등록되었습니다.`, link: `/inquiries?parentId=${parent.parentId}` }),
      }).catch(() => {})
    }
  }
  async function remove(id: number) {
    if (!parent?.sessionToken || !confirm('이 등록 내역을 삭제하시겠습니까?')) return
    const { error: deleteError } = await supabase.rpc('client_delete_attendance_notice', { p_token: parent.sessionToken, p_id: id })
    if (deleteError) { setError('삭제하지 못했습니다. 다시 시도해주세요.'); return }
    refresh(parent.sessionToken)
  }
  const visible = notices.filter(n => n.student_id === studentId && n.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
  const fieldStyle = { width: '100%', padding: '11px 12px', border: '1px solid #DDE8DF', borderRadius: 9, boxSizing: 'border-box' as const, font: 'inherit' }
  return <>
    <button onClick={() => start()} style={{ flex: 1, minHeight: 42, background: '#fff', border: '1px solid #E1E9E1', borderRadius: 8, color: '#203F30', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>지각·결석 등록</button>
    <p style={{ flexBasis: '100%', fontSize: 11, color: '#6A7B6E', margin: '4px 0' }}>등록 내용은 문의하기로 자동 전달됩니다. <Link href="/parent/inquiries" style={{ color: '#2B6B45', fontWeight: 600 }}>문의·답변 확인</Link></p>
    {historyOpen && <dialog ref={historyDialog} aria-labelledby="attendance-history-title" onClose={() => setHistoryOpen(false)} onClick={e => { if (e.target === e.currentTarget) setHistoryOpen(false) }} style={{ padding: 0, border: '1px solid #E1E9E1', borderRadius: 16, width: 'calc(100% - 32px)', maxWidth: 480, maxHeight: '85dvh', color: '#203F30', background: '#fff', overflow: 'hidden' }}>
      <style>{`dialog[aria-labelledby="attendance-history-title"]::backdrop { background: rgba(0,0,0,.45); }`}</style>
      <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '85dvh' }}>
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #E1E9E1', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <strong id="attendance-history-title">지각·결석 등록 내역</strong>
            <button autoFocus aria-label="등록 내역 닫기" onClick={() => setHistoryOpen(false)} style={{ border: 0, background: 'none', fontSize: 24, minWidth: 36, minHeight: 36, cursor: 'pointer' }}>×</button>
          </div>
          <p style={{ fontSize: 12, color: '#6A7B6E', margin: '4px 0 14px' }}>{children.find(c => c.id === studentId)?.name} 학생</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button aria-label="이전 달" onClick={() => moveMonth(-1)} style={{ minWidth: 36, minHeight: 40, border: '1px solid #E1E9E1', borderRadius: 8, background: '#fff', cursor: 'pointer' }}>‹</button>
            <input aria-label="조회 월" type="month" value={month} onChange={e => { if (e.target.value) setMonth(e.target.value) }} style={{ ...fieldStyle, flex: 1, minWidth: 0, width: 'auto', textAlign: 'center' }} />
            <button aria-label="다음 달" onClick={() => moveMonth(1)} style={{ minWidth: 36, minHeight: 40, border: '1px solid #E1E9E1', borderRadius: 8, background: '#fff', cursor: 'pointer' }}>›</button>
          </div>
          {!loadingHistory && !historyError && <p aria-live="polite" style={{ fontSize: 12, margin: '12px 0 0', color: '#6A7B6E' }}>결석 {visible.filter(n => n.type === 'absence').length}건 · 지각 {visible.filter(n => n.type === 'late').length}건</p>}
        </div>
        <div key={`${studentId}-${month}`} style={{ padding: '14px 20px', overflowY: 'auto', overscrollBehavior: 'contain', minHeight: 0 }}>
      {loadingHistory ? <p role="status" style={{ fontSize: 13 }}>불러오는 중...</p> : historyError ? <div><p role="alert" style={{ color: '#C2483C', fontSize: 12 }}>{historyError}</p><button onClick={() => { if (parent?.sessionToken) void refresh(parent.sessionToken) }}>다시 시도</button></div> : visible.length === 0 ? <p style={{ padding: '24px 0', textAlign: 'center', color: '#6A7B6E', fontSize: 13 }}>선택한 월의 등록 내역이 없습니다.</p> : visible.map(n => <div key={n.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '12px', marginBottom: 10, background: '#F6F8F4', borderRadius: 9, fontSize: 12, color: '#203F30' }}>
        <b style={{ color: n.type === 'absence' ? '#C2483C' : '#A66A12' }}>{n.type === 'absence' ? '결석' : '지각'}</b><span style={{ flex: 1 }}>{n.date}</span>
        <button onClick={() => start(n)} style={{ border: 0, background: 'none', color: '#2B6B45', cursor: 'pointer' }}>수정</button>
        <button onClick={() => remove(n.id)} style={{ border: 0, background: 'none', color: '#C2483C', cursor: 'pointer' }}>삭제</button>
        <p style={{ flexBasis: '100%', margin: '4px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.7 }}>{n.reason || '사유 미입력'}</p>
      </div>)}
        {error && <p role="alert" style={{ color: '#C2483C', fontSize: 12 }}>{error}</p>}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #E1E9E1', fontSize: 12, flexShrink: 0 }}><Link href="/parent/inquiries" style={{ color: '#2B6B45', fontWeight: 600 }}>문의하기에서 답변 확인 →</Link></div>
      </div>
    </dialog>}
    {open && <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label="지각·결석 등록" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 400, padding: 20, boxShadow: '0 8px 40px rgba(0,0,0,.2)', display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><strong>{editingId ? '지각·결석 수정' : '지각·결석 등록'}</strong><button aria-label="닫기" onClick={() => setOpen(false)} style={{ border: 0, background: 'none', fontSize: 22, cursor: 'pointer' }}>×</button></div>
        {children.length > 1 && <label style={{ fontSize: 12 }}>자녀<select value={studentId} onChange={e => setStudentId(Number(e.target.value))} style={{ ...fieldStyle, marginTop: 6 }}>{children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        <div style={{ display: 'flex', gap: 8 }}>{(['absence', 'late'] as const).map(t => <button key={t} onClick={() => setKind(t)} aria-pressed={kind === t} style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px solid ${kind === t ? '#2B6B45' : '#DDE8DF'}`, background: kind === t ? '#E7F3EA' : '#fff', color: '#203F30', cursor: 'pointer' }}>{t === 'absence' ? '결석' : '지각'}</button>)}<button onClick={() => { setMonth(kstDateStr().slice(0, 7)); setError(''); setHistoryOpen(true); if (parent?.sessionToken) void refresh(parent.sessionToken) }} style={{ flex: 1, padding: 10, border: '1px solid #DDE8DF', borderRadius: 8, background: '#F6F8F4', color: '#203F30', whiteSpace: 'nowrap', cursor: 'pointer' }}>등록 내역</button></div>
        <label style={{ fontSize: 12 }}>날짜<input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...fieldStyle, marginTop: 6 }} /></label>
        <label style={{ fontSize: 12 }}>사유 (선택)<textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="예) 감기몸살로 결석합니다" style={{ ...fieldStyle, marginTop: 6, resize: 'vertical' }} /></label>
        {error && <p role="alert" style={{ color: '#C2483C', fontSize: 12, margin: 0 }}>{error}</p>}
        <button onClick={save} disabled={busy} style={{ minHeight: 44, border: 0, borderRadius: 8, background: '#2B6B45', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>{busy ? '저장 중...' : editingId ? '수정하기' : '등록하기'}</button>
      </div>
    </div>}
  </>
}
