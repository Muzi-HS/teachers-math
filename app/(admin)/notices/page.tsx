'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { can, Role } from '@/lib/permissions'
import { kstDateOf, kstDateStr, kstTimeOf } from '@/lib/kst'
import { IconBell, IconPin } from '@/components/icons'
import { useMobileMode } from '@/context/MobileModeContext'
import RichTextEditor from '@/components/RichTextEditor'

type Notice = {
  id: number
  title: string
  content: string
  pinned: boolean
  parent_visible: boolean
  created_at: string
}

type StudentLite = { id: number; name: string; school_type: string | null }

type NoticeComment = {
  id: number; notice_id: number; parent_comment_id: number | null
  sender_type: 'parent' | 'admin'; parent_id: number | null; sender_teacher_id: string | null
  is_anonymous: boolean; content: string; created_at: string
}

const SCHOOL_TYPES = ['초등', '중등', '고등']

const EMPTY = {
  title: '', content: '', pinned: false, parent_visible: true,
  target_mode: 'all' as 'all' | 'selected', target_student_ids: [] as number[],
}

/* ── 공통 스타일 상수 (v18 CSS 변수 기반) ── */
const navy    = '#0D2A5E'
const navyDk  = '#071A3E'
const navyLt  = '#1A4080'
const navyMuted = '#E8EEF8'
const gold    = '#D87E13'
const goldLt  = '#F09830'
const goldPale = '#FEF3E2'
const bg      = '#F5F7FA'
const sf      = '#FFFFFF'
const bd      = '#DDE3EE'
const tx      = '#0D1B36'
const tx2     = '#4B5C7E'
const tx3     = '#96A4BF'
const re      = '#C0392B'
const rbg     = '#FDECEA'
const gbg     = '#E0F5EB'
const gr      = '#1A7F4E'

