'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { loadStudentClassNames } from '@/lib/student-class-names'

type Coupon = { id: number; code: string; milestone: number; claimed_at: string; used: boolean; used_at: string | null; student_id: number; studentName: string }

export default function CouponProcessingView() {
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [classNames, setClassNames] = useState<Record<number, string>>({})
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
      const [{ data, error }, namesByStudent] = await Promise.all([supabase.from('student_coupons')
        .select('id,code,milestone,claimed_at,used,used_at,student_id')
        .in('student_id', students.map(student => student.id))
        .or(`used.eq.false,used_at.gt.${new Date(Date.now() - 86400000).toISOString()}`)
        .order('claimed_at', { ascending: false }), loadStudentClassNames()])
      if (error) throw error
      setClassNames(namesByStudent)
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
  const unused = coupons.filter(coupon => !coupon.used)
  const used = coupons.filter(coupon => coupon.used).sort((a, b) => (b.used_at ?? '').localeCompare(a.used_at ?? ''))
  const dateTime = (date: string) => new Date(date).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  function couponList(rows: Coupon[], isUsed: boolean) {
    return <section className="coupon-panel" aria-label={isUsed ? '사용된 쿠폰 목록' : '사용 가능한 쿠폰 목록'}>
      <header><div><h3>{isUsed ? '사용된 쿠폰' : '사용 가능한 쿠폰'} <span>{rows.length}</span></h3><p>{isUsed ? '사용 처리 후 24시간 동안 취소할 수 있습니다.' : '학생 이름과 반을 확인한 뒤 쿠폰을 처리하세요.'}</p></div></header>
      <div className="coupon-table-scroll"><table className="coupon-table"><thead><tr><th scope="col">이름</th><th scope="col">반</th><th scope="col">연속일수</th><th scope="col">쿠폰 코드</th>{isUsed && <th scope="col">사용 처리 · 삭제 예정</th>}<th scope="col">{isUsed ? '사용 취소' : '사용'}</th><th scope="col">복원</th></tr></thead><tbody>
        {rows.map(coupon => <tr key={coupon.id}><td><strong>{coupon.studentName}</strong><small>{dateTime(coupon.claimed_at)} 발급</small></td><td className="coupon-class">{classNames[coupon.student_id] || '미배정'}</td><td><span className="coupon-days">{coupon.milestone}일</span></td><td><code>{coupon.code}</code></td>{isUsed && <td>{coupon.used_at ? dateTime(coupon.used_at) : '—'}<small>{coupon.used_at ? `${dateTime(new Date(new Date(coupon.used_at).getTime() + 86400000).toISOString())} 삭제` : ''}</small></td>}<td><button className={isUsed ? 'bout' : 'bgold'} disabled={busy !== null} onClick={() => void process(coupon, isUsed ? 'cancel' : 'use')}>{busy === coupon.id ? '처리 중…' : isUsed ? '사용 취소' : '사용 처리'}</button></td><td>{isUsed ? <span title="사용을 취소한 뒤 복원할 수 있습니다">—</span> : <button className="bout" disabled={busy !== null} onClick={() => void process(coupon, 'restore')}>복원</button>}</td></tr>)}
        {!rows.length && <tr><td className="coupon-empty" colSpan={isUsed ? 7 : 6}>{isUsed ? '사용된 쿠폰이 없습니다.' : '사용 가능한 쿠폰이 없습니다.'}</td></tr>}
      </tbody></table></div>
    </section>
  }
  return <section className="coupon-management" style={{ color: 'var(--ui-text)' }}>
    <style>{`
      .coupon-management{min-width:0}.coupon-panel{background:var(--ui-surface);border:1px solid var(--ui-border);border-radius:14px;overflow:hidden;margin-top:20px}
      .coupon-panel header{padding:20px 22px;border-bottom:1px solid var(--ui-border)}.coupon-panel h3{font-size:15px;font-weight:700;display:flex;align-items:center;gap:8px;margin:0}.coupon-panel h3 span{font-size:11px;padding:3px 8px;border-radius:20px;background:var(--ui-surface-2);color:var(--ui-primary)}.coupon-panel header p{font-size:12px;color:var(--ui-text-3);margin:6px 0 0}
      .coupon-table-scroll{overflow-x:auto}.coupon-table{width:100%;min-width:650px;border-collapse:collapse;font-size:13px}.coupon-table th{text-align:left;background:var(--ui-surface-2);color:var(--ui-text-2);font-size:12px;font-weight:500}.coupon-table th,.coupon-table td{padding:14px 18px;border-bottom:1px solid var(--ui-border);white-space:nowrap}.coupon-table tr:last-child td{border-bottom:0}.coupon-table tbody tr:hover{background:var(--ui-bg)}.coupon-table small{display:block;color:var(--ui-text-3);font-size:11px;margin-top:5px}.coupon-table .coupon-class{white-space:normal;min-width:110px;max-width:220px;line-height:1.6}.coupon-table code{font-size:12px;letter-spacing:.7px;background:var(--ui-surface-2);padding:5px 8px;border-radius:6px}.coupon-days{color:var(--ui-primary);font-weight:700}.coupon-table button{font-size:12px;white-space:nowrap}.coupon-table .coupon-empty{text-align:center;color:var(--ui-text-3);padding:36px}.coupon-management button:disabled{opacity:.6;cursor:wait}
      @media(max-width:700px){.coupon-panel header{padding:16px}.coupon-table th,.coupon-table td{padding:12px}.coupon-panel{margin-top:16px}}
    `}</style>
    <h2 style={{ fontSize: 17, fontWeight: 700 }}>쿠폰</h2>
    <p style={{ fontSize: 13, color: 'var(--ui-text-2)', margin: '8px 0 16px', lineHeight: 1.7 }}>사용 처리 후 24시간 동안 취소할 수 있으며, 이후 쿠폰이 자동 삭제됩니다. 복원은 쿠폰을 반납하고 받기 전의 연속 도전을 이어갑니다. 이후 새 쿠폰을 받은 경우 이전 쿠폰은 복원할 수 없습니다.</p>
    <form onSubmit={event => { event.preventDefault(); if (query === name.trim()) void load(); else setQuery(name.trim()) }} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
      <input aria-label="학생 이름 검색" placeholder="학생 이름으로 검색" value={name} onChange={event => setName(event.target.value)} style={{ flex: 1, minWidth: 0, padding: '10px 12px', border: '1px solid var(--ui-border)', borderRadius: 8, background: 'var(--ui-surface)', color: 'var(--ui-text)' }} />
      <button className="bgold" disabled={loading}>검색</button>
      <button type="button" className="bout" onClick={() => { setName(''); setQuery(''); if (!query) void load() }}>전체</button>
    </form>
    {message && <p role="status" style={{ fontSize: 13, marginBottom: 12 }}>{message}</p>}
    {loading ? <p role="status" style={{ padding: 24, textAlign: 'center' }}>불러오는 중…</p> : <>{couponList(unused, false)}{couponList(used, true)}</>}
  </section>
}
