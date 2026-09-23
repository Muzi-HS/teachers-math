'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { can } from '@/lib/permissions'
import { kstDateOf } from '@/lib/kst'
import { useMobileMode } from '@/context/MobileModeContext'

type SpecialClass = {
  id: number
  title: string
  subtitle: string | null
  description: string | null
  period: string | null
  target: string | null
  capacity: string | null
  is_active: boolean
  sort_order: number
  created_at: string
}

const EMPTY = { title: '', subtitle: '', description: '', period: '', target: '', capacity: '', is_active: true, sort_order: 0 }

const navy = 'var(--ui-primary)', navyDk = 'var(--ui-primary-text)', gold = 'var(--ui-primary)'
const bg = 'var(--ui-bg)', bd = 'var(--ui-border)', tx = 'var(--ui-text)', tx2 = 'var(--ui-text-2)', tx3 = 'var(--ui-text-3)'
const re = 'var(--ui-danger)', rbg = 'var(--ui-danger-bg)', gr = 'var(--ui-success)', gbg = 'var(--ui-success-bg)'

export default function SpecialClassesPage() {
  const { role } = useAuth()
  const { mobileMode } = useMobileMode()
  const [items, setItems] = useState<SpecialClass[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...EMPTY })
  const [saving, setSaving] = useState(false)
  const [notif, setNotif] = useState<{ msg: string; ok: boolean } | null>(null)

  const canWrite = role ? can.writeSpecialClass(role) : false

  async function fetchItems() {
    const { data } = await supabase.from('special_classes').select('*').order('sort_order').order('created_at', { ascending: false })
    setItems((data ?? []) as SpecialClass[])
    setLoading(false)
  }

  // 마운트 시 한 번 목록을 불러온다 (관리자 화면 조회 전용, 새로고침 버튼 없음)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 직후 서버 데이터를 한 번 동기화하는 목적의 fetch로, 다른 대안이 없다.
  useEffect(() => { fetchItems() }, [])

  function toast(msg: string, ok = true) { setNotif({ msg, ok }); setTimeout(() => setNotif(null), 3000) }

  function openAdd() { setEditId(null); setForm({ ...EMPTY, sort_order: items.length }); setModal(true) }
  function openEdit(it: SpecialClass) {
    setEditId(it.id)
    setForm({
      title: it.title, subtitle: it.subtitle ?? '', description: it.description ?? '',
      period: it.period ?? '', target: it.target ?? '', capacity: it.capacity ?? '',
      is_active: it.is_active, sort_order: it.sort_order,
    })
    setModal(true)
  }

  async function save() {
    if (!form.title.trim()) return toast('제목을 입력하세요.', false)
    setSaving(true)
    const payload = {
      title: form.title, subtitle: form.subtitle || null, description: form.description || null,
      period: form.period || null, target: form.target || null, capacity: form.capacity || null,
      is_active: form.is_active, sort_order: form.sort_order,
    }
    const { error } = editId
      ? await supabase.from('special_classes').update(payload).eq('id', editId)
      : await supabase.from('special_classes').insert(payload)
    setSaving(false)
    if (error) return toast('저장 실패: ' + error.message, false)
    toast(editId ? '수정되었습니다.' : '등록되었습니다.')
    setModal(false); fetchItems()
  }

  async function remove(id: number) {
    if (!confirm('이 특강 게시물을 삭제하시겠습니까?')) return
    await supabase.from('special_classes').delete().eq('id', id)
    toast('삭제되었습니다.', false); fetchItems()
  }

  async function toggleActive(it: SpecialClass) {
    await supabase.from('special_classes').update({ is_active: !it.is_active }).eq('id', it.id)
    fetchItems()
  }

  const fi: React.CSSProperties = { width: '100%', padding: '9px 11px', border: `1.5px solid ${bd}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: tx, outline: 'none', background: '#fff', boxSizing: 'border-box' }
  const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: tx2, marginBottom: 5 }

  return (
    <div style={{ padding: mobileMode ? '16px 14px 88px' : '28px 32px', fontFamily: "'Noto Sans KR', sans-serif" }}>
      {notif && (
        <div style={{ position: 'fixed', top: 18, right: 18, zIndex: 9999, background: '#fff', borderRadius: 8, padding: '11px 16px', borderLeft: `4px solid ${notif.ok ? gr : re}`, boxShadow: '0 4px 18px rgba(0,0,0,.1)', fontSize: 13, color: tx, maxWidth: 280 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{notif.ok ? '완료' : '알림'}</div>
          <div style={{ fontSize: 12, color: tx2 }}>{notif.msg}</div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: mobileMode ? 14 : 20 }}>
        <div>
          <h1 style={{ fontSize: mobileMode ? 17 : 21, fontWeight: 700, color: tx }}>특강 관리</h1>
          {!mobileMode && <p style={{ fontSize: 13, color: tx2, marginTop: 4 }}>홈페이지 시안에 노출되는 특강 홍보 게시물을 관리합니다</p>}
        </div>
        {canWrite && (
          <button onClick={openAdd} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none', background: gold, color: navyDk, fontFamily: 'inherit' }}>
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
            특강 등록
          </button>
        )}
      </div>

      {loading ? (
        <p style={{ color: tx3, fontSize: 13 }}>불러오는 중...</p>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: tx3 }}>
          <p style={{ fontSize: 14 }}>등록된 특강이 없습니다</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map(it => (
            <div key={it.id} style={{ background: '#fff', border: `1px solid ${bd}`, borderRadius: 10, padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: tx }}>{it.title}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: it.is_active ? gbg : rbg, color: it.is_active ? gr : re }}>
                      {it.is_active ? '노출 중' : '숨김'}
                    </span>
                  </div>
                  {it.subtitle && <p style={{ fontSize: 12.5, color: tx2, marginBottom: 6 }}>{it.subtitle}</p>}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11.5, color: tx3 }}>
                    {it.period && <span>기간 {it.period}</span>}
                    {it.target && <span>대상 {it.target}</span>}
                    {it.capacity && <span>정원 {it.capacity}</span>}
                    <span>등록일 {kstDateOf(it.created_at)}</span>
                  </div>
                </div>
                {canWrite && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => toggleActive(it)} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: `1px solid ${bd}`, background: 'transparent', color: tx2, fontFamily: 'inherit' }}>
                      {it.is_active ? '숨기기' : '노출하기'}
                    </button>
                    <button onClick={() => openEdit(it)} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: `1px solid ${bd}`, background: 'transparent', color: tx2, fontFamily: 'inherit' }}>수정</button>
                    <button onClick={() => remove(it.id)} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: 'none', background: rbg, color: re, fontFamily: 'inherit' }}>삭제</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div onClick={() => setModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.42)', zIndex: 1000, display: 'flex', alignItems: mobileMode ? 'flex-end' : 'center', justifyContent: 'center', padding: mobileMode ? 0 : 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: mobileMode ? '16px 16px 0 0' : 12, width: mobileMode ? '100%' : 480, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.15)' }}>
            <div style={{ padding: '18px 22px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: tx }}>{editId ? '특강 수정' : '특강 등록'}</span>
              <button onClick={() => setModal(false)} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: bg, cursor: 'pointer', fontSize: 17, color: tx2 }}>×</button>
            </div>
            <div style={{ padding: '18px 22px' }}>
              <div style={{ marginBottom: 14 }}>
                <label style={label}>제목 *</label>
                <input style={fi} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="예: 2026 겨울방학 심화 특강" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={label}>부제</label>
                <input style={fi} value={form.subtitle} onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))} placeholder="한 줄 소개" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={label}>기간</label>
                  <input style={fi} value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} placeholder="2026.01.05 ~ 01.30" />
                </div>
                <div>
                  <label style={label}>대상</label>
                  <input style={fi} value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value }))} placeholder="중2~고1" />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={label}>정원</label>
                <input style={fi} value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} placeholder="선착순 10명" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={label}>상세 설명</label>
                <textarea rows={4} style={{ ...fi, resize: 'vertical', fontFamily: 'inherit' }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="특강 커리큘럼, 강사, 신청 방법 등" />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} style={{ width: 15, height: 15, accentColor: navy, cursor: 'pointer' }} />
                <span style={{ fontSize: 13, color: tx2 }}>홈페이지에 바로 노출</span>
              </label>
            </div>
            <div style={{ padding: '0 22px 18px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(false)} style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: `1px solid ${bd}`, background: 'transparent', color: tx2, fontFamily: 'inherit' }}>취소</button>
              <button onClick={save} disabled={saving} style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none', background: gold, color: navyDk, fontFamily: 'inherit', opacity: saving ? .7 : 1 }}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
