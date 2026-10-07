'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useMobileMode } from '@/context/MobileModeContext'

type Coupon = { id: number; code: string; milestone: number; claimed_at: string; used: boolean; used_at: string | null; student_id: number; studentName: string }

export default function CouponProcessingView() {
  const { mobileMode } = useMobileMode()
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    try {
      let studentsQuery = supabase.from('students').select('id,name').order('name')
      if (query) studentsQuery = studentsQuery.ilike('name', `%${query.replace(/[\\%_]/g, '\\$&')}%`)
      const { data: students, error: studentsError } = await studentsQuery
      if (studentsError) throw studentsError
      if (!students?.length) { setCoupons([]); return }
      const names = new Map(students.map(student => [student.id, student.name]))
      const { data, error } = await supabase.from('student_coupons')
        .select('id,code,milestone,claimed_at,used,used_at,student_id')
        .in('student_id', students.map(student => student.id))
        .or(`used.eq.false,used_at.gt.${new Date(Date.now() - 86400000).toISOString()}`)
        .order('claimed_at', { ascending: false })
      if (error) throw error
      setCoupons((data ?? []).map(coupon => ({ ...coupon, studentName: names.get(coupon.student_id) ?? '알 수 없음' })))
    } catch { setMessage('쿠폰을 불러오지 못했습니다. 다시 시도해 주세요.') }
    finally { setLoading(false) }
  }, [query])
  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    const refresh = window.setInterval(() => { void load() }, 60000)
    return () => { window.clearTimeout(timer); window.clearInterval(refresh) }
  }, [load])
  async function process(coupon: Coupon, action: 'use' | 'cancel' | 'restore') {
    if (busy !== null) return
    if (action === 'restore' && !window.confirm(`${coupon.studentName} 학생의 쿠폰을 반납하고 연속 도전을 복원할까요?`)) return
    setBusy(coupon.id)
    const { error } = await supabase.rpc('admin_process_coupon', { p_coupon_id: coupon.id, p_action: action })
    setBusy(null)
    if (error) { setMessage(error.message); return }
    setMessage(action === 'use' ? '사용 처리했습니다. 24시간 안에 사용 취소할 수 있습니다.' : action === 'cancel' ? '쿠폰 사용을 취소했습니다.' : '쿠폰을 반납하고 다음 도전을 이어가도록 복원했습니다.')
    await load()
  }
  return <section style={{ color: 'var(--ui-text)' }}>
    <h2 style={{ fontSize: 17, fontWeight: 700 }}>쿠폰</h2>
    <p style={{ fontSize: 13, color: 'var(--ui-text-2)', margin: '8px 0 16px', lineHeight: 1.7 }}>사용 처리 후 24시간 동안 취소할 수 있으며, 이후 쿠폰이 자동 삭제됩니다. 복원은 쿠폰을 반납하고 받기 전의 연속 도전을 이어갑니다. 이후 새 쿠폰을 받은 경우 이전 쿠폰은 복원할 수 없습니다.</p>
    <form onSubmit={event => { event.preventDefault(); if (query === name.trim()) void load(); else setQuery(name.trim()) }} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
      <input aria-label="학생 이름 검색" placeholder="학생 이름으로 검색" value={name} onChange={event => setName(event.target.value)} style={{ flex: 1, minWidth: 0, padding: '10px 12px', border: '1px solid var(--ui-border)', borderRadius: 8 }} />
      <button className="bgold" disabled={loading}>검색</button>
      <button type="button" className="bout" onClick={() => { setName(''); setQuery(''); if (!query) void load() }}>전체</button>
    </form>
    {message && <p role="status" style={{ fontSize: 13, marginBottom: 12 }}>{message}</p>}
    {loading ? <p>불러오는 중…</p> : !coupons.length ? <p>해당 학생의 쿠폰이 없습니다.</p> : <div style={{ display: 'grid', gridTemplateColumns: mobileMode ? '1fr' : 'repeat(auto-fill,minmax(340px,1fr))', gap: 10 }}>{coupons.map(coupon => <div key={coupon.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, background: 'var(--ui-surface-2)', borderRadius: 10, padding: 14 }}>
      <div><strong style={{ fontSize: 13 }}>{coupon.studentName} · {coupon.milestone}일 연속</strong><p style={{ fontSize: 11, color: 'var(--ui-text-3)', marginTop: 4 }}>{coupon.code} · {new Date(coupon.claimed_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>{coupon.used && <p style={{ fontSize: 11, color: 'var(--ui-text-2)', marginTop: 4 }}>사용 완료 · {new Date(new Date(coupon.used_at!).getTime() + 86400000).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} 삭제 예정</p>}</div>
      <div style={{ display: 'flex', gap: 6 }}><button className="bout" disabled={busy !== null} onClick={() => void process(coupon, coupon.used ? 'cancel' : 'use')}>{coupon.used ? '사용 취소' : '사용 처리'}</button>{!coupon.used && <button className="bout" disabled={busy !== null} onClick={() => void process(coupon, 'restore')}>복원</button>}</div>
    </div>)}</div>}
  </section>
}
