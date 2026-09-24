'use client'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { can } from '@/lib/permissions'
import { kstDateOf } from '@/lib/kst'
import { useMobileMode } from '@/context/MobileModeContext'
import type { PopupType } from '@/lib/site-settings'
import { uploadPromoImage } from './promoImage'

type Seminar = {
  id: number
  title: string
  description: string | null
  event_at: string | null
  location: string | null
  capacity: number
  is_active: boolean
  banner_enabled: boolean
  popup_enabled: boolean
  popup_type: PopupType
  popup_image_url: string | null
  popup_title: string | null
  popup_body: string | null
  created_at: string
}

type Registration = {
  id: number
  parent_name: string
  phone: string
  child_name: string | null
  child_grade: string
  child_school: string
  status: 'confirmed' | 'waitlisted' | 'cancelled'
  created_at: string
}

const EMPTY = {
  title: '', description: '', event_at: '', location: '', capacity: 0, is_active: true,
  banner_enabled: true, popup_enabled: false, popup_type: 'text' as PopupType,
  popup_image_url: null as string | null, popup_title: '', popup_body: '',
}

const navy = 'var(--ui-primary)', navyDk = 'var(--ui-primary-text)', gold = 'var(--ui-primary)'
const bg = 'var(--ui-bg)', bd = 'var(--ui-border)', tx = 'var(--ui-text)', tx2 = 'var(--ui-text-2)', tx3 = 'var(--ui-text-3)'
const re = 'var(--ui-danger)', rbg = 'var(--ui-danger-bg)', gr = 'var(--ui-success)', gbg = 'var(--ui-success-bg)', navyMuted = 'var(--ui-surface-2)'

