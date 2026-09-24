'use client'
import { useEffect, useState } from 'react'
import Reveal from './Reveal'
import { supabase } from '@/lib/supabase'

const deep = '#154A32', deep2 = '#2A6349', gold = '#D87E13', line = 'rgba(21,74,50,.18)'

const GRADES = ['미취학', '초1', '초2', '초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3']
const PHONE_RE = /^01[016789]-?\d{3,4}-?\d{4}$/

type Seminar = {
  id: number
  title: string
  description: string | null
  event_at: string | null
  location: string | null
  capacity: number
}

type RegisterForm = { parentName: string; phone: string; childName: string; childGrade: string; childSchool: string; agree: boolean }
const BLANK: RegisterForm = { parentName: '', phone: '', childName: '', childGrade: '', childSchool: '', agree: false }

type LookupResult = { status: 'confirmed' | 'waitlisted'; waitlist_position: number | null } | null | 'not-found'

function fmtEventAt(iso: string | null): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return null }
}

export default function ParentSeminarSection() {
  const [seminar, setSeminar] = useState<Seminar | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [mode, setMode] = useState<'register' | 'check'>('register')

  useEffect(() => {
    let cancelled = false
    supabase.from('parent_seminars').select('id, title, description, event_at, location, capacity')
      .eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (!cancelled) { setSeminar(data as Seminar | null); setLoaded(true) } })
    return () => { cancelled = true }
  }, [])

  const fi: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 9, border: `1.5px solid ${line}`,
    background: '#fff', color: deep, fontSize: 15, fontFamily: "'Noto Sans KR',sans-serif", outline: 'none', boxSizing: 'border-box',
  }
  const label: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 600, color: deep2, marginBottom: 7 }

  if (!loaded || !seminar) return null

  return (
    <section id="lpv-seminar" style={{ background: '#fff', padding: '120px 20px' }}>
      <style>{`
        .lpv-sem-form input:focus,.lpv-sem-form select:focus{border-color:${gold} !important}
        .lpv-sem-form [aria-invalid="true"]{border-color:#B3261E !important}
        .lpv-sem-submit{width:100%;padding:15px;border-radius:9px;border:none;background:${deep};color:#fff;
          font-size:15px;font-weight:700;font-family:inherit;cursor:pointer;transition:background .15s}
        .lpv-sem-submit:hover:not(:disabled){background:#0F3A26}
        .lpv-sem-submit:disabled{opacity:.6;cursor:default}
        .lpv-sem-tab{flex:1;padding:11px;border:none;background:none;font-size:13.5px;font-weight:700;color:${deep2};cursor:pointer;font-family:inherit;border-bottom:2px solid transparent}
        .lpv-sem-tab[data-active="true"]{color:${deep};border-bottom-color:${gold}}
      `}</style>

      <div style={{ maxWidth: 620, margin: '0 auto', textAlign: 'center', marginBottom: 40 }}>
        <Reveal>
          <span style={{ display: 'inline-block', fontSize: 12.5, fontWeight: 700, color: deep2, letterSpacing: 3, marginBottom: 20 }}>
            PARENT SEMINAR · 학부모 설명회
          </span>
        </Reveal>
        <Reveal delay={100}>
          <h2 style={{ fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 800, color: deep, lineHeight: 1.5, marginBottom: 20, wordBreak: 'keep-all' }}>
            {seminar.title}
          </h2>
        </Reveal>
        {seminar.description && (
          <Reveal delay={150}>
            <p style={{ fontSize: 14, lineHeight: 1.9, color: deep2, wordBreak: 'keep-all', marginBottom: 14 }}>{seminar.description}</p>
          </Reveal>
        )}
        <Reveal delay={200}>
          <p style={{ fontSize: 13, color: deep2, lineHeight: 1.9 }}>
            {fmtEventAt(seminar.event_at) && <>일시 {fmtEventAt(seminar.event_at)}<br /></>}
            {seminar.location && <>장소 {seminar.location}</>}
          </p>
        </Reveal>
      </div>

      <Reveal delay={250}>
        <div style={{ maxWidth: 520, margin: '0 auto', background: '#FBFAF6', border: `1px solid ${line}`, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: `1px solid ${line}` }}>
            <button className="lpv-sem-tab" data-active={mode === 'register'} onClick={() => setMode('register')}>설명회 신청</button>
            <button className="lpv-sem-tab" data-active={mode === 'check'} onClick={() => setMode('check')}>신청 확인 · 취소</button>
          </div>
          <div style={{ padding: '30px 32px' }}>
            {mode === 'register'
              ? <RegisterPanel seminarId={seminar.id} fi={fi} label={label} />
              : <CheckPanel seminarId={seminar.id} fi={fi} label={label} />}
          </div>
        </div>
      </Reveal>
    </section>
  )
}

