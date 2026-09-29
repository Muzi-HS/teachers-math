'use client'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { kstDateOf, kstTimeOf } from '@/lib/kst'
import { useParentChild } from '../layout'
import { IconChat, IconSend } from '@/components/icons'
import { useMobileKeyboardInset } from '@/lib/use-mobile-keyboard-inset'

const navy = 'var(--ui-primary)', navyDk = 'var(--ui-primary-text)'
const bg = 'var(--ui-bg)', bd = 'var(--ui-border)'
const tx = 'var(--ui-text)', tx2 = 'var(--ui-text-2)', tx3 = 'var(--ui-text-3)'
const re = 'var(--ui-danger)', gold = 'var(--ui-primary)'
type Msg = {
  id: number; parent_id: number; sender_type: 'parent' | 'admin'
  content: string; created_at: string; updated_at: string | null
}

export default function ParentInquiriesPage() {
  const { parent } = useAuth()
  const { children } = useParentChild()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')
  const [composing, setComposing] = useState(false)
  const keyboardInset = useMobileKeyboardInset(composing)
  const messagesRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!parent?.sessionToken) return
    let active = true
    void supabase.rpc('client_inquiry_messages', { p_token: parent.sessionToken }).then(({ data }) => {
      if (!active) return
      setMsgs((data ?? []) as Msg[])
      setLoading(false)
    })
    return () => { active = false }
  }, [parent?.sessionToken])

  // 문의 탭을 열면 "선생님 답장 안 읽음" 기준 시각을 지금으로 갱신한다(하단 탭바 뱃지용) —
  // 서버 쪽 읽음 표시가 없어 로컬에 마지막으로 연 시각만 기억한다.
  useEffect(() => {
    if (!parent?.parentId) return
    try { localStorage.setItem(`parent_inquiries_seen_${parent.parentId}`, new Date().toISOString()) } catch {}
    window.dispatchEvent(new Event('inquiry-read'))
  }, [parent?.parentId])

  useEffect(() => {
    if (loading) return
    const list = messagesRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [msgs.length, loading])

  async function send() {
    if (!parent?.parentId || !parent?.sessionToken || !input.trim() || sending) return
    setSending(true)
    setErr('')
    const content = input.trim()
    const { data, error } = await supabase
      .rpc('client_send_inquiry_message', { p_token: parent.sessionToken, p_content: content })
      .single()
    setSending(false)
    if (error) { setErr('전송에 실패했습니다.'); return }
    setMsgs(prev => [...prev, data as Msg])
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'

    const childNames = children.map(c => c.name).join(', ')
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
      body: JSON.stringify({
        title: '티처스 수학학원',
        body: `${childNames ? childNames + ' 학부모' : '학부모'}님에게서 메시지가 도착했습니다`,
        link: `/inquiries?parentId=${parent.parentId}`,
      }),
    }).catch(() => {})
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <p style={{ fontSize: 20, fontWeight: 700, color: tx, margin: 0 }}>문의하기</p>
          <p style={{ fontSize: 13, color: tx2, marginTop: 4 }}>선생님과 대화하며 궁금한 점을 남겨주세요</p>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${bd}`, boxShadow: '0 1px 6px rgba(0,0,0,.06)', minHeight: 300, marginBottom: 90, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${bd}`, fontSize: 12, fontWeight: 600, color: tx2 }}>선생님과의 대화</div>
        <div ref={messagesRef} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 260, maxHeight: composing ? 'calc(100dvh - 240px)' : '55vh', overflowY: 'auto', overscrollBehavior: 'contain' }}>
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
        </div>
      </div>

      {/* 입력창 — 하단 탭바 위에 고정 */}
      <div className="parent-inquiry-composer" style={{ position: 'fixed', left: 0, right: 0, bottom: composing ? keyboardInset : 'calc(70px + env(safe-area-inset-bottom))', zIndex: 110, display: 'flex', justifyContent: 'center', background: '#fff', borderTop: `1px solid ${bd}`, boxShadow: '0 -2px 10px rgba(0,0,0,.05)' }}>
        <div style={{ width: '100%', maxWidth: 640, padding: '10px 16px', boxSizing: 'border-box', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea ref={inputRef} rows={1} aria-label="문의 메시지" placeholder="선생님께 메시지를 보내세요"
            value={input} onFocus={() => { setComposing(true); requestAnimationFrame(() => { const list = messagesRef.current; if (list) list.scrollTop = list.scrollHeight }) }} onBlur={() => setComposing(false)}
            onChange={e => { setInput(e.target.value); e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 128)}px` }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); void send() } }}
            style={{ flex: 1, minWidth: 0, resize: 'none', maxHeight: 128, overflowY: 'auto', padding: '9px 12px', border: `1.5px solid ${bd}`, borderRadius: 20, fontSize: 16, lineHeight: 1.45, fontFamily: 'inherit', color: tx, outline: 'none', boxSizing: 'border-box' }} />
          <button onClick={send} aria-label="메시지 보내기" disabled={sending || !input.trim()}
            style={{ flexShrink: 0, width: 40, height: 40, borderRadius: '50%', border: 'none', background: gold, color: navyDk, cursor: sending || !input.trim() ? 'not-allowed' : 'pointer', opacity: sending || !input.trim() ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconSend size={17} />
          </button>
        </div>
      </div>
      {err && <p style={{ position: 'fixed', bottom: composing ? keyboardInset + 76 : 'calc(145px + env(safe-area-inset-bottom))', left: 16, right: 16, zIndex: 111, textAlign: 'center', fontSize: 12, color: re }}>{err}</p>}
    </div>
  )
}
