'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { can, Role } from '@/lib/permissions'

type Notice = {
  id: number
  title: string
  content: string
  pinned: boolean
  parent_visible: boolean
  image_url: string
  created_at: string
}

const EMPTY = { title: '', content: '', pinned: false, parent_visible: true, image_url: '' }

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
  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(false)
  const [detail,  setDetail]  = useState<Notice | null>(null)
  const [form,    setForm]    = useState({ ...EMPTY })
  const [editId,  setEditId]  = useState<number | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [notif,   setNotif]   = useState<{ msg: string; ok: boolean } | null>(null)
  const [search,  setSearch]  = useState('')

  useEffect(() => { fetchNotices() }, [])

  async function fetchNotices() {
    const { data } = await supabase
      .from('notices')
      .select('*')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
    setNotices(data ?? [])
    setLoading(false)
  }

  function toast(msg: string, ok = true) {
    setNotif({ msg, ok })
    setTimeout(() => setNotif(null), 3000)
  }

  function openAdd() {
    setEditId(null); setForm({ ...EMPTY }); setModal(true)
  }
  function openEdit(n: Notice) {
    setEditId(n.id)
    setForm({ title: n.title, content: n.content, pinned: n.pinned, parent_visible: n.parent_visible, image_url: n.image_url ?? '' })
    setDetail(null); setModal(true)
  }

  async function save() {
    if (!form.title.trim()) return toast('제목을 입력하세요.', false)
    setSaving(true)
    if (editId) {
      await supabase.from('notices').update({ ...form }).eq('id', editId)
      toast('공지가 수정되었습니다.')
    } else {
      await supabase.from('notices').insert({ ...form, created_by: teacher?.userId })
      toast('공지가 등록되었습니다.')
    }
    setSaving(false); setModal(false); fetchNotices()
  }

  async function remove(id: number) {
    if (!confirm('공지사항을 삭제하시겠습니까?')) return
    await supabase.from('notices').delete().eq('id', id)
    setDetail(null); toast('삭제되었습니다.', false); fetchNotices()
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

  return (
    <div style={{ padding: '28px 32px', fontFamily: "'Noto Sans KR', sans-serif" }}>
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
        .radio-row { display:flex; gap:16px; margin-top:6px; }
        .radio-row label { display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer; }
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 700, color: tx }}>학원 공지사항</h1>
          <p style={{ fontSize: 13, color: tx2, marginTop: 4 }}>전체 공지사항 관리</p>
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
          <p style={{ fontSize: 40, marginBottom: 12 }}>📢</p>
          <p style={{ fontSize: 14 }}>등록된 공지사항이 없습니다</p>
        </div>
      ) : (
        <div style={{ background: '#fff', border: `1px solid ${bd}`, borderRadius: 10, overflow: 'hidden' }}>

          {/* 헤더 행 */}
          <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 90px 80px 60px', gap: 8, padding: '11px 16px', background: bg, borderBottom: `1px solid ${bd}`, fontSize: 11, fontWeight: 600, color: tx3 }}>
            <div style={{ textAlign: 'center' }}>번호</div>
            <div>제목</div>
            <div style={{ textAlign: 'center' }}>공개여부</div>
            <div style={{ textAlign: 'center' }}>등록일</div>
            <div style={{ textAlign: 'center' }}>관리</div>
          </div>

          {pinnedList.map((n, i) => (
            <BoardRow key={n.id} notice={n} index="공지" pinned canWrite={canWrite}
              onClick={() => setDetail(n)} onEdit={() => openEdit(n)} onDelete={() => remove(n.id)}
              isLast={i === pinnedList.length - 1 && normalList.length === 0} />
          ))}

          {pinnedList.length > 0 && normalList.length > 0 && (
            <div style={{ height: 1, background: bd }} />
          )}

          {normalList.map((n, i) => (
            <BoardRow key={n.id} notice={n} index={normalList.length - i} pinned={false} canWrite={canWrite}
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
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 12, width: 560,
            maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,.15)',
          }}>
            <div style={{ padding: '18px 22px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: tx }}>{detail.title}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <p style={{ fontSize: 12, color: tx3 }}>{detail.created_at.slice(0, 10)}</p>
                  {detail.pinned && <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20, background: goldPale, color: gold, fontWeight: 500 }}>상단 고정</span>}
                  {detail.parent_visible
                    ? <span className="badge-green">학부모 공개</span>
                    : <span className="badge-red">학부모 비공개</span>
                  }
                </div>
              </div>
              <button onClick={() => setDetail(null)} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: bg, cursor: 'pointer', fontSize: 17, color: tx2, flexShrink: 0 }}>×</button>
            </div>
            <div style={{ borderTop: `1px solid ${bd}`, margin: '16px 22px 0' }} />
            <div style={{ padding: '16px 22px', fontSize: 14, color: tx, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
              {detail.content}
            </div>
            {detail.image_url && (
              <div style={{ padding: '0 22px 16px' }}>
                <img src={detail.image_url} alt="첨부이미지" style={{ width: '100%', borderRadius: 8, border: `1px solid ${bd}` }} />
              </div>
            )}
            <div style={{ padding: '0 22px 18px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
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
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 12, width: 560,
            maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto',
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
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

              {/* 내용 */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: tx2, marginBottom: 5 }}>내용</label>
                <textarea
                  className="fi"
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  placeholder="공지 내용을 입력하세요"
                  rows={6}
                  style={{ resize: 'vertical' }}
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
    </div>
  )
}

// ── 게시판 행 (네이버카페 스타일) ──
function BoardRow({ notice, index, pinned, canWrite, onClick, onEdit, onDelete, isLast }: {
  notice: Notice; index: number | string; pinned: boolean; canWrite: boolean
  onClick: () => void; onEdit: () => void; onDelete: () => void; isLast: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const navy = '#0D2A5E', gold = '#D87E13', bd = '#DDE3EE'
  const tx = '#0D1B36', tx2 = '#4B5C7E', tx3 = '#96A4BF'
  const re = '#C0392B', rbg = '#FDECEA', gr = '#1A7F4E', gbg = '#E0F5EB'

  function isNew(createdAt: string) {
    return Date.now() - new Date(createdAt).getTime() < 24 * 60 * 60 * 1000
  }

  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid', gridTemplateColumns: '60px 1fr 90px 80px 60px', gap: 8,
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

      <div style={{ textAlign: 'center' }}>
        {notice.parent_visible
          ? <span style={{ background: gbg, color: gr, fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4 }}>학부모공개</span>
          : <span style={{ background: rbg, color: re, fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4 }}>비공개</span>
        }
      </div>

      <div style={{ textAlign: 'center', fontSize: 11, color: tx3 }}>{notice.created_at.slice(0, 10)}</div>

      <div style={{ textAlign: 'center', position: 'relative' }}>
        {canWrite ? (
          <>
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(p => !p) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: tx3, padding: '2px 6px' }}
            >
              ···
            </button>
            {menuOpen && (
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 50,
                  background: '#fff', border: `1px solid ${bd}`, borderRadius: 8,
                  boxShadow: '0 4px 14px rgba(0,0,0,.1)', overflow: 'hidden', minWidth: 80,
                }}
              >
                <button
                  onClick={() => { setMenuOpen(false); onEdit() }}
                  style={{ display: 'block', width: '100%', padding: '8px 12px', border: 'none', background: 'none', textAlign: 'left', fontSize: 12, color: tx2, cursor: 'pointer', fontFamily: 'inherit' }}
                >편집</button>
                <button
                  onClick={() => { setMenuOpen(false); onDelete() }}
                  style={{ display: 'block', width: '100%', padding: '8px 12px', border: 'none', background: 'none', textAlign: 'left', fontSize: 12, color: re, cursor: 'pointer', fontFamily: 'inherit' }}
                >삭제</button>
              </div>
            )}
          </>
        ) : (
          <span style={{ fontSize: 11, color: tx3 }}>···</span>
        )}
      </div>
    </div>
  )
}