function ConsentField({ agree, onChange, error }: { agree: boolean; onChange: (v: boolean) => void; error?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginBottom: 22 }}>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={agree} onChange={e => onChange(e.target.checked)}
          style={{ width: 16, height: 16, marginTop: 2, accentColor: deep, cursor: 'pointer', flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: deep2 }}>
          (필수) 개인정보 수집·이용에 동의합니다.{' '}
          <button type="button" onClick={e => { e.preventDefault(); setOpen(o => !o) }}
            style={{ background: 'none', border: 'none', padding: 0, color: gold, fontSize: 12, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}>
            {open ? '접기' : '자세히 보기'}
          </button>
        </span>
      </label>
      {open && (
        <div style={{ marginTop: 10, padding: '12px 14px', background: '#fff', border: `1px solid ${line}`, borderRadius: 8, fontSize: 11.5, color: deep2, lineHeight: 1.8 }}>
          <p><strong>수집 목적</strong> 학부모 설명회 참가 신청 접수 및 안내</p>
          <p><strong>수집 항목</strong> 신청자 이름, 전화번호, 자녀 이름(선택), 학년, 학교</p>
          <p><strong>보유·이용 기간</strong> 설명회 종료 후 즉시 파기됩니다.</p>
          <p style={{ marginBottom: 0 }}><strong>동의 거부 권리</strong> 동의를 거부하실 수 있으나, 거부 시 설명회 신청이 불가합니다.</p>
        </div>
      )}
      {error && <p role="alert" style={errStyle}>{error}</p>}
    </div>
  )
}
const errStyle: React.CSSProperties = { color: '#B3261E', fontSize: 11.5, marginTop: 5 }