const STATUS_LABEL: Record<Registration['status'], string> = { confirmed: '확정', waitlisted: '대기', cancelled: '취소' }
const POPUP_TYPE_LABEL: Record<PopupType, string> = { image: '이미지', text: '글', both: '이미지 + 글' }

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function SeminarTab() {
  const { role } = useAuth()
  const { mobileMode } = useMobileMode()
  const [items, setItems] = useState<Seminar[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...EMPTY })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [notif, setNotif] = useState<{ msg: string; ok: boolean } | null>(null)
  const [openRosterId, setOpenRosterId] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const canWrite = role ? can.manageSiteSettings(role) : false

  async function fetchItems() {
    const { data } = await supabase.from('parent_seminars').select('*').order('created_at', { ascending: false })
    setItems((data ?? []) as Seminar[])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 직후 서버 데이터를 한 번 동기화하는 목적의 fetch로, 다른 대안이 없다.
  useEffect(() => { fetchItems() }, [])

  function toast(msg: string, ok = true) { setNotif({ msg, ok }); setTimeout(() => setNotif(null), 3000) }

  function openAdd() { setEditId(null); setForm({ ...EMPTY }); setModal(true) }
  function openEdit(it: Seminar) {
    setEditId(it.id)
    setForm({
      title: it.title, description: it.description ?? '', event_at: toDatetimeLocal(it.event_at),
      location: it.location ?? '', capacity: it.capacity, is_active: it.is_active,
      banner_enabled: it.banner_enabled, popup_enabled: it.popup_enabled, popup_type: it.popup_type,
      popup_image_url: it.popup_image_url, popup_title: it.popup_title ?? '', popup_body: it.popup_body ?? '',
    })
    setModal(true)
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const { url, error } = await uploadPromoImage(file)
    setUploading(false)
    if (error) { toast('이미지 업로드 실패: ' + error, false); return }
    setForm(f => ({ ...f, popup_image_url: url }))
    if (fileRef.current) fileRef.current.value = ''
  }

  async function save() {
    if (!form.title.trim()) return toast('제목을 입력하세요.', false)
    setSaving(true)
    const payload = {
      title: form.title, description: form.description || null,
      event_at: form.event_at ? new Date(form.event_at).toISOString() : null,
      location: form.location || null, capacity: Number(form.capacity) || 0, is_active: form.is_active,
      banner_enabled: form.banner_enabled, popup_enabled: form.popup_enabled, popup_type: form.popup_type,
      popup_image_url: form.popup_image_url, popup_title: form.popup_title || null, popup_body: form.popup_body || null,
    }
    const { error } = editId
      ? await supabase.from('parent_seminars').update(payload).eq('id', editId)
      : await supabase.from('parent_seminars').insert(payload)
    setSaving(false)
    if (error) return toast('저장 실패: ' + error.message, false)
    toast(editId ? '수정되었습니다.' : '등록되었습니다.')
    setModal(false); fetchItems()
  }

  async function remove(id: number) {
    if (!confirm('이 설명회를 삭제하시겠습니까? 신청자 명단도 함께 삭제됩니다.')) return
    await supabase.from('parent_seminars').delete().eq('id', id)
    toast('삭제되었습니다.', false); fetchItems()
  }

  async function toggleActive(it: Seminar) {
    await supabase.from('parent_seminars').update({ is_active: !it.is_active }).eq('id', it.id)
    fetchItems()
  }

  const fi: React.CSSProperties = { width: '100%', padding: '9px 11px', border: `1.5px solid ${bd}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: tx, outline: 'none', background: '#fff', boxSizing: 'border-box' }
  const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: tx2, marginBottom: 5 }
  const showImage = form.popup_type === 'image' || form.popup_type === 'both'
  const showText = form.popup_type === 'text' || form.popup_type === 'both'

  return (
    <div>
      {notif && (
        <div style={{ position: 'fixed', top: 18, right: 18, zIndex: 9999, background: '#fff', borderRadius: 8, padding: '11px 16px', borderLeft: `4px solid ${notif.ok ? gr : re}`, boxShadow: '0 4px 18px rgba(0,0,0,.1)', fontSize: 13, color: tx, maxWidth: 280 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{notif.ok ? '완료' : '알림'}</div>
          <div style={{ fontSize: 12, color: tx2 }}>{notif.msg}</div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: tx }}>학부모 설명회 회차</p>
        {canWrite && (
          <button onClick={openAdd} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none', background: gold, color: navyDk, fontFamily: 'inherit' }}>
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
            설명회 등록
          </button>
        )}
      </div>

      {loading ? (
        <p style={{ color: tx3, fontSize: 13 }}>불러오는 중...</p>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: tx3 }}>
          <p style={{ fontSize: 14 }}>등록된 설명회가 없습니다</p>
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
                      {it.is_active ? '접수 중' : '숨김'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11.5, color: tx3 }}>
                    {it.event_at && <span>일시 {kstDateOf(it.event_at)}</span>}
                    {it.location && <span>장소 {it.location}</span>}
                    <span>정원 {it.capacity > 0 ? `${it.capacity}명` : '제한 없음'}</span>
                  </div>
                </div>
                {canWrite && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                    <button onClick={() => setOpenRosterId(openRosterId === it.id ? null : it.id)} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: `1px solid ${navy}`, background: 'transparent', color: navy, fontFamily: 'inherit' }}>
                      {openRosterId === it.id ? '명단 닫기' : '신청자 명단'}
                    </button>
                    <button onClick={() => toggleActive(it)} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: `1px solid ${bd}`, background: 'transparent', color: tx2, fontFamily: 'inherit' }}>
                      {it.is_active ? '숨기기' : '노출하기'}
                    </button>
                    <button onClick={() => openEdit(it)} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: `1px solid ${bd}`, background: 'transparent', color: tx2, fontFamily: 'inherit' }}>수정</button>
                    <button onClick={() => remove(it.id)} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: 'none', background: rbg, color: re, fontFamily: 'inherit' }}>삭제</button>
                  </div>
                )}
              </div>
              {openRosterId === it.id && <RosterPanel seminarId={it.id} onToast={toast} />}
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.42)', zIndex: 1000, display: 'flex', alignItems: mobileMode ? 'flex-end' : 'center', justifyContent: 'center', padding: mobileMode ? 0 : 16 }}>
          <div style={{ background: '#fff', borderRadius: mobileMode ? '16px 16px 0 0' : 12, width: mobileMode ? '100%' : 520, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.15)' }}>
            <div style={{ padding: '18px 22px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: tx }}>{editId ? '설명회 수정' : '설명회 등록'}</span>
              <button onClick={() => setModal(false)} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: bg, cursor: 'pointer', fontSize: 17, color: tx2 }}>×</button>
            </div>
            <div style={{ padding: '18px 22px' }}>
              <div style={{ marginBottom: 14 }}>
                <label style={label}>제목 *</label>
                <input style={fi} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="예: 2026년 상반기 학부모 설명회" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={label}>설명</label>
                <textarea rows={3} style={{ ...fi, resize: 'vertical', fontFamily: 'inherit' }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="설명회 소개 문구" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={label}>일시</label>
                  <input type="datetime-local" style={fi} value={form.event_at} onChange={e => setForm(f => ({ ...f, event_at: e.target.value }))} />
                </div>
                <div>
                  <label style={label}>장소</label>
                  <input style={fi} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="학원 3층 강당" />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={label}>정원 (0 = 제한 없음)</label>
                <input type="number" min={0} style={fi} value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: Number(e.target.value) }))} />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 14 }}>
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} style={{ width: 15, height: 15, accentColor: navy, cursor: 'pointer' }} />
                <span style={{ fontSize: 13, color: tx2 }}>신청 접수 중(홈페이지에 노출)</span>
              </label>

              <div style={{ paddingTop: 14, borderTop: `1px solid ${bd}` }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 14 }}>
                  <input type="checkbox" checked={form.banner_enabled} onChange={e => setForm(f => ({ ...f, banner_enabled: e.target.checked }))} style={{ width: 15, height: 15, accentColor: navy, cursor: 'pointer' }} />
                  <span style={{ fontSize: 13, color: tx2 }}>배너로 노출</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 14 }}>
                  <input type="checkbox" checked={form.popup_enabled} onChange={e => setForm(f => ({ ...f, popup_enabled: e.target.checked }))} style={{ width: 15, height: 15, accentColor: navy, cursor: 'pointer' }} />
                  <span style={{ fontSize: 13, color: tx2 }}>팝업으로 노출</span>
                </label>

                {form.popup_enabled && (
                  <div style={{ marginLeft: 4 }}>
                    <div style={{ marginBottom: 14 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: tx2, margin: '0 0 8px' }}>팝업 유형</p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {(['image', 'text', 'both'] as const).map(t => (
                          <label key={t} style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8,
                            border: `1.5px solid ${form.popup_type === t ? navy : bd}`, background: form.popup_type === t ? navyMuted : '#fff',
                            cursor: 'pointer', fontSize: 12.5, color: form.popup_type === t ? navy : tx2, fontWeight: form.popup_type === t ? 700 : 500,
                          }}>
                            <input type="radio" checked={form.popup_type === t} onChange={() => setForm(f => ({ ...f, popup_type: t }))} />
                            {POPUP_TYPE_LABEL[t]}
                          </label>
                        ))}
                      </div>
                    </div>
                    {showImage && (
                      <div style={{ marginBottom: 14 }}>
                        <label style={label}>팝업 이미지</label>
                        {form.popup_image_url && (
                          // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage 공개 URL 미리보기
                          <img src={form.popup_image_url} alt="팝업 이미지 미리보기" style={{ width: '100%', maxWidth: 220, borderRadius: 8, marginBottom: 8, display: 'block', border: `1px solid ${bd}` }} />
                        )}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} disabled={uploading} style={{ fontSize: 12 }} />
                          {uploading && <span style={{ fontSize: 12, color: tx3 }}>업로드 중...</span>}
                        </div>
                      </div>
                    )}
                    {showText && (
                      <>
                        <div style={{ marginBottom: 14 }}>
                          <label style={label}>팝업 제목</label>
                          <input style={fi} value={form.popup_title} onChange={e => setForm(f => ({ ...f, popup_title: e.target.value }))} />
                        </div>
                        <div style={{ marginBottom: 4 }}>
                          <label style={label}>팝업 본문</label>
                          <textarea rows={3} style={{ ...fi, resize: 'vertical', fontFamily: 'inherit' }} value={form.popup_body} onChange={e => setForm(f => ({ ...f, popup_body: e.target.value }))} />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
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

function RosterPanel({ seminarId, onToast }: { seminarId: number; onToast: (msg: string, ok?: boolean) => void }) {
  const [items, setItems] = useState<Registration[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchRoster() {
    setLoading(true)
    const { data } = await supabase.from('parent_seminar_registrations').select('*').eq('seminar_id', seminarId).order('created_at')
    setItems((data ?? []) as Registration[])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- 명단 패널을 펼칠 때 한 번 서버 데이터를 불러오는 목적의 fetch로, 다른 대안이 없다.
  useEffect(() => { fetchRoster() }, [seminarId])

  async function cancelOne(it: Registration) {
    if (!confirm(`${it.parent_name}님의 신청을 취소하시겠습니까?`)) return
    await supabase.rpc('cancel_seminar_registration', { p_seminar_id: seminarId, p_phone: it.phone })
    fetchRoster()
  }

  async function deleteAll() {
    if (items.length === 0) return
    if (!confirm('설명회 종료 후 개인정보 보호를 위해 신청자 명단 전체를 삭제합니다. 되돌릴 수 없습니다. 계속하시겠습니까?')) return
    const { error } = await supabase.from('parent_seminar_registrations').delete().eq('seminar_id', seminarId)
    if (error) { onToast('삭제 실패: ' + error.message, false); return }
    onToast('신청자 명단이 모두 삭제되었습니다.')
    fetchRoster()
  }

  const waitlisted = items.filter(i => i.status === 'waitlisted')
  const waitPos = new Map(waitlisted.map((it, i) => [it.id, i + 1]))

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${bd}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <p style={{ fontSize: 12.5, fontWeight: 700, color: tx2 }}>신청자 {items.filter(i => i.status !== 'cancelled').length}명</p>
        {items.length > 0 && (
          <button onClick={deleteAll} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: 'none', background: rbg, color: re, fontFamily: 'inherit' }}>
            명단 전체 삭제(폐기)
          </button>
        )}
      </div>
      {loading ? (
        <p style={{ fontSize: 12, color: tx3 }}>불러오는 중...</p>
      ) : items.length === 0 ? (
        <p style={{ fontSize: 12, color: tx3 }}>신청자가 없습니다.</p>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {items.map(it => (
            <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 10px', background: bg, borderRadius: 8, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, fontSize: 12.5, color: tx }}>
                <strong>{it.parent_name}</strong>{' '}
                <a href={`tel:${it.phone}`} style={{ color: navy, textDecoration: 'none' }}>{it.phone}</a>
                {' · '}{it.child_grade} {it.child_school}{it.child_name ? ` · ${it.child_name}` : ''}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                  background: it.status === 'confirmed' ? gbg : it.status === 'waitlisted' ? navyMuted : rbg,
                  color: it.status === 'confirmed' ? gr : it.status === 'waitlisted' ? navy : re,
                }}>
                  {it.status === 'waitlisted' ? `대기 ${waitPos.get(it.id)}번` : STATUS_LABEL[it.status]}
                </span>
                {it.status !== 'cancelled' && (
                  <button onClick={() => cancelOne(it)} style={{ padding: '3px 8px', borderRadius: 20, fontSize: 10.5, fontWeight: 500, cursor: 'pointer', border: `1px solid ${bd}`, background: 'transparent', color: tx2, fontFamily: 'inherit' }}>취소</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
