'use client'
import { useState } from 'react'
import Reveal from './Reveal'
import { supabase } from '@/lib/supabase'

const deep = '#154A32', deep2 = '#2A6349', gold = '#D87E13', line = 'rgba(21,74,50,.18)'

const GRADES = ['중1', '중2', '중3', '고1', '고2', '고3']
const PHONE_RE = /^01[016789]-?\d{3,4}-?\d{4}$/

type FormState = { studentName: string; grade: string; school: string; guardianPhone: string; message: string }
const BLANK: FormState = { studentName: '', grade: '', school: '', guardianPhone: '', message: '' }

export default function ConsultationSection() {
  const [form, setForm] = useState<FormState>(BLANK)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {}
    if (!form.studentName.trim()) next.studentName = '학생 이름을 입력해주세요.'
    if (!form.grade) next.grade = '학년을 선택해주세요.'
    if (!form.guardianPhone.trim()) next.guardianPhone = '보호자 연락처를 입력해주세요.'
    else if (!PHONE_RE.test(form.guardianPhone.trim())) next.guardianPhone = '올바른 휴대폰 번호 형식이 아닙니다 (예: 010-1234-5678).'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true); setSubmitError('')
    const { error } = await supabase.from('consultation_requests').insert({
      student_name: form.studentName.trim(),
      grade: form.grade,
      school: form.school.trim() || null,
      guardian_phone: form.guardianPhone.trim(),
      message: form.message.trim() || null,
    })
    setSubmitting(false)
    if (error) { setSubmitError('신청 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'); return }
    setSubmitted(true)
  }

  const fi: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 9, border: `1.5px solid ${line}`,
    background: '#fff', color: deep, fontSize: 15, fontFamily: "'Noto Sans KR',sans-serif", outline: 'none', boxSizing: 'border-box',
  }
  const label: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 600, color: deep2, marginBottom: 7 }
  const errStyle: React.CSSProperties = { color: '#B3261E', fontSize: 11.5, marginTop: 5 }

  return (
    <section id="lpv-consult" style={{ background: '#FBFAF6', padding: '120px 20px' }}>
      <style>{`
        .lpv-consult-form input:focus,.lpv-consult-form select:focus,.lpv-consult-form textarea:focus{border-color:${gold} !important}
        .lpv-consult-form [aria-invalid="true"]{border-color:#B3261E !important}
        .lpv-consult-submit{width:100%;padding:15px;border-radius:9px;border:none;background:${deep};color:#fff;
          font-size:15px;font-weight:700;font-family:inherit;cursor:pointer;transition:background .15s}
        .lpv-consult-submit:hover:not(:disabled){background:#0F3A26}
        .lpv-consult-submit:disabled{opacity:.6;cursor:default}
        .lpv-consult-submit:focus-visible,.lpv-consult-form input:focus-visible,.lpv-consult-form select:focus-visible{outline:2px solid ${gold};outline-offset:2px}
      `}</style>

      <div style={{ maxWidth: 620, margin: '0 auto', textAlign: 'center', marginBottom: 56 }}>
        <Reveal>
          <span style={{ display: 'inline-block', fontSize: 12.5, fontWeight: 700, color: deep2, letterSpacing: 3, marginBottom: 20 }}>
            CONSULTATION · 상담 신청
          </span>
        </Reveal>
        <Reveal delay={100}>
          <h2 style={{ fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 800, color: deep, lineHeight: 1.5, marginBottom: 20, wordBreak: 'keep-all' }}>
            학생에게 맞는 공부 방법을<br />함께 찾아보겠습니다.
          </h2>
        </Reveal>
        <Reveal delay={200}>
          <p style={{ fontSize: 14, lineHeight: 1.9, color: deep2, wordBreak: 'keep-all' }}>
            현재 학습 상황과 고민하고 있는 부분을 알려주세요.<br />
            상담을 통해 학생의 현재 학습 상태와 필요한 학습 방향을 함께 확인합니다.
          </p>
        </Reveal>
      </div>

      <Reveal delay={250}>
        <div style={{ maxWidth: 520, margin: '0 auto', background: '#fff', border: `1px solid ${line}`, borderRadius: 16, padding: '36px 32px' }}>
          {submitted ? (
            <div role="status" style={{ textAlign: 'center', padding: '20px 4px' }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%', background: deep, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', fontSize: 22,
              }} aria-hidden>✓</div>
              <p style={{ fontSize: 15.5, fontWeight: 700, color: deep, marginBottom: 8 }}>상담 신청이 접수되었습니다</p>
              <p style={{ fontSize: 13, color: deep2, lineHeight: 1.85, wordBreak: 'keep-all' }}>
                빠른 시일 내에 입력해주신 연락처로 안내드리겠습니다.
              </p>
              <button onClick={() => { setSubmitted(false); setForm(BLANK); setErrors({}) }}
                style={{ marginTop: 20, background: 'none', border: 'none', color: deep2, fontSize: 12.5, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}>
                새로 신청하기
              </button>
            </div>
          ) : (
            <form className="lpv-consult-form" onSubmit={handleSubmit} noValidate>
              <div style={{ marginBottom: 16 }}>
                <label style={label} htmlFor="cs-name">학생 이름 *</label>
                <input id="cs-name" value={form.studentName} onChange={e => set('studentName', e.target.value)}
                  aria-invalid={!!errors.studentName} aria-describedby={errors.studentName ? 'cs-name-err' : undefined} style={fi} />
                {errors.studentName && <p id="cs-name-err" role="alert" style={errStyle}>{errors.studentName}</p>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={label} htmlFor="cs-grade">학년 *</label>
                  <select id="cs-grade" value={form.grade} onChange={e => set('grade', e.target.value)}
                    aria-invalid={!!errors.grade} style={{ ...fi, cursor: 'pointer' }}>
                    <option value="">선택</option>
                    {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  {errors.grade && <p role="alert" style={errStyle}>{errors.grade}</p>}
                </div>
                <div>
                  <label style={label} htmlFor="cs-school">학교</label>
                  <input id="cs-school" value={form.school} onChange={e => set('school', e.target.value)} style={fi} />
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={label} htmlFor="cs-phone">보호자 연락처 *</label>
                <input id="cs-phone" type="tel" inputMode="numeric" placeholder="010-1234-5678"
                  value={form.guardianPhone} onChange={e => set('guardianPhone', e.target.value)}
                  aria-invalid={!!errors.guardianPhone} aria-describedby={errors.guardianPhone ? 'cs-phone-err' : undefined} style={fi} />
                {errors.guardianPhone && <p id="cs-phone-err" role="alert" style={errStyle}>{errors.guardianPhone}</p>}
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={label} htmlFor="cs-message">상담 희망 내용</label>
                <textarea id="cs-message" rows={4} value={form.message} onChange={e => set('message', e.target.value)}
                  placeholder="현재 고민하고 있는 학습 내용이나 상담받고 싶은 내용을 간단히 적어주세요."
                  style={{ ...fi, resize: 'vertical', fontFamily: 'inherit' }} />
              </div>

              {submitError && <p role="alert" style={{ ...errStyle, textAlign: 'center', marginBottom: 12 }}>{submitError}</p>}
              <button type="submit" className="lpv-consult-submit" disabled={submitting}>
                {submitting ? '접수 중...' : '상담 신청하기'}
              </button>
            </form>
          )}
        </div>
      </Reveal>
    </section>
  )
}
