'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useMobileMode } from '@/context/MobileModeContext'

const navy = '#0D2A5E', gold = '#D87E13'
const bg = '#F5F7FA', bd = '#DDE3EE'
const tx = '#0D1B36', tx2 = '#4B5C7E', tx3 = '#96A4BF'
const re = '#C0392B', gr = '#1A7F4E', gbg = '#E0F5EB'

type FoundCoupon = { id: number; code: string; milestone: number; claimed_at: string; used: boolean; studentName: string }
type RecentCoupon = { id: number; code: string; milestone: number; claimed_at: string; used: boolean; studentName: string }

// 쿠폰처리 — 학생 계정의 숙제 이행률 연속 달성 쿠폰을 코드로 검색해 사용 처리하는 admin 전용 메뉴.
// 이전에는 학생관리 화면 상단에 있었는데, 학생을 찾을 필요 없이 코드만으로 바로 처리할 수 있도록
// 별도 메뉴로 분리했다.
export default function CouponsPage() {
  const { mobileMode } = useMobileMode()
  const [codeInput, setCodeInput] = useState('')
  const [searchBusy, setSearchBusy] = useState(false)
  const [searchErr, setSearchErr] = useState('')
  const [found, setFound] = useState<FoundCoupon | null>(null)
  const [recent, setRecent] = useState<RecentCoupon[]>([])
  const [loadingRecent, setLoadingRecent] = useState(true)
  const [notif, setNotif] = useState<{ msg: string; ok: boolean } | null>(null)

  function toast(msg: string, ok = true) { setNotif({ msg, ok }); setTimeout(() => setNotif(null), 3000) }

  useEffect(() => { loadRecent() }, [])

  async function loadRecent() {
    setLoadingRecent(true)
    const { data: coupons } = await supabase
      .from('student_coupons').select('id,code,milestone,claimed_at,used,student_id')
      .eq('used', false).order('claimed_at', { ascending: false }).limit(30)
    if (!coupons || coupons.length === 0) { setRecent([]); setLoadingRecent(false); return }
    const studentIds = [...new Set(coupons.map(c => c.student_id))]
    const { data: stus } = await supabase.from('students').select('id,name').in('id', studentIds)
    const nameMap: Record<number, string> = {}
    for (const s of (stus ?? [])) nameMap[s.id] = s.name
    setRecent(coupons.map(c => ({
      id: c.id, code: c.code, milestone: c.milestone, claimed_at: c.claimed_at, used: c.used,
      studentName: nameMap[c.student_id] ?? '알 수 없음',
    })))
    setLoadingRecent(false)
  }

  function normalizeCode(raw: string): string | null {
    const clean = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
    if (clean.length !== 6) return null
    return `${clean.slice(0, 3)}-${clean.slice(3)}`
  }

  async function searchByCode() {
    const code = normalizeCode(codeInput)
    if (!code) { setSearchErr('코드 6자리를 정확히 입력하세요.'); setFound(null); return }
    setSearchBusy(true); setSearchErr(''); setFound(null)
    const { data: coupon } = await supabase
      .from('student_coupons').select('id,code,milestone,claimed_at,used,student_id').eq('code', code).maybeSingle()
    if (!coupon) { setSearchErr('일치하는 쿠폰이 없습니다.'); setSearchBusy(false); return }
    const { data: stu } = await supabase.from('students').select('name').eq('id', coupon.student_id).maybeSingle()
    setFound({ id: coupon.id, code: coupon.code, milestone: coupon.milestone, claimed_at: coupon.claimed_at, used: coupon.used, studentName: stu?.name ?? '알 수 없음' })
    setSearchBusy(false)
  }

  async function toggleUsed(id: number, nextUsed: boolean) {
    const { error } = await supabase.from('student_coupons')
      .update({ used: nextUsed, used_at: nextUsed ? new Date().toISOString() : null }).eq('id', id)
    if (error) return toast('처리 실패: ' + error.message, false)
    if (found?.id === id) setFound({ ...found, used: nextUsed })
    setRecent(rs => nextUsed ? rs.filter(r => r.id !== id) : rs)
    toast(nextUsed ? '쿠폰을 사용 처리했습니다' : '쿠폰 사용을 취소했습니다')
  }

  return (
    <div style={{ padding: mobileMode ? '16px 14px 88px' : '28px 32px', fontFamily: "'Noto Sans KR',sans-serif" }}>
      {notif && (
        <div style={{ background: notif.ok ? gbg : '#FDECEA', border: `1px solid ${notif.ok ? gr : re}`, borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: notif.ok ? gr : re }}>
          {notif.msg}
        </div>
      )}

      <div style={{ marginBottom: mobileMode ? 14 : 20 }}>
        <h1 style={{ fontSize: mobileMode ? 17 : 21, fontWeight: 700, color: tx }}>쿠폰처리</h1>
        {!mobileMode && <p style={{ fontSize: 13, color: tx2, marginTop: 4 }}>학생이 보여준 쿠폰 코드를 검색해서 사용 처리합니다</p>}
      </div>

      {/* 코드 검색 */}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: mobileMode ? 14 : 18, marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: tx, margin: '0 0 10px' }}>🎟️ 쿠폰 코드로 검색</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={codeInput}
            onChange={e => setCodeInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchByCode()}
            placeholder="예) K3X-9QF"
            style={{ flex: 1, minWidth: 160, padding: '9px 12px', border: `1.5px solid ${bd}`, borderRadius: 8, fontSize: 14, fontFamily: 'monospace', letterSpacing: 1, outline: 'none', color: tx }}
          />
          <button className="bgold" onClick={searchByCode} disabled={searchBusy || !codeInput.trim()}>
            {searchBusy ? '검색 중...' : '검색'}
          </button>
        </div>
        {searchErr && <p style={{ fontSize: 12, color: re, margin: '8px 0 0' }}>{searchErr}</p>}
        {found && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12, padding: '10px 14px', background: bg, borderRadius: 10, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: tx, margin: 0 }}>{found.studentName} · {found.milestone}일 연속 달성 쿠폰</p>
              <p style={{ fontSize: 11, color: tx3, margin: '2px 0 0' }}>{found.claimed_at.slice(0, 10)} 획득 · 코드 {found.code} · {found.used ? '사용완료' : '사용가능'}</p>
            </div>
            <button className={found.used ? 'bout' : 'bgold'} onClick={() => toggleUsed(found.id, !found.used)}>
              {found.used ? '사용 취소' : '사용 처리'}
            </button>
          </div>
        )}
      </div>

      {/* 최근 발급된 미사용 쿠폰 목록 — 코드를 놓쳤을 때 훑어볼 수 있도록 */}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${bd}`, padding: mobileMode ? 14 : 18, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: tx, margin: '0 0 12px' }}>사용 가능한 쿠폰 (최근 {recent.length}건)</p>
        {loadingRecent ? (
          <p style={{ textAlign: 'center', color: tx3, fontSize: 13, padding: '20px 0' }}>불러오는 중...</p>
        ) : recent.length === 0 ? (
          <p style={{ textAlign: 'center', color: tx3, fontSize: 13, padding: '20px 0' }}>사용 가능한 쿠폰이 없습니다</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: mobileMode ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
            {recent.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 14px', background: bg, borderRadius: 10 }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: tx, margin: 0 }}>{c.studentName} · {c.milestone}일 연속</p>
                  <p style={{ fontSize: 11, color: tx3, margin: '2px 0 0', fontFamily: 'monospace' }}>{c.code} · {c.claimed_at.slice(0, 10)}</p>
                </div>
                <button className="bgold" onClick={() => toggleUsed(c.id, true)}>사용 처리</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
