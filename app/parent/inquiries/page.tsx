'use client'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { kstDateOf, kstTimeOf } from '@/lib/kst'
import { useParentChild } from '../layout'
import { IconChat, IconSend, IconClock } from '@/components/icons'

const navy = '#0D2A5E', navyDk = '#071A3E'
const bg = '#F5F7FA', bd = '#DDE3EE'
const tx = '#0D1B36', tx2 = '#4B5C7E', tx3 = '#96A4BF'
const re = '#C0392B', gold = '#D87E13'
// 결석/지각 등록용 — 알림 색(re/gold)보다 톤을 낮춘 차분한 색
const absCol='#A85D52', absBg='#F3E7E4', lateCol='#A67C3D', lateBg='#F3ECDD'

type Msg = {
  id: number; parent_id: number; sender_type: 'parent' | 'admin'
  content: string; created_at: string; updated_at: string | null
}

// 학부모가 등록한 결석/지각 — 본인이 등록한 건만 조회됨 (관리자/선생님/조교 쪽 학원일정에도 함께 표시)
type AttNotice = {
  id: number; student_id: number; date: string
  type: 'absence' | 'late'; reason: string | null
}

function noticeColor(n: AttNotice) {
  return n.type === 'absence'
    ? { bg: absBg, color: absCol, label: '결석', clock: false }
    : { bg: lateBg, color: lateCol, label: '지각', clock: true }
}

