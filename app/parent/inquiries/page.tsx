'use client'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { kstDateOf, kstTimeOf } from '@/lib/kst'
import { useParentChild } from '../layout'
import { IconChat, IconSend } from '@/components/icons'

const navy = '#0D2A5E', navyDk = '#071A3E'
const bg = '#F5F7FA', bd = '#DDE3EE'
const tx = '#0D1B36', tx2 = '#4B5C7E', tx3 = '#96A4BF'
const re = '#C0392B', gold = '#D87E13'

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
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (parent?.parentId) fetchMsgs(parent.parentId) }, [parent?.parentId])

  async function fetchMsgs(parentId: number) {
    setLoading(true)
    const { data } = await supabase.from('inquiry_messages').select('*').eq('parent_id', parentId).order('created_at', { ascending: true })
    setMsgs(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs.length])

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
        body: `${childNames ? childNames + ' 학부모' : '학부모'}님의 새 문의: ${content.slice(0, 40)}`,
        link: '/inquiries',
      }),
    }).catch(() => {})
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 20, fontWeight: 700, color: tx, margin: 0 }}>문의하기</p>
        <p style={{ fontSize: 13, color: tx2, marginTop: 4 }}>선생님께 궁금한 점을 편하게 남겨주세요</p>
      </div>

      <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${bd}`, boxShadow: '0 1px 6px rgba(0,0,0,.06)', minHeight: 300, marginBottom: 90 }}>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
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
    </div>
  )
}
