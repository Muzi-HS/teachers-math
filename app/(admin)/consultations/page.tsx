'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { can } from '@/lib/permissions'
import { kstDateOf, kstTimeOf } from '@/lib/kst'
import { useMobileMode } from '@/context/MobileModeContext'

type ConsultationRequest = {
  id: number
  student_name: string
  grade: string
  school: string | null
  guardian_phone: string
  message: string | null
  status: 'new' | 'contacted' | 'done'
  created_at: string
}

const navy = '#0D2A5E', bg = '#F5F7FA', bd = '#DDE3EE', tx = '#0D1B36', tx2 = '#4B5C7E', tx3 = '#96A4BF'
const re = '#C0392B', rbg = '#FDECEA', gr = '#1A7F4E', gbg = '#E0F5EB', navyMuted = '#E8EEF8'

const STATUS_LABEL: Record<ConsultationRequest['status'], string> = { new: '신규', contacted: '연락함', done: '완료' }
const STATUS_COLOR: Record<ConsultationRequest['status'], { bg: string; color: string }> = {
  new: { bg: rbg, color: re }, contacted: { bg: navyMuted, color: navy }, done: { bg: gbg, color: gr },
}

export default function ConsultationsPage() {
  const { role } = useAuth()
  const { mobileMode } = useMobileMode()
  const [items, setItems] = useState<ConsultationRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | ConsultationRequest['status']>('all')
  const [notif, setNotif] = useState<{ msg: string; ok: boolean } | null>(null)

  const canManage = role ? can.manageConsultations(role) : false

  async function fetchItems() {
    const { data } = await supabase.from('consultation_requests').select('*').order('created_at', { ascending: false })
    setItems((data ?? []) as ConsultationRequest[])
    setLoading(false)
  }

  // 마운트 시 한 번 목록을 불러온다 (관리자 화면 조회 전용, 새로고침 버튼 없음)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 직후 서버 데이터를 한 번 동기화하는 목적의 fetch로, 다른 대안이 없다.
  useEffect(() => { fetchItems() }, [])

  function toast(msg: string, ok = true) { setNotif({ msg, ok }); setTimeout(() => setNotif(null), 3000) }

  async function setStatus(id: number, status: ConsultationRequest['status']) {
    await supabase.from('consultation_requests').update({ status }).eq('id', id)
    setItems(list => list.map(it => it.id === id ? { ...it, status } : it))
  }

  async function remove(id: number) {
    if (!confirm('이 상담 신청 내역을 삭제하시겠습니까?')) return
    await supabase.from('consultation_requests').delete().eq('id', id)
    toast('삭제되었습니다.', false)
    setItems(list => list.filter(it => it.id !== id))
  }

  const filtered = filter === 'all' ? items : items.filter(it => it.status === filter)

  return (
    <div style={{ padding: mobileMode ? '16px 14px 88px' : '28px 32px', fontFamily: "'Noto Sans KR', sans-serif" }}>
      <style>{`
        .cs-pill { padding:5px 12px; border-radius:20px; font-size:12px; font-weight:500; cursor:pointer; border:1.5px solid ${bd}; background:#fff; color:${tx2}; font-family:inherit; transition:all .15s; }
        .cs-pill.active { border-color:${navy}; background:${navy}; color:#fff; font-weight:700; }
        .cs-status-select { border:none; background:transparent; font-family:inherit; font-size:11.5px; font-weight:600; cursor:pointer; outline:none; }
      `}</style>

      {notif && (
        <div style={{ position: 'fixed', top: 18, right: 18, zIndex: 9999, background: '#fff', borderRadius: 8, padding: '11px 16px', borderLeft: `4px solid ${notif.ok ? gr : re}`, boxShadow: '0 4px 18px rgba(0,0,0,.1)', fontSize: 13, color: tx, maxWidth: 280 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>알림</div>
          <div style={{ fontSize: 12, color: tx2 }}>{notif.msg}</div>
        </div>
      )}

      <div style={{ marginBottom: mobileMode ? 14 : 20 }}>
        <h1 style={{ fontSize: mobileMode ? 17 : 21, fontWeight: 700, color: tx }}>상담 신청</h1>
        {!mobileMode && <p style={{ fontSize: 13, color: tx2, marginTop: 4 }}>홈페이지 시안의 상담 신청 폼으로 접수된 문의 목록입니다</p>}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {(['all', 'new', 'contacted', 'done'] as const).map(f => (
          <button key={f} className={`cs-pill${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? '전체' : STATUS_LABEL[f]} {f !== 'all' && `(${items.filter(it => it.status === f).length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: tx3, fontSize: 13 }}>불러오는 중...</p>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: tx3 }}>
          <p style={{ fontSize: 14 }}>접수된 상담 신청이 없습니다</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filtered.map(it => {
            const sc = STATUS_COLOR[it.status]
            return (
              <div key={it.id} style={{ background: '#fff', border: `1px solid ${bd}`, borderRadius: 10, padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: tx }}>{it.student_name}</span>
                      <span style={{ fontSize: 11.5, color: tx2 }}>{it.grade}{it.school ? ` · ${it.school}` : ''}</span>
                    </div>
                    <p style={{ fontSize: 12.5, color: tx2, marginBottom: 6 }}>
                      보호자 연락처 <a href={`tel:${it.guardian_phone.replace(/-/g, '')}`} style={{ color: navy, fontWeight: 600, textDecoration: 'none' }}>{it.guardian_phone}</a>
                    </p>
                    {it.message && <p style={{ fontSize: 13, color: tx, lineHeight: 1.6, background: bg, borderRadius: 8, padding: '10px 12px', marginBottom: 6, whiteSpace: 'pre-wrap' }}>{it.message}</p>}
                    <p style={{ fontSize: 11, color: tx3 }}>{kstDateOf(it.created_at)} {kstTimeOf(it.created_at)} 접수</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 4px 2px 10px', borderRadius: 20, background: sc.bg }}>
                      {canManage ? (
                        <select className="cs-status-select" value={it.status} onChange={e => setStatus(it.id, e.target.value as ConsultationRequest['status'])} style={{ color: sc.color }}>
                          {(['new', 'contacted', 'done'] as const).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                        </select>
                      ) : (
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: sc.color, padding: '3px 6px' }}>{STATUS_LABEL[it.status]}</span>
                      )}
                    </span>
                    {canManage && (
                      <button onClick={() => remove(it.id)} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: 'none', background: rbg, color: re, fontFamily: 'inherit' }}>삭제</button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