export default function ParentInquiriesPage() {
  const { parent } = useAuth()
  const { children } = useParentChild()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // 결석/지각 등록
  const [notices, setNotices] = useState<AttNotice[]>([])
  const [noticeModal, setNoticeModal] = useState(false)
  const [editingNoticeId, setEditingNoticeId] = useState<number | null>(null)
  const [nStudentId, setNStudentId] = useState<number | null>(null)
  const [nType, setNType] = useState<'absence' | 'late'>('absence')
  const [nDate, setNDate] = useState('')
  const [nReason, setNReason] = useState('')
  const [nSubmitting, setNSubmitting] = useState(false)
  const [nErr, setNErr] = useState('')

  useEffect(() => { if (parent?.parentId) fetchMsgs(parent.parentId) }, [parent?.parentId])
  useEffect(() => { if (parent?.parentId) fetchNotices(parent.parentId) }, [parent?.parentId])

  async function fetchMsgs(parentId: number) {
    setLoading(true)
    const { data } = await supabase.from('inquiry_messages').select('*').eq('parent_id', parentId).order('created_at', { ascending: true })
    setMsgs(data ?? [])
    setLoading(false)
  }

  async function fetchNotices(parentId: number) {
    const { data } = await supabase
      .from('attendance_notices')
      .select('id,student_id,date,type,reason')
      .eq('parent_id', parentId)
      .order('date', { ascending: false })
    setNotices((data ?? []) as AttNotice[])
  }

  const didInitialScrollRef = useRef(false)
  useEffect(() => {
    if (loading) return
    // 최초 진입 시에는 애니메이션 없이 즉시 맨 아래로 위치시켜, 로딩 후 화면이
    // 스르륵 아래로 밀리는 것처럼 보이는 현상을 없앤다 (이후 새 메시지는 부드럽게 스크롤)
    const isFirst = !didInitialScrollRef.current
    didInitialScrollRef.current = true
    bottomRef.current?.scrollIntoView({ behavior: isFirst ? 'auto' : 'smooth' })
  }, [msgs.length, loading])

  async function send() {
    if (!parent?.parentId || !input.trim() || sending) return
    setSending(true)
    setErr('')
    const content = input.trim()
    const { data, error } = await supabase.from('inquiry_messages').insert({
      parent_id: parent.parentId, sender_type: 'parent', content,
    }).select('*').single()
    setSending(false)
    if (error) { setErr('전송에 실패했습니다.'); return }
    setMsgs(prev => [...prev, data as Msg])
    setInput('')

    const childNames = children.map(c => c.name).join(', ')
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
      body: JSON.stringify({
        title: '티처스 수학학원',
        body: `${childNames ? childNames + ' 학부모' : '학부모'}님에게서 메시지가 도착했습니다`,
        link: '/inquiries',
      }),
    }).catch(() => {})
  }

  function todayStr_() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  function openNoticeModal() {
    setEditingNoticeId(null)
    setNStudentId(children[0]?.id ?? null)
    setNType('absence')
    setNDate(todayStr_())
    setNReason('')
    setNErr('')
    setNoticeModal(true)
  }

  function openEditNotice(n: AttNotice) {
    setEditingNoticeId(n.id)
    setNStudentId(n.student_id)
    setNType(n.type)
    setNDate(n.date)
    setNReason(n.reason ?? '')
    setNErr('')
    setNoticeModal(true)
  }

  async function submitNotice() {
    if (!parent?.parentId) return
    if (!nStudentId) { setNErr('자녀를 선택하세요.'); return }
    if (!nDate) { setNErr('날짜를 선택하세요.'); return }
    setNSubmitting(true)
    setNErr('')

    if (editingNoticeId) {
      const { error } = await supabase.from('attendance_notices')
        .update({ student_id: nStudentId, date: nDate, type: nType, reason: nReason.trim() || null })
        .eq('id', editingNoticeId)
      setNSubmitting(false)
      if (error) { setNErr('수정에 실패했습니다. 다시 시도해주세요.'); return }
      setNoticeModal(false)
      fetchNotices(parent.parentId)
      return
    }

    const { error } = await supabase.from('attendance_notices').insert({
      parent_id: parent.parentId, student_id: nStudentId, date: nDate, type: nType, reason: nReason.trim() || null,
    })
    setNSubmitting(false)
    if (error) { setNErr('등록에 실패했습니다. 다시 시도해주세요.'); return }
    setNoticeModal(false)
    fetchNotices(parent.parentId)

    const name = children.find(c => c.id === nStudentId)?.name ?? '학생'
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
      body: JSON.stringify({
        title: '티처스 수학학원',
        body: `${name} 학생의 ${nType === 'absence' ? '결석' : '지각'}이 등록되었습니다.`,
        link: '/schedule',
      }),
    }).catch(() => {})
  }

  async function deleteNotice(id: number) {
    if (!parent?.parentId) return
    if (!confirm('이 등록 내역을 삭제하시겠습니까?')) return
    const { error } = await supabase.from('attendance_notices').delete().eq('id', id)
    if (error) return
    fetchNotices(parent.parentId)
  }

  function childName(studentId: number) {
    return children.find(c => c.id === studentId)?.name ?? '자녀'
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <p style={{ fontSize: 20, fontWeight: 700, color: tx, margin: 0 }}>문의하기</p>
          <p style={{ fontSize: 13, color: tx2, marginTop: 4 }}>선생님께 궁금한 점을 편하게 남겨주세요</p>
        </div>
        <button onClick={openNoticeModal} style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '9px 14px', borderRadius: 20,
          border: `1.5px solid ${absCol}55`, background: absBg, color: absCol, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          결석지각 등록
        </button>
      </div>

      {/* 결석/지각 등록 내역 */}
      {notices.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: tx, margin: '0 0 8px' }}>결석·지각 등록 내역</p>
          {notices.map(n => {
            const nc = noticeColor(n)
            return (
              <div key={n.id} style={{ background: nc.bg, borderRadius: 12, padding: '12px 16px', marginBottom: 8, border: `1px solid ${nc.color}33` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ background: '#fff', color: nc.color, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 3 }}>{nc.clock && <IconClock size={10} />}{nc.label}</span>
                  <p style={{ fontSize: 14, fontWeight: 700, color: nc.color, margin: 0 }}>{childName(n.student_id)}</p>
                  <span style={{ fontSize: 12, color: tx2, marginLeft: 'auto' }}>{n.date.slice(5).replace('-', '/')}</span>
                </div>
                {n.reason && <p style={{ fontSize: 13, color: tx2, marginTop: 6, marginBottom: 0 }}>{n.reason}</p>}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={() => openEditNotice(n)} style={{ background: 'none', border: 'none', color: nc.color, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>수정</button>
                  <button onClick={() => deleteNotice(n.id)} style={{ background: 'none', border: 'none', color: nc.color, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0, opacity: .75 }}>삭제</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${bd}`, boxShadow: '0 1px 6px rgba(0,0,0,.06)', minHeight: 300, marginBottom: 90, overflow: 'hidden' }}>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '55vh', overflowY: 'auto' }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: tx3, padding: '40px 0', fontSize: 13 }}>불러오는 중...</p>
          ) : msgs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: tx3 }}>
              <p style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><IconChat size={28} /></p>
              <p style={{ fontSize: 13 }}>아직 문의 내역이 없습니다.<br />아래에 문의사항을 남겨주세요.</p>
            </div>
          ) : msgs.map(m => {
            const isMe = m.sender_type === 'parent'
            return (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                {!isMe && <span style={{ fontSize: 11, color: tx3, marginBottom: 3, marginLeft: 4 }}>선생님</span>}
                <div style={{
                  maxWidth: '78%', padding: '9px 13px', borderRadius: 14, fontSize: 14, lineHeight: 1.55,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  background: isMe ? navy : bg, color: isMe ? '#fff' : tx,
                  borderBottomRightRadius: isMe ? 3 : 14, borderBottomLeftRadius: isMe ? 14 : 3,
                }}>
                  {m.content}
                </div>
                <div style={{ display: 'flex', gap: 5, marginTop: 3 }}>
                  <span style={{ fontSize: 10, color: tx3 }}>{kstDateOf(m.created_at)} {kstTimeOf(m.created_at)}</span>
                  {m.updated_at && <span style={{ fontSize: 10, color: tx3 }}>(수정됨)</span>}
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* 입력창 — 하단 탭바 위에 고정 */}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(62px + env(safe-area-inset-bottom))', zIndex: 90, display: 'flex', justifyContent: 'center', background: '#fff', borderTop: `1px solid ${bd}`, boxShadow: '0 -2px 10px rgba(0,0,0,.05)' }}>
        <div style={{ width: '100%', maxWidth: 640, padding: '10px 16px', boxSizing: 'border-box', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea rows={1} placeholder="문의사항을 입력하세요"
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            style={{ flex: 1, resize: 'none', padding: '9px 12px', border: `1.5px solid ${bd}`, borderRadius: 20, fontSize: 14, fontFamily: 'inherit', color: tx, outline: 'none', boxSizing: 'border-box' }} />
          <button onClick={send} disabled={sending || !input.trim()}
            style={{ flexShrink: 0, width: 40, height: 40, borderRadius: '50%', border: 'none', background: gold, color: navyDk, cursor: sending || !input.trim() ? 'not-allowed' : 'pointer', opacity: sending || !input.trim() ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconSend size={17} />
          </button>
        </div>
      </div>
      {err && <p style={{ position: 'fixed', bottom: 'calc(120px + env(safe-area-inset-bottom))', left: 16, right: 16, textAlign: 'center', fontSize: 12, color: re }}>{err}</p>}

      {/* 결석·지각 등록 모달 */}
      {noticeModal && (
        <div onClick={() => setNoticeModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 400, padding: 20, boxShadow: '0 8px 40px rgba(0,0,0,.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: tx, margin: 0 }}>{editingNoticeId ? '결석지각 수정' : '결석지각 등록'}</p>
              <button onClick={() => setNoticeModal(false)} style={{ background: 'none', border: 'none', fontSize: 18, color: tx3, cursor: 'pointer' }}>×</button>
            </div>

            {children.length > 1 && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, color: tx2, marginBottom: 6 }}>자녀</label>
                <select value={nStudentId ?? ''} onChange={e => setNStudentId(Number(e.target.value))}
                  style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${bd}`, borderRadius: 8, fontSize: 14, fontFamily: 'inherit', color: tx, outline: 'none', background: '#fff' }}>
                  {children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, color: tx2, marginBottom: 6 }}>구분</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setNType('absence')} style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                  border: `1.5px solid ${nType === 'absence' ? absCol : bd}`,
                  background: nType === 'absence' ? absBg : '#fff', color: nType === 'absence' ? absCol : tx2,
                }}>결석</button>
                <button type="button" onClick={() => setNType('late')} style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                  border: `1.5px solid ${nType === 'late' ? lateCol : bd}`,
                  background: nType === 'late' ? lateBg : '#fff', color: nType === 'late' ? lateCol : tx2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                }}><IconClock size={13} /> 지각</button>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, color: tx2, marginBottom: 6 }}>날짜</label>
              <input type="date" value={nDate} onChange={e => setNDate(e.target.value)}
                style={{ width: '100%', maxWidth: '100%', display: 'block', padding: '10px 12px', border: `1.5px solid ${bd}`, borderRadius: 8, fontSize: 14, fontFamily: 'inherit', color: tx, outline: 'none', boxSizing: 'border-box', WebkitAppearance: 'none', appearance: 'none' }} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: tx2, marginBottom: 6 }}>사유 (선택)</label>
              <textarea value={nReason} onChange={e => setNReason(e.target.value)} rows={2} placeholder="예) 감기몸살로 결석합니다"
                style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${bd}`, borderRadius: 8, fontSize: 14, fontFamily: 'inherit', color: tx, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>

            {nErr && <p style={{ fontSize: 12, color: re, marginBottom: 10, marginTop: -6 }}>{nErr}</p>}

            <button onClick={submitNotice} disabled={nSubmitting} style={{
              width: '100%', padding: 13, borderRadius: 8, border: 'none', background: nType === 'absence' ? absCol : lateCol, color: '#fff',
              fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: nSubmitting ? 'not-allowed' : 'pointer', opacity: nSubmitting ? 0.7 : 1,
            }}>
              {nSubmitting ? (editingNoticeId ? '수정 중...' : '등록 중...') : (editingNoticeId ? '수정하기' : '등록하기')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
