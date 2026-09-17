'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useMobileMode } from '@/context/MobileModeContext'
import { IconSend } from '@/components/icons'

type Notice = { id: number; content: string; created_at: string }

const navy = '#0D2A5E', gold = '#D87E13'
const bg = '#F5F7FA', bd = '#DDE3EE'
const tx = '#0D1B36', tx2 = '#4B5C7E', tx3 = '#96A4BF'
const re = '#C0392B'

// 반관리 > 반 상세에서 여는 "공지하기" — 관리자/선생님이 반 전체 학생 계정에
// 채팅 형식으로 일방향 공지를 보낸다. 학생 쪽(/student/notices)은 이 내용을
// 읽기만 하고 답장은 못 한다.
export default function ClassNoticeModal({
  classId, className, onClose,
}: {
  classId: number
  className: string
  onClose: () => void
}) {
  const { mobileMode } = useMobileMode()
  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('class_notices').select('id, content, created_at')
      .eq('class_id', classId).order('created_at', { ascending: true })
    setNotices(data ?? [])
    setLoading(false)
  }

  async function send() {
    const content = draft.trim()
    if (!content) return
    setSending(true); setErr('')
    const { data, error } = await supabase
      .from('class_notices').insert({ class_id: classId, content }).select('id, content, created_at').single()
    setSending(false)
    if (error) { setErr('전송 실패: ' + error.message); return }
    setNotices(ns => [...ns, data as Notice])
    setDraft('')
    notifyStudents(content)
  }

  // 반 소속 학생 각자의 계정에 등록된 기기로 새 공지 푸시를 보낸다 (실패해도 공지 자체는 이미 등록됨)
  async function notifyStudents(content: string) {
    const { data: csRows } = await supabase.from('class_students').select('student_id').eq('class_id', classId)
    const studentIds = [...new Set((csRows ?? []).map(r => r.student_id))]
    const body = content.length > 60 ? content.slice(0, 60) + '…' : content
    await Promise.allSettled(studentIds.map(studentId =>
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          student_id: studentId,
          title: `${className} 공지`,
          body,
          link: '/student/notices',
        }),
      }).catch(() => {})
    ))
  }

  async function remove(id: number) {
    if (!confirm('이 공지를 삭제하시겠습니까? 학생 화면에서도 사라집니다.')) return
    const { error } = await supabase.from('class_notices').delete().eq('id', id)
    if (error) { setErr('삭제 실패: ' + error.message); return }
    setNotices(ns => ns.filter(n => n.id !== id))
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.42)', zIndex: 1000, display: 'flex', alignItems: mobileMode ? 'flex-end' : 'center', justifyContent: 'center', padding: mobileMode ? 0 : 16 }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: mobileMode ? '16px 16px 0 0' : 12, width: 520, maxWidth: '100%',
        maxHeight: mobileMode ? '88vh' : '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,.15)',
      }}>
        <div style={{ padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${bd}` }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: tx, margin: 0 }}>{className} 공지하기</p>
            <p style={{ fontSize: 11.5, color: tx3, margin: '3px 0 0' }}>이 반 학생 계정의 "반 공지사항"에 표시됩니다 (학생은 답장 불가)</p>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: bg, cursor: 'pointer', fontSize: 17, color: tx2 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px', minHeight: 200 }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: tx3, fontSize: 13, padding: '30px 0' }}>불러오는 중...</p>
          ) : notices.length === 0 ? (
            <p style={{ textAlign: 'center', color: tx3, fontSize: 13, padding: '30px 0' }}>아직 보낸 공지가 없습니다</p>
          ) : notices.map(n => (
            <div key={n.id} style={{ marginBottom: 14 }}>
              <div style={{
                maxWidth: '90%', padding: '10px 14px', borderRadius: 12, borderBottomLeftRadius: 3,
                background: bg, fontSize: 13.5, color: tx, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {n.content}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 11, color: tx3 }}>{n.created_at.slice(0, 16).replace('T', ' ')}</span>
                <button onClick={() => remove(n.id)} style={{ fontSize: 11, color: re, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>삭제</button>
              </div>
            </div>
          ))}
        </div>

        {err && <p style={{ fontSize: 12, color: re, margin: '0 22px 8px' }}>{err}</p>}

        <div style={{ padding: '14px 22px', borderTop: `1px solid ${bd}`, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={draft} onChange={e => setDraft(e.target.value)}
            placeholder="반 전체 학생에게 보낼 공지 내용을 입력하세요"
            rows={2}
            style={{ flex: 1, padding: '10px 12px', border: `1.5px solid ${bd}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: tx, outline: 'none', resize: 'none', boxSizing: 'border-box' }}
          />
          <button onClick={send} disabled={sending || !draft.trim()} style={{
            flexShrink: 0, width: 40, height: 40, borderRadius: 8, border: 'none', background: gold, color: '#071A3E',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: sending || !draft.trim() ? 'not-allowed' : 'pointer',
            opacity: sending || !draft.trim() ? .6 : 1,
          }}>
            <IconSend size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
