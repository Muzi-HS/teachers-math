'use client'
import { kstDateOf } from '@/lib/kst'
import { navy, gold, bd, tx, tx2, tx3, re, rbg, gr, gbg, navyM } from '@/lib/ui-tokens'

// N 표시 — 24시간 이내 작성된 글
function isNew(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() < 24 * 60 * 60 * 1000
}

// ── 게시판 행 (네이버카페 스타일) ──
export default function BoardRow({ notice, index, pinned, canWrite, mobile, visLabel, viewCount, onClick, onEdit, onDelete, isLast }: {
  notice: { title: string; created_at: string }; index: number | string; pinned: boolean; canWrite: boolean; mobile?: boolean; visLabel: string; viewCount: number
  onClick: () => void; onEdit: () => void; onDelete: () => void; isLast: boolean
}) {
  const visColor = visLabel === '비공개' ? { bg: rbg, color: re } : visLabel === '전체공개' ? { bg: gbg, color: gr } : { bg: navyM, color: navy }
  const visBadge = <span className="vis-badge" style={{ background: visColor.bg, color: visColor.color }}>{visLabel}</span>

  if (mobile) {
    return (
      <div
        className="notice-row"
        onClick={onClick}
        style={{
          padding: '13px 15px', cursor: 'pointer',
          background: pinned ? 'var(--ui-info-bg)' : '#fff',
          borderBottom: isLast ? 'none' : `1px solid ${bd}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
          {pinned
            ? <span style={{ background: gold, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, flexShrink: 0 }}>공지</span>
            : <span style={{ fontSize: 11, color: tx3, flexShrink: 0, width: 14, textAlign: 'right' }}>{index}</span>
          }
          <span style={{ fontSize: 13.5, fontWeight: pinned ? 700 : 500, color: tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{notice.title}</span>
          {isNew(notice.created_at) && <span style={{ background: rbg, color: re, fontSize: 9.5, fontWeight: 700, flexShrink: 0, padding: '1px 5px', borderRadius: 20 }}>N</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          {visBadge}
          <span style={{ fontSize: 11, color: tx3 }}>조회 {viewCount}</span>
          <span style={{ fontSize: 11, color: tx3 }}>{kstDateOf(notice.created_at)}</span>
          {canWrite && (
            <div style={{ display: 'flex', gap: 5, marginLeft: 'auto' }}>
              <button
                onClick={e => { e.stopPropagation(); onEdit() }}
                style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: `1px solid ${bd}`, background: 'transparent', color: tx2, fontFamily: 'inherit' }}
              >수정</button>
              <button
                onClick={e => { e.stopPropagation(); onDelete() }}
                style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: 'none', background: rbg, color: re, fontFamily: 'inherit' }}
              >삭제</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className="notice-row"
      onClick={onClick}
      style={{
        display: 'grid', gridTemplateColumns: '60px 1fr 100px 70px 90px 112px', gap: 10,
        padding: '13px 18px', alignItems: 'center', cursor: 'pointer',
        background: pinned ? 'var(--ui-info-bg)' : '#fff',
        borderBottom: isLast ? 'none' : `1px solid ${bd}`,
        position: 'relative',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        {pinned ? (
          <span style={{ background: gold, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>공지</span>
        ) : (
          <span style={{ fontSize: 12, color: tx3 }}>{index}</span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        <span style={{
          fontSize: 13.5, fontWeight: pinned ? 700 : 500, color: tx,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{notice.title}</span>
        {isNew(notice.created_at) && (
          <span style={{ background: rbg, color: re, fontSize: 9.5, fontWeight: 700, flexShrink: 0, padding: '1px 5px', borderRadius: 20 }}>N</span>
        )}
      </div>

      <div style={{ textAlign: 'center' }}>{visBadge}</div>

      <div style={{ textAlign: 'center', fontSize: 12, color: tx3 }}>{viewCount}</div>

      <div style={{ textAlign: 'center', fontSize: 11, color: tx3 }}>{kstDateOf(notice.created_at)}</div>

      <div style={{ textAlign: 'center' }}>
        {canWrite ? (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
            <button
              onClick={e => { e.stopPropagation(); onEdit() }}
              style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: `1px solid ${bd}`, background: 'transparent', color: tx2, fontFamily: 'inherit' }}
            >수정</button>
            <button
              onClick={e => { e.stopPropagation(); onDelete() }}
              style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: 'none', background: rbg, color: re, fontFamily: 'inherit' }}
            >삭제</button>
          </div>
        ) : (
          <span style={{ fontSize: 11, color: tx3 }}>-</span>
        )}
      </div>
    </div>
  )
}
