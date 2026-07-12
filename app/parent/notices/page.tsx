'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { kstDateOf } from '@/lib/kst'

const navy='#0D2A5E', tx='#0D1B36', tx2='#4B5C7E', tx3='#96A4BF', bd='#DDE3EE', bg='#F5F7FA'
const gold='#D87E13'

type Notice = {
  id: number; title: string; content: string
  pinned: boolean; image_url: string | null; created_at: string
}

export default function ParentNotices() {
  const [notices, setNotices]   = useState<Notice[]>([])
  const [loading, setLoading]   = useState(true)
  const [detail,  setDetail]    = useState<Notice | null>(null)
  const [search,  setSearch]    = useState('')

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('notices')
        .select('id,title,content,pinned,image_url,created_at')
        .eq('parent_visible', true)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
      setNotices(data ?? [])
      setLoading(false)
    }
    fetch()
  }, [])

  const filtered = notices.filter(n => n.title.includes(search))
  const pinned   = filtered.filter(n => n.pinned)
  const normal   = filtered.filter(n => !n.pinned)

  function isNew(createdAt: string) {
    return Date.now() - new Date(createdAt).getTime() < 24 * 60 * 60 * 1000
  }

  if (detail) return (
    <div>
      <button onClick={() => setDetail(null)} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: tx2, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 16 }}>
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M15 18l-6-6 6-6"/></svg>
        목록으로
      </button>
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: 20 }}>
        {detail.pinned && <span style={{ background: gold, color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, marginBottom: 10, display: 'inline-block' }}>📌 공지</span>}
        <h2 style={{ fontSize: 17, fontWeight: 700, color: tx, marginBottom: 8 }}>{detail.title}</h2>
        <p style={{ fontSize: 12, color: tx3, marginBottom: 16 }}>{kstDateOf(detail.created_at)}</p>
        {detail.image_url && <img src={detail.image_url} alt="첨부이미지" style={{ width: '100%', borderRadius: 8, marginBottom: 16 }} />}
        <p style={{ fontSize: 14, color: tx, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{detail.content}</p>
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