function RegisterPanel({ seminarId, fi, label }: { seminarId: number; fi: React.CSSProperties; label: React.CSSProperties }) {
  const [form, setForm] = useState<RegisterForm>(BLANK)
  const [errors, setErrors] = useState<Partial<Record<keyof RegisterForm, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ status: string; waitlistPosition: number | null } | null>(null)
  const [submitError, setSubmitError] = useState('')

  function set<K extends keyof RegisterForm>(key: K, value: RegisterForm[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function validate(): boolean {
    const next: Partial<Record<keyof RegisterForm, string>> = {}
    if (!form.parentName.trim()) next.parentName = '이름을 입력해주세요.'
    if (!form.phone.trim()) next.phone = '전화번호를 입력해주세요.'
    else if (!PHONE_RE.test(form.phone.trim())) next.phone = '올바른 휴대폰 번호 형식이 아닙니다 (예: 010-1234-5678).'
    if (!form.childGrade) next.childGrade = '자녀 학년을 선택해주세요.'
    if (!form.childSchool.trim()) next.childSchool = '자녀 학교를 입력해주세요.'
    if (!form.agree) next.agree = '개인정보 수집·이용에 동의해주세요.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true); setSubmitError('')
    const { data, error } = await supabase.rpc('register_for_seminar', {
      p_seminar_id: seminarId,
      p_parent_name: form.parentName.trim(),
      p_phone: form.phone.trim(),
      p_child_name: form.childName.trim(),
      p_child_grade: form.childGrade,
      p_child_school: form.childSchool.trim(),
    })
    setSubmitting(false)
    if (error) { setSubmitError(error.message.includes('이미 신청') ? '이미 신청하신 전화번호입니다.' : '신청 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'); return }
    const row = Array.isArray(data) ? data[0] : data
    setResult({ status: row.status, waitlistPosition: row.waitlist_position })
  }

  if (result) {
    return (
      <div role="status" style={{ textAlign: 'center', padding: '20px 4px' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: deep, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', fontSize: 22 }} aria-hidden>✓</div>
        {result.status === 'confirmed' ? (
          <p style={{ fontSize: 15.5, fontWeight: 700, color: deep, marginBottom: 8 }}>신청이 확정되었습니다</p>
        ) : (
          <>
            <p style={{ fontSize: 15.5, fontWeight: 700, color: deep, marginBottom: 8 }}>정원이 초과되어 대기 {result.waitlistPosition}번으로 접수되었습니다</p>
            <p style={{ fontSize: 13, color: deep2, lineHeight: 1.85 }}>자리가 나면 순서대로 안내드립니다. &quot;신청 확인 · 취소&quot; 탭에서 전화번호로 대기 순번을 다시 확인할 수 있습니다.</p>
          </>
        )}
        <button onClick={() => { setResult(null); setForm(BLANK); setErrors({}) }}
          style={{ marginTop: 20, background: 'none', border: 'none', color: deep2, fontSize: 12.5, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}>
          새로 신청하기
        </button>
      </div>
    )
  }

  return (
    <form className="lpv-sem-form" onSubmit={handleSubmit} noValidate>
      <div style={{ marginBottom: 16 }}>
        <label style={label} htmlFor="sm-name">신청자 이름 *</label>
        <input id="sm-name" value={form.parentName} onChange={e => set('parentName', e.target.value)}
          aria-invalid={!!errors.parentName} style={fi} />
        {errors.parentName && <p role="alert" style={errStyle}>{errors.parentName}</p>}
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={label} htmlFor="sm-phone">전화번호 *</label>
        <input id="sm-phone" type="tel" inputMode="numeric" placeholder="010-1234-5678"
          value={form.phone} onChange={e => set('phone', e.target.value)} aria-invalid={!!errors.phone} style={fi} />
        {errors.phone && <p role="alert" style={errStyle}>{errors.phone}</p>}
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={label} htmlFor="sm-child-name">자녀 이름</label>
        <input id="sm-child-name" value={form.childName} onChange={e => set('childName', e.target.value)} style={fi} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={label} htmlFor="sm-grade">자녀 학년 *</label>
          <select id="sm-grade" value={form.childGrade} onChange={e => set('childGrade', e.target.value)}
            aria-invalid={!!errors.childGrade} style={{ ...fi, cursor: 'pointer' }}>
            <option value="">선택</option>
            {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          {errors.childGrade && <p role="alert" style={errStyle}>{errors.childGrade}</p>}
        </div>
        <div>
          <label style={label} htmlFor="sm-school">자녀 학교 *</label>
          <input id="sm-school" value={form.childSchool} onChange={e => set('childSchool', e.target.value)}
            aria-invalid={!!errors.childSchool} style={fi} />
          {errors.childSchool && <p role="alert" style={errStyle}>{errors.childSchool}</p>}
        </div>
      </div>

      <ConsentField agree={form.agree} onChange={v => set('agree', v)} error={errors.agree} />

      {submitError && <p role="alert" style={{ ...errStyle, textAlign: 'center', marginBottom: 12 }}>{submitError}</p>}
      <button type="submit" className="lpv-sem-submit" disabled={submitting}>
        {submitting ? '접수 중...' : '설명회 신청하기'}
      </button>
    </form>
  )
}

function CheckPanel({ seminarId, fi, label }: { seminarId: number; fi: React.CSSProperties; label: React.CSSProperties }) {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<LookupResult>(null)
  const [cancelled, setCancelled] = useState(false)
  const [error, setError] = useState('')

  async function lookup(e: React.FormEvent) {
    e.preventDefault()
    if (!phone.trim()) return setError('전화번호를 입력해주세요.')
    setError(''); setLoading(true); setCancelled(false)
    const { data, error: err } = await supabase.rpc('find_seminar_registration', { p_seminar_id: seminarId, p_phone: phone.trim() })
    setLoading(false)
    if (err) { setError('조회 중 오류가 발생했습니다.'); return }
    const row = Array.isArray(data) ? data[0] : data
    setResult(row ?? 'not-found')
  }

  async function cancel() {
    if (!confirm('설명회 신청을 취소하시겠습니까?')) return
    setLoading(true)
    const { error: err } = await supabase.rpc('cancel_seminar_registration', { p_seminar_id: seminarId, p_phone: phone.trim() })
    setLoading(false)
    if (err) { setError('취소 중 오류가 발생했습니다.'); return }
    setCancelled(true)
  }

  return (
    <div>
      <form onSubmit={lookup} noValidate style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <label style={label} htmlFor="sm-check-phone">전화번호</label>
          <input id="sm-check-phone" type="tel" inputMode="numeric" placeholder="010-1234-5678"
            value={phone} onChange={e => { setPhone(e.target.value); setResult(null); setCancelled(false) }} style={fi} />
        </div>
        <button type="submit" disabled={loading} style={{ alignSelf: 'flex-end', padding: '12px 18px', borderRadius: 9, border: 'none', background: deep, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: loading ? .7 : 1 }}>
          조회
        </button>
      </form>

      {error && <p role="alert" style={errStyle}>{error}</p>}

      {cancelled ? (
        <p style={{ fontSize: 13.5, color: deep, fontWeight: 700, textAlign: 'center', padding: '12px 0' }}>신청이 취소되었습니다.</p>
      ) : result === 'not-found' ? (
        <p style={{ fontSize: 13, color: deep2, textAlign: 'center', padding: '12px 0' }}>해당 전화번호로 접수된 신청 내역이 없습니다.</p>
      ) : result ? (
        <div style={{ background: '#fff', border: `1px solid ${line}`, borderRadius: 10, padding: '16px 18px' }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: deep, marginBottom: 6 }}>
            {result.status === 'confirmed' ? '신청 확정' : `대기 ${result.waitlist_position}번`}
          </p>
          <p style={{ fontSize: 12.5, color: deep2, marginBottom: 14 }}>
            {result.status === 'confirmed' ? '설명회 참석이 확정되었습니다.' : '자리가 나는 대로 순서대로 확정 안내드립니다.'}
          </p>
          <button onClick={cancel} disabled={loading} style={{ width: '100%', padding: '10px', borderRadius: 8, border: `1px solid ${line}`, background: 'transparent', color: '#B3261E', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            신청 취소하기
          </button>
        </div>
      ) : null}
    </div>
  )
}
