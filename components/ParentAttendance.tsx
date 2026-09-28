'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useParentChild } from '@/app/parent/layout'

type Notice = { id: number; student_id: number; date: string; type: 'absence' | 'late'; reason: string | null }

export default function ParentAttendance({ selectedChild }: { selectedChild: number }) {
  const { parent } = useAuth()
  const { children } = useParentChild()
  const [open, setOpen] = useState(false)
  const [notices, setNotices] = useState<Notice[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [studentId, setStudentId] = useState(selectedChild)
  const [kind, setKind] = useState<'absence' | 'late'>('absence')
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (parent?.sessionToken) refresh(parent.sessionToken) }, [parent?.sessionToken])
  async function refresh(token: string) {
    const { data } = await supabase.rpc('client_attendance_notices', { p_token: token })
    setNotices((data ?? []) as Notice[])
  }
  function start(notice?: Notice) {
    setEditingId(notice?.id ?? null)
    setStudentId(notice?.student_id ?? selectedChild)
    setKind(notice?.type ?? 'absence')
    const now = new Date()
    setDate(notice?.date ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`)
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
    refresh(parent.sessionToken)
    if (!editingId) {
      const name = children.find(c => c.id === studentId)?.name ?? '학생'
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ title: '지각·결석 등록', body: `${name} 학생의 ${kind === 'absence' ? '결석' : '지각'}이 등록되었습니다.`, link: '/schedule' }),
      }).catch(() => {})
    }
  }
  async function remove(id: number) {
    if (!parent?.sessionToken || !confirm('이 등록 내역을 삭제하시겠습니까?')) return
    const { error: deleteError } = await supabase.rpc('client_delete_attendance_notice', { p_token: parent.sessionToken, p_id: id })
    if (deleteError) { setError('삭제하지 못했습니다. 다시 시도해주세요.'); return }
    refresh(parent.sessionToken)
  }
  const visible = notices.filter(n => n.student_id === selectedChild)
  const fieldStyle = { width: '100%', padding: '11px 12px', border: '1px solid #DDE8DF', borderRadius: 9, boxSizing: 'border-box' as const, font: 'inherit' }
  return <>
    <button onClick={() => start()} style={{ flex: 1, minHeight: 42, background: '#fff', border: '1px solid #E1E9E1', borderRadius: 8, color: '#203F30', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>지각·결석 등록</button>
    {visible.length > 0 && <div style={{ flexBasis: '100%', marginTop: 4 }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: '#203F30', margin: '4px 0 8px' }}>지각·결석 등록 내역</p>
      {visible.map(n => <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', marginBottom: 6, background: '#F6F8F4', borderRadius: 9, fontSize: 12, color: '#203F30' }}>
        <b>{n.type === 'absence' ? '결석' : '지각'}</b><span>{n.date}</span><span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.reason}</span>
        <button onClick={() => start(n)} style={{ border: 0, background: 'none', color: '#2B6B45', cursor: 'pointer' }}>수정</button>
        <button onClick={() => remove(n.id)} style={{ border: 0, background: 'none', color: '#C2483C', cursor: 'pointer' }}>삭제</button>
      </div>)}
    </div>}
    {open && <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label="지각·결석 등록" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 400, padding: 20, boxShadow: '0 8px 40px rgba(0,0,0,.2)', display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><strong>{editingId ? '지각·결석 수정' : '지각·결석 등록'}</strong><button aria-label="닫기" onClick={() => setOpen(false)} style={{ border: 0, background: 'none', fontSize: 22, cursor: 'pointer' }}>×</button></div>
        {children.length > 1 && <label style={{ fontSize: 12 }}>자녀<select value={studentId} onChange={e => setStudentId(Number(e.target.value))} style={{ ...fieldStyle, marginTop: 6 }}>{children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        <div style={{ display: 'flex', gap: 8 }}>{(['absence', 'late'] as const).map(t => <button key={t} onClick={() => setKind(t)} aria-pressed={kind === t} style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px solid ${kind === t ? '#2B6B45' : '#DDE8DF'}`, background: kind === t ? '#E7F3EA' : '#fff', color: '#203F30', cursor: 'pointer' }}>{t === 'absence' ? '결석' : '지각'}</button>)}</div>
        <label style={{ fontSize: 12 }}>날짜<input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...fieldStyle, marginTop: 6 }} /></label>
        <label style={{ fontSize: 12 }}>사유 (선택)<textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="예) 감기몸살로 결석합니다" style={{ ...fieldStyle, marginTop: 6, resize: 'vertical' }} /></label>
        {error && <p role="alert" style={{ color: '#C2483C', fontSize: 12, margin: 0 }}>{error}</p>}
        <button onClick={save} disabled={busy} style={{ minHeight: 44, border: 0, borderRadius: 8, background: '#2B6B45', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>{busy ? '저장 중...' : editingId ? '수정하기' : '등록하기'}</button>
      </div>
    </div>}
  </>
}
