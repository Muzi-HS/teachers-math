'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { kstDateOf, kstTimeOf } from '@/lib/kst'
import { IconPin } from '@/components/icons'

const navy='#0D2A5E', tx='#0D1B36', tx2='#4B5C7E', tx3='#96A4BF', bd='#DDE3EE', bg='#F5F7FA'
const gold='#D87E13', re='#C0392B'

type Notice = {
  id: number; title: string; content: string
  pinned: boolean; image_url: string | null; created_at: string
}

type NoticeComment = {
  id: number; notice_id: number; parent_comment_id: number | null
  sender_type: 'parent' | 'admin'; parent_id: number | null
  is_anonymous: boolean; content: string; created_at: string
}

export default function ParentNotices() {
  const { parent } = useAuth()
  const [notices, setNotices]   = useState<Notice[]>([])
  const [loading, setLoading]   = useState(true)
  const [detail,  setDetail]    = useState<Notice | null>(null)
  const [search,  setSearch]    = useState('')

  const [comments, setComments] = useState<NoticeComment[]>([])
  const [identityMap, setIdentityMap] = useState<Record<number, string[]>>({}) // parent_id -> 자녀 이름 (다른 학부모 댓글 표시용)
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentInput, setCommentInput] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({})
  const [replyAnon, setReplyAnon] = useState<Record<number, boolean>>({})
  const [replyOpenFor, setReplyOpenFor] = useState<number | null>(null)
  const [sendingReply, setSendingReply] = useState(false)

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('notices')
        .select('id,title,content,pinned,image_url,created_at')
        .eq('parent_visible', true)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
      const all = data ?? []

      // 대상이 지정된 공지는 내 자녀가 대상에 포함된 경우에만 노출 (지정이 없으면 전체공개)
      const noticeIds = all.map(n => n.id)
      const myStudentIds = new Set((parent?.children ?? []).map(c => c.id))
      let visibleIds = new Set(noticeIds)
      if (noticeIds.length > 0) {
        const { data: targets } = await supabase.from('notice_target_students').select('notice_id,student_id').in('notice_id', noticeIds)
        const targetedNoticeIds = new Set((targets ?? []).map((t: any) => t.notice_id))
        const allowedNoticeIds = new Set((targets ?? []).filter((t: any) => myStudentIds.has(t.student_id)).map((t: any) => t.notice_id))
        visibleIds = new Set(noticeIds.filter(id => !targetedNoticeIds.has(id) || allowedNoticeIds.has(id)))
      }

      setNotices(all.filter(n => visibleIds.has(n.id)))
      setLoading(false)
    }
    fetch()
  }, [parent?.children])

  useEffect(() => {
    async function fetchIdentities() {
      const { data } = await supabase.from('parents').select('id, parent_students(students(name))')
      const map: Record<number, string[]> = {}
      for (const row of (data ?? []) as any[]) {
        map[row.id] = (row.parent_students ?? []).map((ps: any) => ps.students?.name).filter(Boolean)
      }
      setIdentityMap(map)
    }
    fetchIdentities()
  }, [])

  useEffect(() => { if (detail) fetchComments(detail.id) }, [detail?.id])

  async function fetchComments(noticeId: number) {
    setCommentsLoading(true)
    const { data } = await supabase.from('notice_comments').select('*').eq('notice_id', noticeId).order('created_at', { ascending: true })
    setComments((data ?? []) as NoticeComment[])
    setCommentsLoading(false)
  }

  function notifyAdmin(bodyText: string) {
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ title: '티처스 수학학원', body: bodyText, link: '/notices' }),
    }).catch(() => {})
  }

  async function sendComment() {
    const text = commentInput.trim()
    if (!text || !detail || !parent?.parentId || sending) return
    setSending(true); setErr('')
    const { data, error } = await supabase.from('notice_comments').insert({
      notice_id: detail.id, sender_type: 'parent', parent_id: parent.parentId, is_anonymous: isAnonymous, content: text,
    }).select('*').single()
    setSending(false)
    if (error) { setErr('댓글 등록에 실패했습니다.'); return }
    setComments(cs => [...cs, data as NoticeComment])
    setCommentInput(''); setIsAnonymous(false)
    notifyAdmin('공지사항에 댓글이 등록되었습니다.')
  }

  async function sendReply(rootCommentId: number) {
    const text = (replyDrafts[rootCommentId] ?? '').trim()
    if (!text || !detail || !parent?.parentId || sendingReply) return
    setSendingReply(true)
    const { data, error } = await supabase.from('notice_comments').insert({
      notice_id: detail.id, parent_comment_id: rootCommentId, sender_type: 'parent', parent_id: parent.parentId,
      is_anonymous: replyAnon[rootCommentId] ?? false, content: text,
    }).select('*').single()
    setSendingReply(false)
    if (error) { setErr('답글 등록에 실패했습니다.'); return }
    setComments(cs => [...cs, data as NoticeComment])
    setReplyDrafts(d => ({ ...d, [rootCommentId]: '' }))
    setReplyOpenFor(null)
    notifyAdmin('공지사항에 댓글이 등록되었습니다.')
  }

  const filtered = notices.filter(n => n.title.includes(search))
  const pinned   = filtered.filter(n => n.pinned)
  const normal   = filtered.filter(n => !n.pinned)

  function isNew(createdAt: string) {
    return Date.now() - new Date(createdAt).getTime() < 24 * 60 * 60 * 1000
  }

  function identityOf(c: NoticeComment): string {
    if (c.sender_type === 'admin') return '티처스 수학학원'
    if (c.is_anonymous) return '익명'
    const names = c.parent_id != null ? (identityMap[c.parent_id] ?? []) : []
    return names.length > 0 ? names.join(', ') + ' 학부모' : '학부모'
  }
  const topComments = comments.filter(c => !c.parent_comment_id)
  function repliesOf(commentId: number) { return comments.filter(c => c.parent_comment_id === commentId) }

  if (detail) return (
    <div>
      <button onClick={() => setDetail(null)} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: tx2, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 16 }}>
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M15 18l-6-6 6-6"/></svg>
        목록으로
      </button>
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: 20, marginBottom: 14 }}>
        {detail.pinned && <span style={{ background: gold, color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, marginBottom: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconPin size={10} /> 공지</span>}
        <h2 style={{ fontSize: 17, fontWeight: 700, color: tx, marginBottom: 8 }}>{detail.title}</h2>
        <p style={{ fontSize: 12, color: tx3, marginBottom: 16 }}>{kstDateOf(detail.created_at)}</p>
        {detail.image_url && <img src={detail.image_url} alt="첨부이미지" style={{ width: '100%', borderRadius: 8, marginBottom: 16 }} />}
        <p style={{ fontSize: 14, color: tx, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{detail.content}</p>
      </div>

      {/* 댓글 */}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: 18 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: tx, marginBottom: 12 }}>댓글 {topComments.length}개</p>

        {commentsLoading ? (
          <p style={{ fontSize: 13, color: tx3, padding: '10px 0' }}>불러오는 중...</p>
        ) : topComments.length === 0 ? (
          <p style={{ fontSize: 13, color: tx3, padding: '10px 0' }}>아직 댓글이 없습니다. 첫 댓글을 남겨보세요.</p>
        ) : topComments.map(c => (
          <div key={c.id} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: tx }}>{identityOf(c)}</span>
              <span style={{ fontSize: 10, color: tx3 }}>{kstDateOf(c.created_at)} {kstTimeOf(c.created_at)}</span>
            </div>
            <p style={{ fontSize: 13, color: tx, lineHeight: 1.5, margin: '0 0 6px', whiteSpace: 'pre-wrap' }}>{c.content}</p>

            {repliesOf(c.id).map(r => (
              <div key={r.id} style={{ marginLeft: 16, paddingLeft: 10, borderLeft: `2px solid ${bd}`, marginTop: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: r.sender_type === 'admin' ? navy : tx }}>{identityOf(r)}</span>
                  <span style={{ fontSize: 10, color: tx3 }}>{kstDateOf(r.created_at)} {kstTimeOf(r.created_at)}</span>
                </div>
                <p style={{ fontSize: 13, color: tx, margin: 0, whiteSpace: 'pre-wrap' }}>{r.content}</p>
              </div>
            ))}

            {replyOpenFor === c.id ? (
              <div style={{ marginLeft: 16, marginTop: 8 }}>
                <textarea
                  rows={1} autoFocus value={replyDrafts[c.id] ?? ''} onChange={e => setReplyDrafts(d => ({ ...d, [c.id]: e.target.value }))}
                  placeholder="답글을 입력하세요"
                  style={{ width: '100%', padding: '7px 9px', border: `1.5px solid ${bd}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: tx, outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: 6 }}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: tx2, cursor: 'pointer' }}>
                    <input type="checkbox" checked={replyAnon[c.id] ?? false} onChange={e => setReplyAnon(a => ({ ...a, [c.id]: e.target.checked }))} />
                    익명으로 작성
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setReplyOpenFor(null)} style={{ padding: '5px 12px', borderRadius: 7, border: `1px solid ${bd}`, background: '#fff', color: tx2, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>취소</button>
                    <button onClick={() => sendReply(c.id)} disabled={sendingReply || !(replyDrafts[c.id] ?? '').trim()}
                      style={{ padding: '5px 14px', borderRadius: 7, border: 'none', background: gold, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: sendingReply || !(replyDrafts[c.id] ?? '').trim() ? 0.6 : 1 }}>
                      등록
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button onClick={() => setReplyOpenFor(c.id)} style={{ marginLeft: 16, marginTop: 4, border: 'none', background: 'none', color: navy, fontSize: 12, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>답글달기</button>
            )}
          </div>
        ))}

        <div style={{ height: 1, background: bd, margin: '10px 0 14px' }} />

        <textarea
          rows={2} value={commentInput} onChange={e => setCommentInput(e.target.value)}
          placeholder="댓글을 남겨보세요"
          style={{ width: '100%', padding: '8px 10px', border: `1.5px solid ${bd}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: tx, outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: 8 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: tx2, cursor: 'pointer' }}>
            <input type="checkbox" checked={isAnonymous} onChange={e => setIsAnonymous(e.target.checked)} />
            익명으로 작성
          </label>
          <button onClick={sendComment} disabled={sending || !commentInput.trim()}
            style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: gold, color: '#fff', fontSize: 12, fontWeight: 700, cursor: sending || !commentInput.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: sending || !commentInput.trim() ? 0.6 : 1 }}>
            {sending ? '등록 중...' : '댓글 등록'}
          </button>
        </div>
        {err && <p style={{ fontSize: 11, color: re, marginTop: 6 }}>{err}</p>}
      </div>
    </div>
  )

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 20, fontWeight: 700, color: tx, margin: 0 }}>공지사항</p>
        <p style={{ fontSize: 13, color: tx2, marginTop: 4 }}>학원 공지사항을 확인하세요</p>
      </div>

      <div style={{ background: '#fff', border: `1px solid ${bd}`, borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke={tx3}><circle cx="11" cy="11" r="8" strokeWidth={2}/><path strokeWidth={2} d="M21 21l-4.35-4.35"/></svg>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="제목 검색..." style={{ border: 'none', outline: 'none', fontSize: 13, fontFamily: 'inherit', color: tx, background: 'transparent', width: '100%' }} />
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: tx3, padding: '40px 0' }}>불러오는 중...</p>
      ) : filtered.length === 0 ? (
        <p style={{ textAlign: 'center', color: tx3, padding: '40px 0' }}>공지사항이 없습니다</p>
      ) : (
        <div style={{ background: '#fff', border: `1px solid ${bd}`, borderRadius: 12, overflow: 'hidden' }}>
          {/* 헤더 */}
          <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 80px', gap: 8, padding: '10px 16px', background: bg, borderBottom: `1px solid ${bd}`, fontSize: 11, fontWeight: 600, color: tx3 }}>
            <div style={{ textAlign: 'center' }}>번호</div>
            <div>제목</div>
            <div style={{ textAlign: 'center' }}>등록일</div>
          </div>

          {/* 고정 공지 */}
          {pinned.map((n, i) => (
            <div key={n.id} onClick={() => setDetail(n)} style={{
              display: 'grid', gridTemplateColumns: '60px 1fr 80px', gap: 8,
              padding: '12px 16px', borderBottom: `1px solid ${bd}`,
              background: '#FEFAF3', cursor: 'pointer', alignItems: 'center',
            }}>
              <div style={{ textAlign: 'center' }}>
                <span style={{ background: gold, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>공지</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                {isNew(n.created_at) && <span style={{ color: '#C0392B', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>N</span>}
              </div>
              <div style={{ textAlign: 'center', fontSize: 11, color: tx3 }}>{kstDateOf(n.created_at).slice(5, 10)}</div>
            </div>
          ))}

          {pinned.length > 0 && normal.length > 0 && <div style={{ height: 1, background: bd }} />}

          {/* 일반 공지 */}
          {normal.map((n, i) => (
            <div key={n.id} onClick={() => setDetail(n)} style={{
              display: 'grid', gridTemplateColumns: '60px 1fr 80px', gap: 8,
              padding: '12px 16px', borderBottom: i < normal.length - 1 ? `1px solid ${bd}` : 'none',
              background: '#fff', cursor: 'pointer', alignItems: 'center',
            }}>
              <div style={{ textAlign: 'center', fontSize: 12, color: tx3 }}>{normal.length - i}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{ fontSize: 13, color: tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                {isNew(n.created_at) && <span style={{ color: '#C0392B', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>N</span>}
              </div>
              <div style={{ textAlign: 'center', fontSize: 11, color: tx3 }}>{kstDateOf(n.created_at).slice(5, 10)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
