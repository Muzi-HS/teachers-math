'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { kstDateOf, kstTimeOf } from '@/lib/kst'
import { IconChat, IconPencil, IconTrash, IconArrowLeft } from '@/components/icons'
import { useMobileMode } from '@/context/MobileModeContext'

const navy = '#0D2A5E', navyDk = '#071A3E', navyM = '#E8EEF8'
const gold = '#D87E13', goldL = '#F09830'
const bg = '#F5F7FA', bd = '#DDE3EE'
const tx = '#0D1B36', tx2 = '#4B5C7E', tx3 = '#96A4BF'
const re = '#C0392B', rbg = '#FDECEA', gr = '#1A7F4E', gbg = '#E0F5EB'

type Msg = {
  id: number; parent_id: number; sender_type: 'parent' | 'admin'
  sender_teacher_id: string | null; content: string
  created_at: string; updated_at: string | null; is_read: boolean
}
type ParentRow = { id: number; phone: string; name: string | null }

function fmtPhone(p: string) {
  if (!p) return '-'
  const n = p.replace(/-/g, '')
  return n.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3') || p
}

export default function AdminInquiriesPage() {
  const { teacher } = useAuth()
  const { mobileMode } = useMobileMode()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [parentsMap, setParentsMap] = useState<Record<number, ParentRow>>({})
  const [childrenMap, setChildrenMap] = useState<Record<number, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [selParentId, setSelParentId] = useState<number | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [search, setSearch] = useState('')
  const [notif, setNotif] = useState<{ msg: string; ok: boolean } | null>(null)
  const [newMsgModal, setNewMsgModal] = useState(false)
  const [studentSearch, setStudentSearch] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  function toast(msg: string, ok = true) { setNotif({ msg, ok }); setTimeout(() => setNotif(null), 3000) }

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: m }, { data: p }] = await Promise.all([
      supabase.from('inquiry_messages').select('*').order('created_at', { ascending: true }),
      supabase.from('parents').select('id, phone, name, parent_students(students(name))'),
    ])
    setMsgs(m ?? [])
    const pmap: Record<number, ParentRow> = {}
    const cmap: Record<number, string[]> = {}
    for (const row of (p ?? []) as any[]) {
      pmap[row.id] = { id: row.id, phone: row.phone, name: row.name }
      cmap[row.id] = (row.parent_students ?? []).map((ps: any) => ps.students?.name).filter(Boolean)
    }
    setParentsMap(pmap)
    setChildrenMap(cmap)
    setLoading(false)
  }

  // 학부모별 대화 요약 (최근 메시지 순 정렬, 미확인 학부모 메시지 개수 포함)
  const conversations = useMemo(() => {
    const byParent = new Map<number, Msg[]>()
    for (const m of msgs) {
      if (!byParent.has(m.parent_id)) byParent.set(m.parent_id, [])
      byParent.get(m.parent_id)!.push(m)
    }
    const list = [...byParent.entries()].map(([parentId, list]) => {
      const last = list[list.length - 1]
      const unread = list.filter(m => m.sender_type === 'parent' && !m.is_read).length
      return { parentId, last, unread, count: list.length }
    })
    list.sort((a, b) => b.last.created_at.localeCompare(a.last.created_at))
    if (!search.trim()) return list
    const q = search.trim()
    return list.filter(c => {
      const p = parentsMap[c.parentId]
      const names = (childrenMap[c.parentId] ?? []).join(' ')
      return names.includes(q) || (p?.phone ?? '').includes(q.replace(/-/g, ''))
    })
  }, [msgs, search, parentsMap, childrenMap])

  // 새 문의 대상 선택용 — 전체 학부모의 자녀 목록을 학생 이름 기준으로 펼친 목록
  const studentOptions = useMemo(() => {
    const list: { parentId: number; studentName: string; phone: string }[] = []
    for (const pid in parentsMap) {
      const parentId = Number(pid)
      const names = childrenMap[parentId] ?? []
      for (const studentName of names) list.push({ parentId, studentName, phone: parentsMap[parentId]?.phone ?? '' })
    }
    list.sort((a, b) => a.studentName.localeCompare(b.studentName, 'ko'))
    if (!studentSearch.trim()) return list
    const q = studentSearch.trim()
    return list.filter(o => o.studentName.includes(q) || o.phone.includes(q.replace(/-/g, '')))
  }, [parentsMap, childrenMap, studentSearch])

  function startNewThread(parentId: number) {
    setNewMsgModal(false)
    setStudentSearch('')
    openThread(parentId)
  }

  const threadMsgs = selParentId ? msgs.filter(m => m.parent_id === selParentId) : []

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [threadMsgs.length, selParentId])

  async function openThread(parentId: number) {
    setSelParentId(parentId)
    setEditingId(null)
    const unreadIds = msgs.filter(m => m.parent_id === parentId && m.sender_type === 'parent' && !m.is_read).map(m => m.id)
    if (unreadIds.length === 0) return
    setMsgs(prev => prev.map(m => unreadIds.includes(m.id) ? { ...m, is_read: true } : m))
    await supabase.from('inquiry_messages').update({ is_read: true }).in('id', unreadIds)
  }

  async function sendReply() {
    if (!selParentId || !input.trim() || sending) return
    setSending(true)
    const content = input.trim()
    const { data, error } = await supabase.from('inquiry_messages').insert({
      parent_id: selParentId, sender_type: 'admin', sender_teacher_id: teacher?.userId ?? null, content,
    }).select('*').single()
    setSending(false)
    if (error) return toast('전송 실패: ' + error.message, false)
    setMsgs(prev => [...prev, data as Msg])
    setInput('')

    const p = parentsMap[selParentId]
    if (p?.phone) {
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          parent_phone: p.phone,
          title: '티처스 수학학원',
          body: `학원에서 메시지가 도착했습니다`,
          link: '/parent/inquiries',
        }),
      }).catch(() => {})
    }
  }

  function startEdit(m: Msg) { setEditingId(m.id); setEditText(m.content) }
  function cancelEdit() { setEditingId(null); setEditText('') }
  async function saveEdit(id: number) {
    if (!editText.trim()) return
    const updated_at = new Date().toISOString()
    const { error } = await supabase.from('inquiry_messages').update({ content: editText.trim(), updated_at }).eq('id', id)
    if (error) return toast('수정 실패: ' + error.message, false)
    setMsgs(prev => prev.map(m => m.id === id ? { ...m, content: editText.trim(), updated_at } : m))
    setEditingId(null)
  }
  async function deleteMsg(id: number) {
    if (!confirm('이 답변을 삭제하시겠습니까?')) return
    const { error } = await supabase.from('inquiry_messages').delete().eq('id', id)
    if (error) return toast('삭제 실패: ' + error.message, false)
    setMsgs(prev => prev.filter(m => m.id !== id))
  }

  const selParent = selParentId ? parentsMap[selParentId] : null
  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0)

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
    .iq-list-item{display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:pointer;border-bottom:1px solid ${bd};transition:background .15s;}
    .iq-list-item:hover{background:${bg};}
    .iq-list-item.active{background:${navyM};}
    .iq-av{width:38px;height:38px;border-radius:50%;background:${navyM};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:${navy};flex-shrink:0;}
    .iq-bubble{max-width:72%;padding:9px 13px;border-radius:14px;font-size:13px;line-height:1.55;white-space:pre-wrap;word-break:break-word;}
    .iq-fi{width:100%;padding:9px 11px;border:1.5px solid ${bd};border-radius:8px;font-size:13px;font-family:inherit;color:${tx};outline:none;background:#fff;box-sizing:border-box;}
    .iq-fi:focus{border-color:${navy};}
    .iq-sbox{display:flex;align-items:center;gap:7px;padding:8px 12px;background:#fff;border:1px solid ${bd};border-radius:8px;}
    .iq-sbox input{border:none;outline:none;font-size:13px;font-family:inherit;color:${tx};background:transparent;width:100%;}
  `

  const showList = !mobileMode || !selParentId
  const showThread = !mobileMode || !!selParentId

  return (
    <div style={{ padding: mobileMode ? '16px 14px 88px' : '28px 32px', fontFamily: "'Noto Sans KR',sans-serif", height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <style>{css}</style>

      {notif && (
        <div style={{ position: 'fixed', top: 18, right: 18, zIndex: 9999, background: '#fff', borderRadius: 8, padding: '11px 14px', borderLeft: `4px solid ${notif.ok ? gr : re}`, boxShadow: '0 4px 18px rgba(0,0,0,.1)', minWidth: 200 }}>
          <div style={{ fontWeight: 600, marginBottom: 2, color: tx, fontSize: 13 }}>{notif.ok ? '완료' : '알림'}</div>
          <div style={{ fontSize: 12, color: tx2 }}>{notif.msg}</div>
        </div>
      )}

      {(!mobileMode || !selParentId) && (
        <div style={{ marginBottom: mobileMode ? 12 : 16, flexShrink: 0 }}>
          <h1 style={{ fontSize: mobileMode ? 17 : 21, fontWeight: 700, color: tx }}>문의하기</h1>
          <p style={{ fontSize: 13, color: tx2, marginTop: 4 }}>
            학부모 문의 및 답변 {totalUnread > 0 && <span style={{ color: re, fontWeight: 600 }}>· 안읽음 {totalUnread}건</span>}
          </p>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: 'flex', background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, boxShadow: '0 1px 4px rgba(0,0,0,.06)', overflow: 'hidden' }}>
        {/* 좌측: 대화 목록 */}
        {showList && (
        <div style={{ width: mobileMode ? '100%' : 300, flexShrink: 0, borderRight: mobileMode ? 'none' : `1px solid ${bd}`, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 12, borderBottom: `1px solid ${bd}`, display: 'flex', gap: 8 }}>
            <div className="iq-sbox" style={{ flex: 1 }}>
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke={tx3}><circle cx="11" cy="11" r="8" strokeWidth={2} /><path strokeWidth={2} d="M21 21l-4.35-4.35" /></svg>
              <input placeholder="학생 이름 또는 전화번호 검색" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <button onClick={() => setNewMsgModal(true)} title="새 문의 보내기" style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, borderRadius: 8, border: 'none', background: gold, color: navyDk, cursor: 'pointer',
            }}>
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}><path d="M12 5v14M5 12h14" /></svg>
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <p style={{ color: tx3, fontSize: 13, textAlign: 'center', padding: 20 }}>불러오는 중...</p>
            ) : conversations.length === 0 ? (
              <p style={{ color: tx3, fontSize: 13, textAlign: 'center', padding: 20 }}>문의가 없습니다</p>
            ) : conversations.map(c => {
              const p = parentsMap[c.parentId]
              const names = childrenMap[c.parentId] ?? []
              const label = names.length > 0 ? names.join(', ') + ' 학부모' : fmtPhone(p?.phone ?? '')
              return (
                <div key={c.parentId} className={`iq-list-item${selParentId === c.parentId ? ' active' : ''}`} onClick={() => openThread(c.parentId)}>
                  <div className="iq-av">{names[0]?.[0] ?? '?'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                      <span style={{ fontSize: 10, color: tx3, flexShrink: 0 }}>{kstTimeOf(c.last.created_at)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: tx3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {c.last.sender_type === 'admin' ? '나: ' : ''}{c.last.content}
                      </span>
                      {c.unread > 0 && (
                        <span style={{ flexShrink: 0, background: re, color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 20, padding: '1px 6px', minWidth: 16, textAlign: 'center' }}>{c.unread}</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        )}

        {/* 우측: 채팅창 */}
        {showThread && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {!selParentId ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: tx3 }}>
              <p style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><IconChat size={32} /></p>
              <p style={{ fontSize: 13 }}>왼쪽에서 대화를 선택하세요</p>
            </div>
          ) : (
            <>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${bd}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                {mobileMode && (
                  <button onClick={() => setSelParentId(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: tx2, display: 'flex', padding: 2, flexShrink: 0 }}>
                    <IconArrowLeft size={16} />
                  </button>
                )}
                <div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: tx }}>
                    {(childrenMap[selParentId]?.length ?? 0) > 0 ? childrenMap[selParentId].join(', ') + ' 학부모' : '학부모'}
                  </span>
                  <span style={{ fontSize: 12, color: tx3, marginLeft: 8 }}>{fmtPhone(selParent?.phone ?? '')}</span>
                </div>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {threadMsgs.length === 0 && (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: tx3 }}>
                    <p style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><IconChat size={28} /></p>
                    <p style={{ fontSize: 13 }}>아직 대화가 없습니다. 첫 메시지를 보내보세요.</p>
                  </div>
                )}
                {threadMsgs.map(m => {
                  const isAdmin = m.sender_type === 'admin'
                  const isEditing = editingId === m.id
                  return (
                    <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isAdmin ? 'flex-end' : 'flex-start' }}>
                      {isEditing ? (
                        <div style={{ width: '72%' }}>
                          <textarea className="iq-fi" rows={2} style={{ resize: 'vertical' }} value={editText} onChange={e => setEditText(e.target.value)} autoFocus />
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
                            <button onClick={cancelEdit} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${bd}`, background: '#fff', color: tx2, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>취소</button>
                            <button onClick={() => saveEdit(m.id)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: navy, color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>저장</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, flexDirection: isAdmin ? 'row-reverse' : 'row' }}>
                            <div className="iq-bubble" style={{ background: isAdmin ? navy : bg, color: isAdmin ? '#fff' : tx, borderBottomRightRadius: isAdmin ? 3 : 14, borderBottomLeftRadius: isAdmin ? 14 : 3 }}>
                              {m.content}
                            </div>
                            {isAdmin && (
                              <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                                <button onClick={() => startEdit(m)} title="수정" style={{ border: 'none', background: 'none', cursor: 'pointer', color: tx3, padding: 2, display: 'flex' }}><IconPencil size={11} /></button>
                                <button onClick={() => deleteMsg(m.id)} title="삭제" style={{ border: 'none', background: 'none', cursor: 'pointer', color: tx3, padding: 2, display: 'flex' }}><IconTrash size={11} /></button>
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 5, marginTop: 3 }}>
                            <span style={{ fontSize: 10, color: tx3 }}>{kstDateOf(m.created_at)} {kstTimeOf(m.created_at)}</span>
                            {m.updated_at && <span style={{ fontSize: 10, color: tx3 }}>(수정됨)</span>}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>

              <div style={{ padding: mobileMode ? '14px 14px 14px 64px' : 14, borderTop: `1px solid ${bd}`, display: 'flex', gap: 8, flexShrink: 0 }}>
                <textarea className="iq-fi" rows={1} style={{ resize: 'none' }} placeholder="답변을 입력하세요 (Enter 전송, Shift+Enter 줄바꿈)"
                  value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }} />
                <button onClick={sendReply} disabled={sending || !input.trim()}
                  style={{ flexShrink: 0, padding: '0 18px', borderRadius: 8, border: 'none', background: gold, color: navyDk, fontSize: 13, fontWeight: 700, cursor: sending || !input.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: sending || !input.trim() ? 0.6 : 1 }}>
                  전송
                </button>
              </div>
            </>
          )}
        </div>
        )}
      </div>

      {/* 새 문의 보내기 — 학생 선택 모달 */}
      {newMsgModal && (
        <div onClick={() => { setNewMsgModal(false); setStudentSearch('') }} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.42)', zIndex: 1000,
          display: 'flex', alignItems: mobileMode ? 'flex-end' : 'center', justifyContent: 'center',
          padding: mobileMode ? 0 : 16,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', width: mobileMode ? '100%' : 420, maxWidth: '100%',
            maxHeight: mobileMode ? '80vh' : '75vh', display: 'flex', flexDirection: 'column',
            borderRadius: mobileMode ? '16px 16px 0 0' : 12,
            boxShadow: '0 -8px 30px rgba(0,0,0,.15)',
          }}>
            <div style={{ padding: '16px 18px 12px', borderBottom: `1px solid ${bd}`, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: tx }}>새 문의 보내기</span>
                <button onClick={() => { setNewMsgModal(false); setStudentSearch('') }} style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: bg, cursor: 'pointer', fontSize: 15, color: tx2 }}>×</button>
              </div>
              <div className="iq-sbox">
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke={tx3}><circle cx="11" cy="11" r="8" strokeWidth={2} /><path strokeWidth={2} d="M21 21l-4.35-4.35" /></svg>
                <input autoFocus placeholder="학생 이름 또는 학부모 전화번호 검색" value={studentSearch} onChange={e => setStudentSearch(e.target.value)} />
              </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {studentOptions.length === 0 ? (
                <p style={{ color: tx3, fontSize: 13, textAlign: 'center', padding: 24 }}>일치하는 학생이 없습니다</p>
              ) : studentOptions.map((o, idx) => (
                <div key={o.parentId + '-' + o.studentName} className="iq-list-item" onClick={() => startNewThread(o.parentId)} style={{ borderBottom: idx < studentOptions.length - 1 ? `1px solid ${bd}` : 'none' }}>
                  <div className="iq-av">{o.studentName[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: tx, margin: 0 }}>{o.studentName} 학부모</p>
                    <p style={{ fontSize: 12, color: tx3, margin: '2px 0 0' }}>{fmtPhone(o.phone)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
