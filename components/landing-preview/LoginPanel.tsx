'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { supabase, TEACHER_AUTO_LOGIN_KEY } from '@/lib/supabase'
import { teacherLogin, parentLookup, parentLoginWithPin, studentLookup, studentLoginWithPin } from '@/lib/auth'
import { useAuth } from '@/context/AuthContext'

type AccountType = 'parent' | 'student' | 'teacher'
type Step = 'select' | 'form' | 'pin' | 'pin-setup'

const AUTO_KEY = 'parent_auto_login'
const STUDENT_AUTO_KEY = 'student_auto_login'
const deep = '#154A32', deep2 = '#2A6349', gold = '#D87E13'

const TYPES: { key: AccountType; label: string; desc: string }[] = [
  { key: 'parent', label: '학부모님', desc: '자녀의 수업기록을 확인해요' },
  { key: 'student', label: '학생', desc: '내 수업기록과 시험을 확인해요' },
  { key: 'teacher', label: '선생님', desc: '수업과 학생을 관리해요' },
]

// PIN 입력용 4자리 점 표시 (기존 LoginModal과 동일한 방식)
function PinDots({ value, onChange, autoFocus = false }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <div style={{ position: 'relative', margin: '18px 0 6px' }}
      onClick={e => (e.currentTarget.querySelector('input') as HTMLInputElement)?.focus()}>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 10 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{
            width: 15, height: 15, borderRadius: '50%',
            background: i < value.length ? gold : 'rgba(21,74,50,.15)',
            transition: 'background .12s',
          }} />
        ))}
      </div>
      <input
        type="tel" inputMode="numeric" pattern="[0-9]*" value={value} autoFocus={autoFocus}
        aria-label="PIN 4자리"
        onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
        style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          opacity: 0, fontSize: 16, border: 'none', outline: 'none',
          caretColor: 'transparent', background: 'transparent', color: 'transparent',
        }}
      />
    </div>
  )
}