export default function NoticesPage() {
  const { teacher, role } = useAuth()
  const { mobileMode } = useMobileMode()
  const [notices, setNotices] = useState<Notice[]>([])
  const [students, setStudents] = useState<StudentLite[]>([])
  const [targetsByNotice, setTargetsByNotice] = useState<Record<number, number[]>>({})
  const [parentsMap, setParentsMap] = useState<Record<number, { phone: string; names: string[] }>>({}) // parent_id -> 전화번호·자녀 이름
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(false)
  const [detail,  setDetail]  = useState<Notice | null>(null)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [form,    setForm]    = useState({ ...EMPTY })
  const [editId,  setEditId]  = useState<number | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [notif,   setNotif]   = useState<{ msg: string; ok: boolean } | null>(null)
  const [search,  setSearch]  = useState('')
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerStageFlt, setPickerStageFlt] = useState<string[]>([])

  // 댓글 · 대댓글
  const [comments, setComments] = useState<NoticeComment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({})
  const [replyOpenFor, setReplyOpenFor] = useState<number | null>(null)
  const [sendingReply, setSendingReply] = useState(false)

  useEffect(() => { fetchNotices(); fetchStudents(); fetchParentsMap() }, [])
  useEffect(() => { if (detail) fetchComments(detail.id) }, [detail?.id])

  async function fetchNotices() {
    const [{ data }, { data: targets }] = await Promise.all([
      supabase.from('notices').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('notice_target_students').select('notice_id,student_id'),
    ])
    setNotices(data ?? [])
    const tmap: Record<number, number[]> = {}
    for (const row of (targets ?? []) as any[]) {
      if (!tmap[row.notice_id]) tmap[row.notice_id] = []
      tmap[row.notice_id].push(row.student_id)
    }
    setTargetsByNotice(tmap)
    setLoading(false)
  }

  async function fetchStudents() {
    const { data } = await supabase.from('students').select('id,name,school_type').order('name')
    setStudents((data ?? []) as StudentLite[])
  }

  async function fetchParentsMap() {
    const { data } = await supabase.from('parents').select('id, phone, parent_students(students(name))')
    const map: Record<number, { phone: string; names: string[] }> = {}
    for (const row of (data ?? []) as any[]) {
      map[row.id] = {
        phone: row.phone,
        names: (row.parent_students ?? []).map((ps: any) => ps.students?.name).filter(Boolean),
      }
    }
    setParentsMap(map)
  }

  async function fetchComments(noticeId: number) {
    setCommentsLoading(true)
    const { data } = await supabase.from('notice_comments').select('*').eq('notice_id', noticeId).order('created_at', { ascending: true })
    setComments((data ?? []) as NoticeComment[])
    setCommentsLoading(false)
  }

  function toast(msg: string, ok = true) {
    setNotif({ msg, ok })
    setTimeout(() => setNotif(null), 3000)
  }

  async function uploadNoticeImage(file: File): Promise<string | null> {
    const ext = file.name.split('.').pop() || 'png'
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('notice-images').upload(path, file)
    if (error) { toast('이미지 업로드에 실패했습니다: ' + error.message, false); return null }
    const { data } = supabase.storage.from('notice-images').getPublicUrl(path)
    return data.publicUrl
  }

  function openAdd() {
    setEditId(null); setForm({ ...EMPTY }); setPickerSearch(''); setPickerStageFlt([]); setModal(true)
  }
  function openEdit(n: Notice) {
    setEditId(n.id)
    const targetIds = targetsByNotice[n.id] ?? []
    setForm({
      title: n.title, content: n.content, pinned: n.pinned, parent_visible: n.parent_visible,
      target_mode: targetIds.length > 0 ? 'selected' : 'all',
      target_student_ids: targetIds,
    })
    setPickerSearch(''); setPickerStageFlt([])
    setDetail(null); setModal(true)
  }

  function toggleTarget(sid: number) {
    setForm(f => ({
      ...f,
      target_student_ids: f.target_student_ids.includes(sid)
        ? f.target_student_ids.filter(x => x !== sid)
        : [...f.target_student_ids, sid],
    }))
  }
  function togglePickerStage(t: string) {
    setPickerStageFlt(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t])
  }

  const pickerFiltered = students.filter(s => {
    if (pickerStageFlt.length > 0 && !(s.school_type && pickerStageFlt.includes(s.school_type))) return false
    if (pickerSearch.trim() && !s.name.includes(pickerSearch.trim())) return false
    return true
  })

  function selectAllFiltered() {
    setForm(f => {
      const ids = new Set(f.target_student_ids)
      for (const s of pickerFiltered) ids.add(s.id)
      return { ...f, target_student_ids: [...ids] }
    })
  }
  function deselectAllFiltered() {
    setForm(f => {
      const filteredIds = new Set(pickerFiltered.map(s => s.id))
      return { ...f, target_student_ids: f.target_student_ids.filter(id => !filteredIds.has(id)) }
    })
  }

  async function save() {
    if (!form.title.trim()) return toast('제목을 입력하세요.', false)
    setSaving(true)
    const payload = { title: form.title, content: form.content, pinned: form.pinned, parent_visible: form.parent_visible }
    let noticeId = editId
    if (editId) {
      await supabase.from('notices').update(payload).eq('id', editId)
    } else {
      const { data } = await supabase.from('notices').insert({ ...payload, created_by: teacher?.userId, created_at: kstDateStr() }).select('id').single()
      noticeId = data?.id ?? null
    }

    if (noticeId) {
      await supabase.from('notice_target_students').delete().eq('notice_id', noticeId)
      const targetIds = form.parent_visible && form.target_mode === 'selected' ? form.target_student_ids : []
      if (targetIds.length > 0) {
        await supabase.from('notice_target_students').insert(targetIds.map(sid => ({ notice_id: noticeId, student_id: sid })))
      }
    }

    const isNew = !editId
    toast(editId ? '공지가 수정되었습니다.' : '공지가 등록되었습니다.')
    setSaving(false); setModal(false); fetchNotices()

    // 신규 등록 + 학부모 공개인 경우에만 열람 가능한 학부모 전원에게 푸시 발송 (수정 시 알림 스팸 방지)
    if (isNew && form.parent_visible && noticeId) {
      const targetIds = form.target_mode === 'selected' ? form.target_student_ids : undefined
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push-notice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          title: '티처스 수학학원',
          body: `새 공지사항이 등록되었습니다: ${form.title.slice(0, 40)}`,
          link: '/parent/notices',
          student_ids: targetIds,
        }),
      }).catch(() => {})
    }
  }

  async function remove(id: number) {
    if (!confirm('공지사항을 삭제하시겠습니까?')) return
    await supabase.from('notices').delete().eq('id', id)
    setDetail(null); toast('삭제되었습니다.', false); fetchNotices()
  }

  async function sendReply(parentCommentId: number, noticeId: number) {
    const text = (replyDrafts[parentCommentId] ?? '').trim()
    if (!text) return
    setSendingReply(true)
    const { data, error } = await supabase.from('notice_comments').insert({
      notice_id: noticeId, parent_comment_id: parentCommentId, sender_type: 'admin', sender_teacher_id: teacher?.userId ?? null, content: text,
    }).select('*').single()
    setSendingReply(false)
    if (error) { toast('답글 전송 실패: ' + error.message, false); return }
    setComments(cs => [...cs, data as NoticeComment])
    setReplyDrafts(d => ({ ...d, [parentCommentId]: '' }))
    setReplyOpenFor(null)

    // 그 댓글 스레드를 시작한 학부모에게 대댓글 알림
    const rootComment = comments.find(c => c.id === parentCommentId)
    const phone = rootComment?.parent_id != null ? parentsMap[rootComment.parent_id]?.phone : null
    if (phone) {
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          parent_phone: phone,
          title: '티처스 수학학원',
          body: `공지사항 댓글에 답글이 등록되었습니다.`,
          link: '/parent/notices',
        }),
      }).catch(() => {})
    }
  }

  async function deleteComment(id: number) {
    if (!confirm('이 댓글을 삭제하시겠습니까?')) return
    await supabase.from('notice_comments').delete().eq('id', id)
    setComments(cs => cs.filter(c => c.id !== id && c.parent_comment_id !== id))
  }

  function identityOf(c: NoticeComment): string {
    if (c.sender_type === 'admin') return '티처스 수학학원'
    if (c.is_anonymous) return '익명'
    const names = c.parent_id != null ? (parentsMap[c.parent_id]?.names ?? []) : []
    return names.length > 0 ? names.join(', ') + ' 학부모' : '학부모'
  }

  const canWrite = role ? can.writeNotice(role as Role) : false

  // 검색 + 고정/일반 분리
  const filtered    = notices.filter(n => n.title.includes(search))
  const pinnedList  = filtered.filter(n => n.pinned)
  const normalList  = filtered.filter(n => !n.pinned)

  // N 표시 — 24시간 이내 작성된 글
  function isNew(createdAt: string) {
    return Date.now() - new Date(createdAt).getTime() < 24 * 60 * 60 * 1000
  }

  function targetLabel(n: Notice): string {
    if (!n.parent_visible) return '비공개'
    const ids = targetsByNotice[n.id] ?? []
    return ids.length > 0 ? `${ids.length}명 공개` : '전체공개'
  }

  const topComments = comments.filter(c => !c.parent_comment_id)
  function repliesOf(commentId: number) { return comments.filter(c => c.parent_comment_id === commentId) }

  return (
    <div style={{ padding: mobileMode ? '16px 14px 88px' : '28px 32px', fontFamily: "'Noto Sans KR', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
        .btn-outline { display:inline-flex; align-items:center; gap:5px; padding:5px 12px; border-radius:8px; font-size:12px; font-weight:500; cursor:pointer; border:1px solid ${bd}; background:transparent; color:${tx2}; transition:all .15s; font-family:inherit; }
        .btn-outline:hover { border-color:${navy}; color:${navy}; }
        .btn-danger { display:inline-flex; align-items:center; gap:5px; padding:5px 12px; border-radius:8px; font-size:12px; font-weight:500; cursor:pointer; border:none; background:${rbg}; color:${re}; font-family:inherit; }
        .btn-gold { display:inline-flex; align-items:center; gap:5px; padding:7px 14px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; border:none; background:${gold}; color:${navyDk}; font-family:inherit; transition:background .15s; }
        .btn-gold:hover { background:${goldLt}; }
        .fi { width:100%; padding:9px 11px; border:1.5px solid ${bd}; border-radius:8px; font-size:13px; font-family:inherit; color:${tx}; outline:none; background:#fff; transition:border-color .2s; box-sizing:border-box; }
        .fi:focus { border-color:${navy}; }
        .sbox { display:flex; align-items:center; gap:7px; padding:8px 12px; background:#fff; border:1px solid ${bd}; border-radius:8px; }
        .sbox input { border:none; outline:none; font-size:13px; font-family:inherit; color:${tx}; background:transparent; width:100%; }
        .badge-green { display:inline-flex; align-items:center; padding:2px 8px; border-radius:20px; font-size:11px; font-weight:500; background:${gbg}; color:${gr}; }
        .badge-red   { display:inline-flex; align-items:center; padding:2px 8px; border-radius:20px; font-size:11px; font-weight:500; background:${rbg}; color:${re}; }
        .badge-navy  { display:inline-flex; align-items:center; padding:2px 8px; border-radius:20px; font-size:11px; font-weight:500; background:${navyMuted}; color:${navy}; }
        .radio-row { display:flex; gap:16px; margin-top:6px; }
        .radio-row label { display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer; }
        .pill { padding:5px 12px; border-radius:20px; font-size:12px; font-weight:500; cursor:pointer; border:1.5px solid ${bd}; background:#fff; color:${tx2}; font-family:inherit; transition:all .15s; }
        .pill.active { border-color:${navy}; background:${navy}; color:#fff; font-weight:700; }
        .chip { display:inline-flex; align-items:center; gap:4px; padding:3px 8px 3px 10px; border-radius:20px; font-size:12px; background:${navyMuted}; color:${navy}; font-weight:500; }
        .chip button { border:none; background:none; cursor:pointer; color:${navy}; font-size:13px; padding:0; line-height:1; display:flex; }
        .ql-editor img { max-width: 100%; height: auto; cursor: zoom-in; transition: opacity .15s; }
        .ql-editor img:hover { opacity: .85; }
        .ql-editor { max-width: 100%; overflow-x: hidden; word-break: break-word; }
      `}</style>

      {/* 토스트 */}
      {notif && (
        <div style={{
          position: 'fixed', top: 18, right: 18, zIndex: 9999,
          background: '#fff', borderRadius: 8, padding: '11px 16px',
          borderLeft: `4px solid ${notif.ok ? gr : re}`,
          boxShadow: '0 4px 18px rgba(0,0,0,.1)', fontSize: 13, color: tx,
          maxWidth: 280,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{notif.ok ? '완료' : '알림'}</div>
          <div style={{ fontSize: 12, color: tx2 }}>{notif.msg}</div>
        </div>
      )}

      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: mobileMode ? 14 : 20 }}>
        <div>
          <h1 style={{ fontSize: mobileMode ? 17 : 21, fontWeight: 700, color: tx }}>학원 공지사항</h1>
          {!mobileMode && <p style={{ fontSize: 13, color: tx2, marginTop: 4 }}>전체 공지사항 관리</p>}
        </div>
        {canWrite && (
          <button className="btn-gold" onClick={openAdd}>
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
            공지 작성
          </button>
        )}
      </div>

      {/* 검색 */}
      <div className="sbox" style={{ maxWidth: 260, marginBottom: 12 }}>
        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke={tx3}><circle cx="11" cy="11" r="8" strokeWidth={2}/><path strokeWidth={2} d="M21 21l-4.35-4.35"/></svg>
        <input placeholder="제목 검색..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* 게시판 테이블 */}
      {loading ? (
        <p style={{ color: tx3, fontSize: 13 }}>불러오는 중...</p>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: tx3 }}>
          <p style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}><IconBell size={40} /></p>
          <p style={{ fontSize: 14 }}>등록된 공지사항이 없습니다</p>
        </div>
      ) : (
        <div style={{ background: '#fff', border: `1px solid ${bd}`, borderRadius: 10, overflow: 'hidden' }}>

          {/* 헤더 행 (모바일에서는 카드형으로 바뀌므로 생략) */}
          {!mobileMode && (
            <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 90px 80px 108px', gap: 8, padding: '11px 16px', background: bg, borderBottom: `1px solid ${bd}`, fontSize: 11, fontWeight: 600, color: tx3 }}>
              <div style={{ textAlign: 'center' }}>번호</div>
              <div>제목</div>
              <div style={{ textAlign: 'center' }}>공개대상</div>
              <div style={{ textAlign: 'center' }}>등록일</div>
              <div style={{ textAlign: 'center' }}>관리</div>
            </div>
          )}

          {pinnedList.map((n, i) => (
            <BoardRow key={n.id} notice={n} index="공지" pinned canWrite={canWrite} mobile={mobileMode} visLabel={targetLabel(n)}
              onClick={() => setDetail(n)} onEdit={() => openEdit(n)} onDelete={() => remove(n.id)}
              isLast={i === pinnedList.length - 1 && normalList.length === 0} />
          ))}

          {pinnedList.length > 0 && normalList.length > 0 && (
            <div style={{ height: 1, background: bd }} />
          )}

          {normalList.map((n, i) => (
            <BoardRow key={n.id} notice={n} index={normalList.length - i} pinned={false} canWrite={canWrite} mobile={mobileMode} visLabel={targetLabel(n)}
              onClick={() => setDetail(n)} onEdit={() => openEdit(n)} onDelete={() => remove(n.id)}
              isLast={i === normalList.length - 1} />
          ))}
        </div>
      )}

      <p style={{ fontSize: 11, color: tx3, textAlign: 'center', marginTop: 12 }}>총 {filtered.length}개 공지</p>

      {/* ── 상세 모달 ── */}
      {detail && (
        <div onClick={() => setDetail(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.42)',
          zIndex: 1000, display: 'flex', alignItems: mobileMode ? 'flex-end' : 'center', justifyContent: 'center', padding: mobileMode ? 0 : 16,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: mobileMode ? '16px 16px 0 0' : 12, width: mobileMode ? '100%' : 560,
            maxWidth: '100%', maxHeight: mobileMode ? '88vh' : '90vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,.15)',
          }}>
            <div style={{ padding: '18px 22px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: tx }}>{detail.title}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <p style={{ fontSize: 12, color: tx3 }}>{kstDateOf(detail.created_at)}</p>
                  {detail.pinned && <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20, background: goldPale, color: gold, fontWeight: 500 }}>상단 고정</span>}
                  {!detail.parent_visible
                    ? <span className="badge-red">학부모 비공개</span>
                    : (targetsByNotice[detail.id]?.length ?? 0) > 0
                      ? <span className="badge-navy">선택 공개 {targetsByNotice[detail.id].length}명</span>
                      : <span className="badge-green">학부모 전체공개</span>
                  }
                </div>
                {detail.parent_visible && (targetsByNotice[detail.id]?.length ?? 0) > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                    {targetsByNotice[detail.id].map(sid => (
                      <span key={sid} className="chip" style={{ padding: '2px 8px' }}>{students.find(s => s.id === sid)?.name ?? '?'}</span>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => setDetail(null)} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: bg, cursor: 'pointer', fontSize: 17, color: tx2, flexShrink: 0 }}>×</button>
            </div>
            <div style={{ borderTop: `1px solid ${bd}`, margin: '16px 22px 0' }} />
            <div className="ql-editor" style={{ padding: '16px 22px', fontSize: 14, color: tx, lineHeight: 1.8, overflowWrap: 'break-word' }}
              onClick={e => { const t = e.target as HTMLElement; if (t.tagName === 'IMG') setLightboxSrc((t as HTMLImageElement).src) }}
              dangerouslySetInnerHTML={{ __html: detail.content }} />

            {/* 댓글 · 대댓글 */}
            <div style={{ borderTop: `1px solid ${bd}`, margin: '4px 22px 0' }} />
            <div style={{ padding: '14px 22px 4px' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: tx, marginBottom: 10 }}>댓글 {topComments.length}개</p>
              {commentsLoading ? (
                <p style={{ fontSize: 12, color: tx3, padding: '10px 0' }}>불러오는 중...</p>
              ) : topComments.length === 0 ? (
                <p style={{ fontSize: 12, color: tx3, padding: '10px 0' }}>아직 댓글이 없습니다</p>
              ) : topComments.map(c => (
                <div key={c.id} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: tx }}>{identityOf(c)}</span>
                    <span style={{ fontSize: 10, color: tx3 }}>{kstDateOf(c.created_at)} {kstTimeOf(c.created_at)}</span>
                    {canWrite && (
                      <button onClick={() => deleteComment(c.id)} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: tx3, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>삭제</button>
                    )}
                  </div>
                  <p style={{ fontSize: 13, color: tx, lineHeight: 1.5, margin: '0 0 6px', whiteSpace: 'pre-wrap' }}>{c.content}</p>

                  {repliesOf(c.id).map(r => (
                    <div key={r.id} style={{ marginLeft: 16, paddingLeft: 10, borderLeft: `2px solid ${bd}`, marginTop: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: r.sender_type === 'admin' ? navy : tx }}>{identityOf(r)}</span>
                        <span style={{ fontSize: 10, color: tx3 }}>{kstDateOf(r.created_at)} {kstTimeOf(r.created_at)}</span>
                        {canWrite && (
                          <button onClick={() => deleteComment(r.id)} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: tx3, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>삭제</button>
                        )}
                      </div>
                      <p style={{ fontSize: 13, color: tx, margin: 0, whiteSpace: 'pre-wrap' }}>{r.content}</p>
                    </div>
                  ))}

                  {canWrite && (
                    replyOpenFor === c.id ? (
                      <div style={{ display: 'flex', gap: 6, marginTop: 6, marginLeft: 16 }}>
                        <input className="fi" autoFocus value={replyDrafts[c.id] ?? ''} onChange={e => setReplyDrafts(d => ({ ...d, [c.id]: e.target.value }))}
                          placeholder="답글을 입력하세요" onKeyDown={e => { if (e.key === 'Enter') sendReply(c.id, detail.id) }} />
                        <button className="btn-gold" onClick={() => sendReply(c.id, detail.id)} disabled={sendingReply}>등록</button>
                        <button className="btn-outline" onClick={() => setReplyOpenFor(null)}>취소</button>
                      </div>
                    ) : (
                      <button onClick={() => setReplyOpenFor(c.id)} style={{ marginLeft: 16, border: 'none', background: 'none', color: navy, fontSize: 12, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>답글달기</button>
                    )
                  )}
                </div>
              ))}
            </div>

            <div style={{ padding: '10px 22px 18px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {canWrite && <button className="btn-outline" onClick={() => openEdit(detail)}>편집</button>}
              <button className="btn-gold" onClick={() => setDetail(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 작성/수정 모달 ── */}
      {modal && (
        <div onClick={() => setModal(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.42)',
          zIndex: 1000, display: 'flex', alignItems: mobileMode ? 'flex-end' : 'center', justifyContent: 'center', padding: mobileMode ? 0 : 16,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: mobileMode ? '16px 16px 0 0' : 12, width: mobileMode ? '100%' : 560,
            maxWidth: '100%', maxHeight: mobileMode ? '90vh' : '90vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,.15)',
          }}>
            {/* 모달 헤더 */}
            <div style={{ padding: '18px 22px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: tx }}>{editId ? '공지 편집' : '공지 작성'}</span>
              <button onClick={() => setModal(false)} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: bg, cursor: 'pointer', fontSize: 17, color: tx2 }}>×</button>
            </div>

            {/* 모달 바디 */}
            <div style={{ padding: '18px 22px' }}>

              {/* 제목 */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: tx2, marginBottom: 5 }}>제목</label>
                <input
                  className="fi"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="공지 제목"
                />
              </div>

              {/* 고정 여부 + 학부모 열람 — 2칸 그리드 */}
              <div style={{ display: 'grid', gridTemplateColumns: mobileMode ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: tx2, marginBottom: 5 }}>고정 여부</label>
                  <div className="radio-row">
                    {[{ v: false, l: '일반' }, { v: true, l: '상단 고정' }].map(({ v, l }) => (
                      <label key={l}>
                        <input type="radio" name="noticePin" checked={form.pinned === v} onChange={() => setForm(f => ({ ...f, pinned: v }))} />
                        {l}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: tx2, marginBottom: 5 }}>학부모 열람</label>
                  <div className="radio-row">
                    {[{ v: true, l: '공개', c: gr }, { v: false, l: '비공개', c: re }].map(({ v, l, c }) => (
                      <label key={l}>
                        <input type="radio" name="noticeParent" checked={form.parent_visible === v} onChange={() => setForm(f => ({ ...f, parent_visible: v }))} />
                        <span style={{ color: c, fontWeight: 500 }}>{l}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* 공개 대상 선택 (학부모 열람=공개일 때만) */}
              {form.parent_visible && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: tx2, marginBottom: 5 }}>공개 대상</label>
                  <div className="radio-row" style={{ marginBottom: form.target_mode === 'selected' ? 10 : 0 }}>
                    {[{ v: 'all' as const, l: '전체 학부모' }, { v: 'selected' as const, l: '선택한 학생만' }].map(({ v, l }) => (
                      <label key={v}>
                        <input type="radio" name="noticeTargetMode" checked={form.target_mode === v} onChange={() => setForm(f => ({ ...f, target_mode: v }))} />
                        {l}
                      </label>
                    ))}
                  </div>

                  {form.target_mode === 'selected' && (
                    <div style={{ border: `1px solid ${bd}`, borderRadius: 8, padding: 10, background: bg }}>
                      {/* 선택된 학생 chips — 바로바로 확인 */}
                      <div style={{ marginBottom: 8 }}>
                        <p style={{ fontSize: 11, fontWeight: 600, color: tx2, marginBottom: 6 }}>선택됨 ({form.target_student_ids.length}명)</p>
                        {form.target_student_ids.length === 0 ? (
                          <p style={{ fontSize: 12, color: tx3 }}>아래 목록에서 학생을 선택하세요</p>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {form.target_student_ids.map(sid => (
                              <span key={sid} className="chip">
                                {students.find(s => s.id === sid)?.name ?? '?'}
                                <button onClick={() => toggleTarget(sid)}>×</button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div style={{ height: 1, background: bd, margin: '8px 0' }} />

                      {/* 검색 + 학교급 필터 */}
                      <input className="fi" style={{ marginBottom: 8 }} placeholder="학생 이름 검색" value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} />
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                        {SCHOOL_TYPES.map(t => (
                          <button key={t} type="button" className={`pill${pickerStageFlt.includes(t) ? ' active' : ''}`} onClick={() => togglePickerStage(t)}>{t}</button>
                        ))}
                      </div>

                      {/* 분류 전/후 전체선택 — 현재 필터된 목록 기준 */}
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                        <button type="button" className="btn-outline" onClick={selectAllFiltered}>
                          {pickerStageFlt.length > 0 ? '필터된 학생 전체 선택' : '전체 선택'} ({pickerFiltered.length}명)
                        </button>
                        <button type="button" className="btn-outline" onClick={deselectAllFiltered}>전체 해제</button>
                      </div>

                      {/* 학생 목록 */}
                      <div style={{ maxHeight: 200, overflowY: 'auto', background: '#fff', border: `1px solid ${bd}`, borderRadius: 6 }}>
                        {pickerFiltered.length === 0 ? (
                          <p style={{ fontSize: 12, color: tx3, padding: 14, textAlign: 'center' }}>일치하는 학생이 없습니다</p>
                        ) : pickerFiltered.map(s => (
                          <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderBottom: `1px solid ${bg}`, cursor: 'pointer', fontSize: 13, color: tx }}>
                            <input type="checkbox" checked={form.target_student_ids.includes(s.id)} onChange={() => toggleTarget(s.id)} />
                            {s.name}
                            {s.school_type && <span style={{ fontSize: 10, color: tx3 }}>{s.school_type}</span>}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 내용 */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: tx2, marginBottom: 5 }}>내용</label>
                <RichTextEditor
                  value={form.content}
                  onChange={html => setForm(f => ({ ...f, content: html }))}
                  onImageUpload={uploadNoticeImage}
                  placeholder="공지 내용을 입력하세요 (이미지는 원하는 위치에 커서를 두고 삽입할 수 있어요)"
                />
              </div>

            </div>

            {/* 모달 푸터 */}
            <div style={{ padding: '0 22px 18px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-outline" onClick={() => setModal(false)}>취소</button>
              <button className="btn-gold" onClick={save} disabled={saving} style={{ opacity: saving ? .7 : 1 }}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 이미지 확대보기 */}
      {lightboxSrc && (
        <div onClick={() => setLightboxSrc(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out',
        }}>
          <img src={lightboxSrc} alt="" style={{ maxWidth: '92vw', maxHeight: '92vh', borderRadius: 4, boxShadow: '0 10px 40px rgba(0,0,0,.4)' }} />
          <button onClick={() => setLightboxSrc(null)} style={{ position: 'fixed', top: 18, right: 22, width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
      )}
    </div>
  )
}

// ── 게시판 행 (네이버카페 스타일) ──
function BoardRow({ notice, index, pinned, canWrite, mobile, visLabel, onClick, onEdit, onDelete, isLast }: {
  notice: Notice; index: number | string; pinned: boolean; canWrite: boolean; mobile?: boolean; visLabel: string
  onClick: () => void; onEdit: () => void; onDelete: () => void; isLast: boolean
}) {
  const navy = '#0D2A5E', gold = '#D87E13', bd = '#DDE3EE'
  const tx = '#0D1B36', tx2 = '#4B5C7E', tx3 = '#96A4BF'
  const re = '#C0392B', rbg = '#FDECEA', gr = '#1A7F4E', gbg = '#E0F5EB', navyM = '#E8EEF8'

  function isNew(createdAt: string) {
    return Date.now() - new Date(createdAt).getTime() < 24 * 60 * 60 * 1000
  }

  const visColor = visLabel === '비공개' ? { bg: rbg, color: re } : visLabel === '전체공개' ? { bg: gbg, color: gr } : { bg: navyM, color: navy }
  const visBadge = <span style={{ background: visColor.bg, color: visColor.color, fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4 }}>{visLabel}</span>

  if (mobile) {
    return (
      <div
        onClick={onClick}
        style={{
          padding: '12px 14px', cursor: 'pointer',
          background: pinned ? '#FEFAF3' : '#fff',
          borderBottom: isLast ? 'none' : `1px solid ${bd}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          {pinned
            ? <span style={{ background: gold, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, flexShrink: 0 }}>공지</span>
            : <span style={{ fontSize: 11, color: tx3, flexShrink: 0 }}>{index}</span>
          }
          <span style={{ fontSize: 13, fontWeight: pinned ? 700 : 500, color: tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{notice.title}</span>
          {isNew(notice.created_at) && <span style={{ color: re, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>N</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {visBadge}
          <span style={{ fontSize: 11, color: tx3 }}>{kstDateOf(notice.created_at)}</span>
          {canWrite && (
            <div style={{ display: 'flex', gap: 5, marginLeft: 'auto' }}>
              <button
                onClick={e => { e.stopPropagation(); onEdit() }}
                style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: `1px solid ${bd}`, background: 'transparent', color: tx2, fontFamily: 'inherit' }}
              >수정</button>
              <button
                onClick={e => { e.stopPropagation(); onDelete() }}
                style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: 'none', background: rbg, color: re, fontFamily: 'inherit' }}
              >삭제</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid', gridTemplateColumns: '60px 1fr 90px 80px 108px', gap: 8,
        padding: '11px 16px', alignItems: 'center', cursor: 'pointer',
        background: pinned ? '#FEFAF3' : '#fff',
        borderBottom: isLast ? 'none' : `1px solid ${bd}`,
        position: 'relative',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        {pinned ? (
          <span style={{ background: gold, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4 }}>공지</span>
        ) : (
          <span style={{ fontSize: 12, color: tx3 }}>{index}</span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span style={{
          fontSize: 13, fontWeight: pinned ? 700 : 400, color: tx,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{notice.title}</span>
        {isNew(notice.created_at) && (
          <span style={{ color: re, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>N</span>
        )}
      </div>

      <div style={{ textAlign: 'center' }}>{visBadge}</div>

      <div style={{ textAlign: 'center', fontSize: 11, color: tx3 }}>{kstDateOf(notice.created_at)}</div>

      <div style={{ textAlign: 'center' }}>
        {canWrite ? (
          <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
            <button
              onClick={e => { e.stopPropagation(); onEdit() }}
              style={{ padding: '4px 9px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: `1px solid ${bd}`, background: 'transparent', color: tx2, fontFamily: 'inherit' }}
            >수정</button>
            <button
              onClick={e => { e.stopPropagation(); onDelete() }}
              style={{ padding: '4px 9px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: 'none', background: rbg, color: re, fontFamily: 'inherit' }}
            >삭제</button>
          </div>
        ) : (
          <span style={{ fontSize: 11, color: tx3 }}>-</span>
        )}
      </div>
    </div>
  )
}