export default function LoginPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { loginAsTeacher, loginAsParent, loginAsStudent } = useAuth()

  const [accountType, setAccountType] = useState<AccountType | null>(null)
  const [step, setStep] = useState<Step>('select')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [newPin2, setNewPin2] = useState('')
  const [autoLogin, setAutoLogin] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [teacherAutoLogin, setTeacherAutoLogin] = useState(false)
  const [showSignup, setShowSignup] = useState(false)
  const [sgName, setSgName] = useState(''); const [sgEmail, setSgEmail] = useState('')
  const [sgPhone, setSgPhone] = useState(''); const [sgPw, setSgPw] = useState(''); const [sgPw2, setSgPw2] = useState('')
  const [parentData, setParentData] = useState<{ studentId?: number; parentId?: number; phone: string; name?: string; children?: unknown } | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  // ESC로 닫기 + 바깥 스크롤 잠금
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])

  function selectType(t: AccountType) {
    setAccountType(t); setStep('form'); setError('')
    setPhone(''); setPin(''); setEmail(''); setPassword('')
  }
  function backToSelect() {
    setAccountType(null); setStep('select'); setError(''); setShowSignup(false)
  }

  async function handlePhoneSubmit() {
    setError(''); setLoading(true)
    try {
      if (!phone) throw new Error('전화번호를 입력하세요.')
      const data = accountType === 'student' ? await studentLookup(phone) : await parentLookup(phone)
      setParentData(data)
      setPin('')
      setStep('pin')
    } catch (e) { setError(e instanceof Error ? e.message : '확인 중 오류가 발생했습니다.') }
    finally { setLoading(false) }
  }

  async function handlePinSubmit(submittedPin: string) {
    setError(''); setLoading(true)
    try {
      const result = accountType === 'student'
        ? await studentLoginWithPin(phone, submittedPin)
        : await parentLoginWithPin(phone, submittedPin)
      if (result.isDefaultPin) {
        setParentData(result); setNewPin(''); setNewPin2(''); setStep('pin-setup'); setLoading(false)
        return
      }
      if (accountType === 'student') {
        const r = result as Awaited<ReturnType<typeof studentLoginWithPin>>
        const session = { studentId: r.studentId, phone: r.phone, name: r.name }
        if (autoLogin) localStorage.setItem(STUDENT_AUTO_KEY, JSON.stringify({ session }))
        sessionStorage.setItem('student_session', JSON.stringify(session))
        loginAsStudent(session)
      } else {
        const r = result as Awaited<ReturnType<typeof parentLoginWithPin>>
        const session = { parentId: r.parentId, phone: r.phone, children: r.children }
        if (autoLogin) localStorage.setItem(AUTO_KEY, JSON.stringify({ session }))
        sessionStorage.setItem('parent_session', JSON.stringify(session))
        loginAsParent(session)
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'PIN 확인 실패'); setPin(''); setLoading(false) }
  }

  async function handlePinSetup(confirmPin: string) {
    setError('')
    if (newPin !== confirmPin) { setError('PIN이 일치하지 않습니다. 다시 입력해주세요.'); setNewPin(''); setNewPin2(''); return }
    setLoading(true)
    try {
      const table = accountType === 'student' ? 'students' : 'parents'
      const idKey = accountType === 'student' ? 'studentId' : 'parentId'
      const id = parentData ? (parentData as Record<string, unknown>)[idKey] : undefined
      const { error: updateErr } = await supabase.from(table).update({ pin: newPin }).eq('id', id)
      if (updateErr) throw new Error('PIN 저장 실패: ' + updateErr.message)
      if (accountType === 'student') {
        const session = { studentId: parentData?.studentId, phone: parentData?.phone, name: parentData?.name }
        if (autoLogin) localStorage.setItem(STUDENT_AUTO_KEY, JSON.stringify({ session }))
        sessionStorage.setItem('student_session', JSON.stringify(session))
        loginAsStudent(session as { studentId: number; phone: string; name: string })
        return
      }
      const session = { parentId: parentData?.parentId, phone: parentData?.phone, children: parentData?.children }
      if (autoLogin) localStorage.setItem(AUTO_KEY, JSON.stringify({ session }))
      sessionStorage.setItem('parent_session', JSON.stringify(session))
      loginAsParent(session as { parentId: number; phone: string; children: { id: number; name: string; birth_year: number; school: string }[] })
    } catch (e) { setError(e instanceof Error ? e.message : 'PIN 설정 실패'); setLoading(false) }
  }

  async function handleTeacherLogin() {
    setError(''); setLoading(true)
    try {
      if (!email || !password) throw new Error('이메일과 비밀번호를 입력하세요.')
      localStorage.setItem(TEACHER_AUTO_LOGIN_KEY, teacherAutoLogin ? '1' : '0')
      const teacher = await teacherLogin(email, password)
      loginAsTeacher(teacher)
    } catch (e) { setError(e instanceof Error ? e.message : '로그인 실패'); setLoading(false) }
  }

  async function handleSignup() {
    setError(''); setSuccess('')
    if (!sgName.trim()) return setError('이름을 입력하세요.')
    if (!sgEmail.trim()) return setError('이메일을 입력하세요.')
    if (!sgPw) return setError('비밀번호를 입력하세요.')
    if (sgPw !== sgPw2) return setError('비밀번호가 일치하지 않습니다.')
    if (sgPw.length < 6) return setError('비밀번호는 6자 이상이어야 합니다.')
    setLoading(true)
    try {
      const res = await fetch('/api/teacher-signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: sgName.trim(), email: sgEmail.trim(), phone: sgPhone, password: sgPw }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || '가입 신청에 실패했습니다.')
      setSuccess('가입 신청이 완료됐습니다. 관리자 승인 후 로그인할 수 있습니다.')
      setSgName(''); setSgEmail(''); setSgPhone(''); setSgPw(''); setSgPw2('')
    } catch (e) { setError(e instanceof Error ? e.message : '가입 신청 실패') }
    finally { setLoading(false) }
  }

  const fi: React.CSSProperties = {
    width: '100%', padding: '13px 14px', borderRadius: 9, border: `1.5px solid rgba(21,74,50,.18)`,
    background: '#FBFAF6', color: deep, fontSize: 16, fontFamily: "'Noto Sans KR',sans-serif", outline: 'none', boxSizing: 'border-box',
  }
  const label: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 600, color: deep2, marginBottom: 7 }

  return (
    <>
      <style>{`
        .lpv-login-overlay{position:fixed;inset:0;background:rgba(21,74,50,.18);z-index:900;opacity:0;pointer-events:none;transition:opacity .45s ease}
        .lpv-login-overlay[data-open="true"]{opacity:1;pointer-events:auto}
        .lpv-login-panel{position:fixed;top:0;right:0;bottom:0;width:420px;max-width:92vw;background:#FBFAF6;z-index:901;
          box-shadow:-16px 0 50px rgba(21,74,50,.14);transform:translateX(100%);
          transition:transform .55s cubic-bezier(.16,1,.3,1);display:flex;flex-direction:column;overflow-y:auto}
        .lpv-login-panel[data-open="true"]{transform:translateX(0)}
        .lpv-login-step{animation:lpv-step-in .4s cubic-bezier(.16,1,.3,1)}
        @keyframes lpv-step-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .lpv-type-btn{width:100%;text-align:left;padding:16px 18px;border-radius:12px;border:1.5px solid rgba(21,74,50,.14);
          background:#fff;cursor:pointer;font-family:inherit;transition:border-color .15s,background .15s;margin-bottom:10px}
        .lpv-type-btn:hover,.lpv-type-btn:focus-visible{border-color:${gold};background:#FFF8EF}
        .lpv-type-btn:focus-visible{outline:2px solid ${gold};outline-offset:2px}
        .lpv-login-panel input:focus{border-color:${gold} !important}
        .lpv-login-panel button:focus-visible{outline:2px solid ${gold};outline-offset:2px}
        .lpv-primary-btn{width:100%;padding:14px;border-radius:9px;border:none;background:${deep};color:#fff;
          font-size:15px;font-weight:700;font-family:inherit;cursor:pointer;transition:background .15s}
        .lpv-primary-btn:hover:not(:disabled){background:#0F3A26}
        .lpv-primary-btn:disabled{opacity:.55;cursor:default}
        .lpv-close-btn{width:34px;height:34px;border-radius:50%;border:none;background:rgba(21,74,50,.06);color:${deep2};
          font-size:17px;cursor:pointer;display:flex;align-items:center;justify-content:center}
        .lpv-close-btn:focus-visible{outline:2px solid ${gold};outline-offset:2px}
        @media (prefers-reduced-motion: reduce){
          .lpv-login-overlay,.lpv-login-panel{transition:none}
          .lpv-login-step{animation:none}
        }
        @media (max-width:640px){
          .lpv-login-panel{width:100%;max-width:100%}
        }
      `}</style>

      <div className="lpv-login-overlay" data-open={open} onClick={onClose} aria-hidden="true" />

      <aside className="lpv-login-panel" data-open={open} role="dialog" aria-modal="true" aria-label="로그인"
        aria-hidden={!open}>
        <div style={{ padding: '20px 26px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button className="lpv-close-btn" onClick={onClose} aria-label="뒤로가기">←</button>
          <Image src="/logo2.png" alt="티처스 수학학원" width={149} height={26} style={{ height: 22, width: 'auto', objectFit: 'contain' }} />
        </div>

        <div style={{ padding: '18px 32px 40px', flex: 1 }}>
          {step === 'select' && (
            <div className="lpv-login-step">
              <p style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 2, color: gold, marginBottom: 10 }}>WELCOME</p>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: deep, marginBottom: 8, lineHeight: 1.4 }}>안녕하세요. 티처스 수학학원 입니다.</h2>
              <p style={{ fontSize: 13.5, color: deep2, marginBottom: 26, lineHeight: 1.7 }}>이용하실 계정 유형을 선택해주세요.</p>

              {TYPES.map(t => (
                <button key={t.key} className="lpv-type-btn" onClick={() => selectType(t.key)}>
                  <span style={{ fontSize: 15.5, fontWeight: 700, color: deep, display: 'block' }}>{t.label}</span>
                  <span style={{ fontSize: 12.5, color: deep2, display: 'block', marginTop: 3 }}>{t.desc}</span>
                </button>
              ))}
            </div>
          )}

          {step !== 'select' && (
            <div key={`${accountType}-${step}-${showSignup}`} className="lpv-login-step">
              <button onClick={showSignup ? () => setShowSignup(false) : (step === 'form' ? backToSelect : () => { setStep('form'); setPin(''); setError('') })}
                style={{ background: 'none', border: 'none', color: deep2, fontSize: 12.5, cursor: 'pointer', marginBottom: 18, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}>
                ← 이전으로
              </button>

              {!showSignup && step === 'form' && accountType !== 'teacher' && (
                <>
                  <h2 style={{ fontSize: 19, fontWeight: 800, color: deep, marginBottom: 22 }}>
                    {accountType === 'student' ? '학생 로그인' : '학부모님 로그인'}
                  </h2>
                  <label style={label} htmlFor="lpv-phone">전화번호</label>
                  <input id="lpv-phone" type="tel" inputMode="numeric" value={phone} placeholder="01012345678"
                    onChange={e => setPhone(e.target.value)} onKeyDown={e => e.key === 'Enter' && handlePhoneSubmit()} style={fi} />
                  <p style={{ fontSize: 11.5, color: 'rgba(21,74,50,.5)', marginTop: 7 }}>하이픈(-) 없이 숫자만 입력해주세요.</p>
                  {error && <p role="alert" style={{ color: '#B3261E', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
                  <button className="lpv-primary-btn" style={{ marginTop: 18 }} disabled={loading} onClick={handlePhoneSubmit}>
                    {loading ? '확인 중...' : accountType === 'student' ? '학생으로 로그인' : '학부모님으로 로그인'}
                  </button>
                  <p style={{ fontSize: 11.5, color: 'rgba(21,74,50,.5)', marginTop: 12, lineHeight: 1.7 }}>
                    학부모·학생 계정은 학원에서 등록해 드립니다.<br />로그인이 되지 않으면 학원으로 문의해주세요.
                  </p>
                </>
              )}

              {!showSignup && step === 'pin' && (
                <>
                  <h2 style={{ fontSize: 19, fontWeight: 800, color: deep, marginBottom: 4 }}>PIN 입력</h2>
                  <p style={{ fontSize: 13, color: deep2, marginBottom: 6 }}>{phone}</p>
                  <PinDots value={pin} onChange={v => { setPin(v); if (v.length === 4) setTimeout(() => handlePinSubmit(v), 80) }} autoFocus />
                  <p style={{ fontSize: 11.5, color: 'rgba(21,74,50,.45)', textAlign: 'center' }}>위 영역을 탭하면 키패드가 열립니다</p>
                  {error && <p role="alert" style={{ color: '#B3261E', fontSize: 12.5, textAlign: 'center', marginTop: 8 }}>{error}</p>}
                  <AutoLoginRow checked={autoLogin} onChange={setAutoLogin} />
                </>
              )}

              {!showSignup && step === 'pin-setup' && (
                <>
                  <h2 style={{ fontSize: 19, fontWeight: 800, color: deep, marginBottom: 4 }}>PIN 설정</h2>
                  <p style={{ fontSize: 13, color: deep2, marginBottom: 10 }}>처음 로그인하셨습니다. 새 PIN을 설정해주세요.</p>
                  <p style={{ fontSize: 12, color: deep2, textAlign: 'center' }}>{newPin.length < 4 ? '새 PIN 입력 (4자리)' : 'PIN 확인 입력'}</p>
                  <PinDots value={newPin.length < 4 ? newPin : newPin2} autoFocus
                    onChange={v => { if (newPin.length < 4) setNewPin(v); else { setNewPin2(v); if (v.length === 4) setTimeout(() => handlePinSetup(v), 80) } }} />
                  {error && <p role="alert" style={{ color: '#B3261E', fontSize: 12.5, textAlign: 'center', marginTop: 8 }}>{error}</p>}
                  <AutoLoginRow checked={autoLogin} onChange={setAutoLogin} />
                </>
              )}

              {!showSignup && step === 'form' && accountType === 'teacher' && (
                <>
                  <h2 style={{ fontSize: 19, fontWeight: 800, color: deep, marginBottom: 22 }}>선생님 로그인</h2>
                  <div style={{ marginBottom: 14 }}>
                    <label style={label} htmlFor="lpv-email">이메일</label>
                    <input id="lpv-email" type="email" value={email} onChange={e => setEmail(e.target.value)} style={fi} />
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <label style={label} htmlFor="lpv-pw">비밀번호</label>
                    <input id="lpv-pw" type="password" value={password} onChange={e => setPassword(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleTeacherLogin()} style={fi} />
                  </div>
                  <AutoLoginRow checked={teacherAutoLogin} onChange={setTeacherAutoLogin} />
                  {error && <p role="alert" style={{ color: '#B3261E', fontSize: 12.5, marginTop: 4 }}>{error}</p>}
                  <button className="lpv-primary-btn" style={{ marginTop: 14 }} disabled={loading} onClick={handleTeacherLogin}>
                    {loading ? '확인 중...' : '선생님으로 로그인'}
                  </button>
                  <div style={{ textAlign: 'center', marginTop: 16 }}>
                    <p style={{ fontSize: 12, color: deep2, marginBottom: 4 }}>처음이신가요?</p>
                    <button onClick={() => { setShowSignup(true); setError('') }}
                      style={{ background: 'none', border: 'none', color: gold, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
                      계정 만들기
                    </button>
                  </div>
                </>
              )}

              {showSignup && (
                <>
                  <h2 style={{ fontSize: 19, fontWeight: 800, color: deep, marginBottom: 20 }}>선생님 계정 만들기</h2>
                  <div style={{ marginBottom: 12 }}>
                    <label style={label} htmlFor="sg-name">이름 *</label>
                    <input id="sg-name" value={sgName} onChange={e => setSgName(e.target.value)} style={fi} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={label} htmlFor="sg-email">이메일 *</label>
                    <input id="sg-email" type="email" value={sgEmail} onChange={e => setSgEmail(e.target.value)} style={fi} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={label} htmlFor="sg-phone">연락처</label>
                    <input id="sg-phone" type="tel" value={sgPhone} onChange={e => setSgPhone(e.target.value.replace(/-/g, ''))} style={fi} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={label} htmlFor="sg-pw">비밀번호 *</label>
                    <input id="sg-pw" type="password" value={sgPw} onChange={e => setSgPw(e.target.value)} style={fi} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={label} htmlFor="sg-pw2">비밀번호 확인 *</label>
                    <input id="sg-pw2" type="password" value={sgPw2} onChange={e => setSgPw2(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSignup()} style={fi} />
                  </div>
                  <p style={{ fontSize: 11.5, color: 'rgba(21,74,50,.5)', marginBottom: 14 }}>가입 신청 후 관리자 승인을 받아야 로그인할 수 있습니다.</p>
                  {error && <p role="alert" style={{ color: '#B3261E', fontSize: 12.5, marginBottom: 10 }}>{error}</p>}
                  {success && <p role="status" style={{ color: '#1A7F4E', fontSize: 12.5, marginBottom: 10 }}>{success}</p>}
                  <button className="lpv-primary-btn" disabled={loading} onClick={handleSignup}>{loading ? '처리 중...' : '가입 신청'}</button>
                </>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  )
}

function AutoLoginRow({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="lpv-auto-row" style={{
      position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 16,
      padding: '11px 14px', borderRadius: 10, background: checked ? '#FFF8EF' : '#F4F1EA',
      border: `1.5px solid ${checked ? gold : 'rgba(21,74,50,.14)'}`, cursor: 'pointer', transition: 'background .15s,border-color .15s',
    }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: checked ? deep : deep2 }}>다음에도 자동으로 로그인</span>
      <span
        role="switch" aria-checked={checked}
        style={{
          width: 38, height: 22, borderRadius: 999, background: checked ? gold : 'rgba(21,74,50,.22)',
          position: 'relative', flexShrink: 0, transition: 'background .18s',
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: checked ? 18 : 2, width: 18, height: 18, borderRadius: '50%',
          background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)', transition: 'left .18s',
        }} />
      </span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
    </label>
  )
}
