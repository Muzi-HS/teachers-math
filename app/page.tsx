'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { teacherLogin, parentLookup, parentLoginWithPin } from '@/lib/auth'
import { useAuth } from '@/context/AuthContext'

type Tab      = 'parent' | 'teacher'
type PStep    = 'phone' | 'pin' | 'pin-setup'  // 학부모 로그인 단계

const AUTO_KEY  = 'parent_auto_login'   // localStorage key
const AUTO_DAYS = 30

export default function LoginPage() {
  const router = useRouter()
  const { role, loading: authLoading, loginAsTeacher, loginAsParent } = useAuth()

  useEffect(() => {
    if (authLoading) return
    if (role === 'admin' || role === 'teacher') router.replace('/dashboard')
    else if (role === 'parent') router.replace('/parent/notices')
  }, [role, authLoading])

  // 자동로그인 복원
  useEffect(() => {
    if (authLoading || role) return
    try {
      const raw = localStorage.getItem(AUTO_KEY)
      if (!raw) return
      const saved = JSON.parse(raw)
      if (Date.now() > saved.expiry) { localStorage.removeItem(AUTO_KEY); return }
      loginAsParent(saved.session)
    } catch {}
  }, [authLoading])

  const [tab,       setTab]       = useState<Tab>('parent')
  const [showSignup,setShowSignup]= useState(false)
  const [pStep,     setPStep]     = useState<PStep>('phone')
  const [phone,     setPhone]     = useState('')
  const [pin,       setPin]       = useState('')
  const [newPin,    setNewPin]    = useState('')
  const [newPin2,   setNewPin2]   = useState('')
  const [autoLogin, setAutoLogin] = useState(false)
  const [parentData,setParentData]= useState<any>(null)
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [success,   setSuccess]   = useState('')
  const [sgName,    setSgName]    = useState('')
  const [sgEmail,   setSgEmail]   = useState('')
  const [sgPhone,   setSgPhone]   = useState('')
  const [sgPw,      setSgPw]      = useState('')
  const [sgPw2,     setSgPw2]     = useState('')

  const iStyle: React.CSSProperties = {
    width:'100%', padding:'12px 16px', borderRadius:8,
    border:'1.5px solid rgba(255,255,255,.12)',
    background:'rgba(255,255,255,.06)', color:'#fff',
    fontSize:16, fontFamily:"'Noto Sans KR',sans-serif", outline:'none',
    boxSizing:'border-box',
  }

  // ── 선생님 로그인 ──
  async function handleTeacherLogin() {
    setError(''); setLoading(true)
    try {
      if (!email || !password) throw new Error('이메일과 비밀번호를 입력하세요.')
      const teacher = await teacherLogin(email, password)
      loginAsTeacher(teacher)
    } catch(e:any) { setError(e.message); setLoading(false) }
  }

  // ── 학부모 1단계: 전화번호 확인 ──
  async function handlePhoneCheck() {
    setError(''); setLoading(true)
    try {
      if (!phone) throw new Error('전화번호를 입력하세요.')
      const data = await parentLookup(phone)
      setParentData(data)
      setPin('')
      setPStep('pin')
    } catch(e:any) { setError(e.message) }
    finally { setLoading(false) }
  }

  // ── PIN 키패드 입력 ──
  // ── PIN 입력 핸들러 (숨겨진 input → 네이티브 키패드) ──
  function handlePinInput(val: string, target: 'pin' | 'new' | 'confirm') {
    const digits = val.replace(/\D/g, '').slice(0, 4)
    if (target === 'pin') {
      setPin(digits)
      if (digits.length === 4) setTimeout(() => handlePinSubmit(digits), 80)
    } else if (target === 'new') {
      setNewPin(digits)
    } else {
      setNewPin2(digits)
      if (digits.length === 4) setTimeout(() => handlePinSetup(digits), 80)
    }
  }

  // PIN 점 표시 + 숨겨진 input
  function PinInput({ value, onChange, autoFocus=false }: { value:string; onChange:(v:string)=>void; autoFocus?:boolean }) {
    return (
      <div style={{ position:'relative', margin:'20px 0 8px' }}
        onClick={e => (e.currentTarget.querySelector('input') as HTMLInputElement)?.focus()}
      >
        {/* 점 표시 */}
        <div style={{ display:'flex', gap:16, justifyContent:'center', marginBottom:12 }}>
          {Array.from({length:4}).map((_,i) => (
            <div key={i} style={{
              width:16, height:16, borderRadius:'50%',
              background: i < value.length ? '#D87E13' : 'rgba(255,255,255,.2)',
              transition:'background .12s',
            }}/>
          ))}
        </div>
        {/* 완전히 숨겨진 input — 커서 안 보이게, 자동 키패드 */}
        <input
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={e => onChange(e.target.value.replace(/\D/g,'').slice(0,4))}
          autoFocus={autoFocus}
          readOnly={false}
          style={{
            position:'absolute', top:0, left:0, width:'100%', height:'100%',
            opacity:0, fontSize:16, border:'none', outline:'none',
            caretColor:'transparent', background:'transparent',
            color:'transparent', pointerEvents:'auto',
          }}
        />
      </div>
    )
  }

  // ── 학부모 2단계: PIN 검증 ──
  async function handlePinSubmit(submittedPin: string) {
    setError(''); setLoading(true)
    try {
      const result = await parentLoginWithPin(phone, submittedPin)
      if (result.isDefaultPin) {
        setParentData(result)
        setNewPin(''); setNewPin2('')
        setPStep('pin-setup')
        setLoading(false)
        return
      }
      const session = { parentId: result.parentId, phone: result.phone, children: result.children }
      if (autoLogin) {
        localStorage.setItem(AUTO_KEY, JSON.stringify({
          session, expiry: Date.now() + AUTO_DAYS * 86400000
        }))
      }
      sessionStorage.setItem('parent_session', JSON.stringify(session))
      loginAsParent(session)
    } catch(e:any) {
      setError(e.message)
      setPin('')
      setLoading(false)
    }
  }

  // ── PIN 설정 ──
  async function handlePinSetup(confirmPin: string) {
    setError('')
    if (newPin !== confirmPin) {
      setError('PIN이 일치하지 않습니다. 다시 입력해주세요.')
      setNewPin(''); setNewPin2('')
      return
    }
    setLoading(true)
    try {
      // 직접 supabase 호출 (anon UPDATE 정책 사용)
      const { error: updateErr } = await supabase
        .from('parents')
        .update({ pin: newPin })
        .eq('id', parentData.parentId)
      if (updateErr) throw new Error('PIN 저장 실패: ' + updateErr.message)

      // 업데이트 성공 후 바로 세션 생성
      const session = { parentId: parentData.parentId, phone: parentData.phone, children: parentData.children }
      if (autoLogin) {
        localStorage.setItem(AUTO_KEY, JSON.stringify({
          session, expiry: Date.now() + AUTO_DAYS * 86400000
        }))
      }
      sessionStorage.setItem('parent_session', JSON.stringify(session))
      loginAsParent(session)
    } catch(e:any) { setError(e.message); setLoading(false) }
  }

  async function handleSignup() {
    setError(''); setSuccess('')
    if (!sgName.trim())  return setError('이름을 입력하세요.')
    if (!sgEmail.trim()) return setError('이메일을 입력하세요.')
    if (!sgPw)           return setError('비밀번호를 입력하세요.')
    if (sgPw !== sgPw2)  return setError('비밀번호가 일치하지 않습니다.')
    if (sgPw.length < 6) return setError('비밀번호는 6자 이상이어야 합니다.')
    setLoading(true)
    try {
      const { data, error: authErr } = await supabase.auth.signUp({ email: sgEmail.trim(), password: sgPw })
      if (authErr) throw new Error(authErr.message)
      if (!data.user) throw new Error('회원가입에 실패했습니다.')
      const { error: tErr } = await supabase.from('teachers').insert({
        user_id: data.user.id, name: sgName.trim(), email: sgEmail.trim(),
        phone: sgPhone.replace(/-/g,''), role: 'teacher', approved: false,
      })
      if (tErr) throw new Error('선생님 정보 등록 실패: ' + tErr.message)
      setSuccess('가입 신청이 완료됐습니다. 관리자 승인 후 로그인할 수 있습니다.')
      setSgName(''); setSgEmail(''); setSgPhone(''); setSgPw(''); setSgPw2('')
    } catch(e:any) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Noto Sans KR', sans-serif; }
        input::placeholder { color: rgba(255,255,255,.25); }
        input:focus { border-color: #D87E13 !important; }
      `}</style>

      <div style={{ minHeight:'100vh', background:'#071A3E', display:'flex', alignItems:'center', justifyContent:'center', padding:'0 16px' }}>
        <div style={{ width:'100%', maxWidth:380, padding:'48px 20px' }}>

          {/* 로고 */}
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:32 }}>
            <Image src="/logo.png" alt="로고" width={48} height={48} style={{ objectFit:'contain', flexShrink:0 }}/>
            <div>
              <h1 style={{ fontFamily:"'Noto Sans KR',sans-serif", fontSize:17, fontWeight:700, color:'#fff', letterSpacing:.5 }}>TEACHERS MATH</h1>
              <p style={{ fontSize:11, color:'rgba(255,255,255,.45)', letterSpacing:2, marginTop:2 }}>티처스 수학학원</p>
            </div>
          </div>

          {/* ── 학부모 PIN 단계 ── */}
          {!showSignup && tab === 'parent' && pStep === 'pin' && (
            <>
              <button onClick={() => { setPStep('phone'); setPin(''); setError('') }}
                style={{ background:'none', border:'none', color:'rgba(255,255,255,.4)', fontSize:12, cursor:'pointer', marginBottom:16, fontFamily:'inherit', display:'flex', alignItems:'center', gap:4 }}>
                ← 전화번호 다시 입력
              </button>
              <p style={{ fontSize:18, fontWeight:700, color:'#fff', marginBottom:4 }}>PIN 입력</p>
              <p style={{ fontSize:13, color:'rgba(255,255,255,.4)', marginBottom:16 }}>{phone}</p>
              <PinInput
                value={pin}
                onChange={v => { setPin(v); if(v.length===4) setTimeout(()=>handlePinSubmit(v),80) }}
                autoFocus
              />
              <p style={{ fontSize:12, color:'rgba(255,255,255,.3)', textAlign:'center', marginBottom:4 }}>
                위 영역을 탭하면 키패드가 열립니다
              </p>
              {error && <p style={{ fontSize:12, color:'#F48771', textAlign:'center', margin:'6px 0' }}>{error}</p>}
              <label style={{ display:'flex', alignItems:'center', gap:8, marginTop:20, cursor:'pointer', justifyContent:'center' }}>
                <input type="checkbox" checked={autoLogin} onChange={e => setAutoLogin(e.target.checked)} style={{ accentColor:'#D87E13' }}/>
                <span style={{ fontSize:12, color:'rgba(255,255,255,.45)' }}>자동 로그인 (30일)</span>
              </label>
            </>
          )}

          {/* ── PIN 설정 단계 ── */}
          {!showSignup && tab === 'parent' && pStep === 'pin-setup' && (
            <>
              <p style={{ fontSize:18, fontWeight:700, color:'#fff', marginBottom:4 }}>PIN 설정</p>
              <p style={{ fontSize:13, color:'rgba(255,255,255,.4)', marginBottom:16 }}>처음 로그인하셨습니다. 새 PIN을 설정해주세요</p>
              <p style={{ fontSize:12, color:'rgba(255,255,255,.5)', textAlign:'center' }}>
                {newPin.length < 4 ? '새 PIN 입력 (4자리)' : 'PIN 확인 입력'}
              </p>
              <PinInput
                value={newPin.length < 4 ? newPin : newPin2}
                onChange={v => {
                  if (newPin.length < 4) setNewPin(v)
                  else { setNewPin2(v); if(v.length===4) setTimeout(()=>handlePinSetup(v),80) }
                }}
                autoFocus
              />
              {newPin.length >= 4 && (
                <div style={{ display:'flex', gap:8, justifyContent:'center', marginBottom:8 }}>
                  {Array.from({length:4}).map((_,i) => (
                    <div key={i} style={{ width:10, height:10, borderRadius:'50%', background:'rgba(255,255,255,.3)' }}/>
                  ))}
                </div>
              )}
              <p style={{ fontSize:12, color:'rgba(255,255,255,.3)', textAlign:'center', marginBottom:4 }}>
                위 영역을 탭하면 키패드가 열립니다
              </p>
              {error && <p style={{ fontSize:12, color:'#F48771', textAlign:'center', margin:'6px 0' }}>{error}</p>}
              <label style={{ display:'flex', alignItems:'center', gap:8, marginTop:20, cursor:'pointer', justifyContent:'center' }}>
                <input type="checkbox" checked={autoLogin} onChange={e => setAutoLogin(e.target.checked)} style={{ accentColor:'#D87E13' }}/>
                <span style={{ fontSize:12, color:'rgba(255,255,255,.45)' }}>자동 로그인 (30일)</span>
              </label>
            </>
          )}

          {/* ── 일반 로그인 폼 (전화번호 or 선생님) ── */}
          {(!showSignup && (tab === 'teacher' || pStep === 'phone')) && (
            <>
              <p style={{ fontSize:22, fontWeight:700, color:'#fff', marginBottom:6 }}>티처스 수학학원</p>
              <p style={{ fontSize:13, color:'rgba(255,255,255,.45)', marginBottom:24 }}>계정 유형을 선택하고 로그인하세요</p>

              {/* 탭 */}
              <div style={{ display:'flex', gap:8, marginBottom:24 }}>
                {([{key:'parent',label:'학부모'},{key:'teacher',label:'선생님'}] as const).map(({key,label}) => (
                  <button key={key} onClick={() => { setTab(key); setError('') }} style={{
                    flex:1, padding:'12px 0', borderRadius:8,
                    border:`1.5px solid ${tab===key?'#D87E13':'rgba(255,255,255,.15)'}`,
                    background: tab===key?'rgba(216,126,19,.18)':'rgba(255,255,255,.05)',
                    color: tab===key?'#F09830':'rgba(255,255,255,.6)',
                    fontSize:14, fontWeight:600, cursor:'pointer',
                    fontFamily:"'Noto Sans KR',sans-serif",
                  }}>
                    {label}
                  </button>
                ))}
              </div>

              {tab === 'teacher' && (
                <>
                  <div style={{ marginBottom:14 }}>
                    <label style={{ display:'block', fontSize:12, color:'rgba(255,255,255,.5)', marginBottom:7 }}>이메일</label>
                    <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="이메일 입력" style={iStyle}/>
                  </div>
                  <div style={{ marginBottom:14 }}>
                    <label style={{ display:'block', fontSize:12, color:'rgba(255,255,255,.5)', marginBottom:7 }}>비밀번호</label>
                    <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
                      onKeyDown={e=>e.key==='Enter'&&handleTeacherLogin()} placeholder="비밀번호 입력" style={iStyle}/>
                  </div>
                </>
              )}

              {tab === 'parent' && pStep === 'phone' && (
                <div style={{ marginBottom:14 }}>
                  <label style={{ display:'block', fontSize:12, color:'rgba(255,255,255,.5)', marginBottom:7 }}>전화번호</label>
                  <input type="tel" value={phone} onChange={e=>setPhone(e.target.value)}
                    onKeyDown={e=>e.key==='Enter'&&handlePhoneCheck()} placeholder="전화번호 입력" style={iStyle}/>
                  <p style={{ fontSize:12, color:'rgba(255,255,255,.3)', marginTop:7 }}>하이픈(-) 없이 숫자만 입력하세요</p>
                </div>
              )}

              {error && (
                <div style={{ padding:'10px 14px', background:'rgba(192,57,43,.15)', border:'1px solid rgba(192,57,43,.4)', borderRadius:8, marginBottom:12, fontSize:13, color:'#F48771' }}>
                  {error}
                </div>
              )}

              <button onClick={tab==='teacher'?handleTeacherLogin:handlePhoneCheck} disabled={loading}
                style={{ width:'100%', marginTop:8, padding:14, borderRadius:8, border:'none', background:loading?'#a86010':'#D87E13', color:'#071A3E', fontSize:15, fontWeight:700, fontFamily:"'Noto Sans KR',sans-serif", cursor:loading?'not-allowed':'pointer' }}>
                {loading ? '확인 중...' : tab==='parent' ? '다음' : '로그인'}
              </button>

              <div style={{ textAlign:'center', marginTop:10 }}>
                <button onClick={()=>{setShowSignup(true);setError('')}}
                  style={{ background:'none', border:'none', color:'rgba(255,255,255,.35)', fontSize:12, cursor:'pointer', fontFamily:"'Noto Sans KR',sans-serif", textDecoration:'underline' }}>
                  선생님 계정 생성
                </button>
              </div>
            </>
          )}

          {/* ── 회원가입 폼 ── */}
          {showSignup && (
            <>
              <p style={{ fontSize:20, fontWeight:700, color:'#fff', marginBottom:20 }}>선생님 회원가입</p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                <div>
                  <label style={{ display:'block', fontSize:12, color:'rgba(255,255,255,.5)', marginBottom:7 }}>이름 *</label>
                  <input value={sgName} onChange={e=>setSgName(e.target.value)} placeholder="홍길동" style={iStyle}/>
                </div>
                <div>
                  <label style={{ display:'block', fontSize:12, color:'rgba(255,255,255,.5)', marginBottom:7 }}>연락처</label>
                  <input type="tel" value={sgPhone} onChange={e=>setSgPhone(e.target.value.replace(/-/g,''))} placeholder="하이픈(-) 없이 입력" style={iStyle}/>
                </div>
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={{ display:'block', fontSize:12, color:'rgba(255,255,255,.5)', marginBottom:7 }}>이메일 *</label>
                <input type="email" value={sgEmail} onChange={e=>setSgEmail(e.target.value)} placeholder="example@email.com" style={iStyle}/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                <div>
                  <label style={{ display:'block', fontSize:12, color:'rgba(255,255,255,.5)', marginBottom:7 }}>비밀번호 *</label>
                  <input type="password" value={sgPw} onChange={e=>setSgPw(e.target.value)} placeholder="6자 이상" style={iStyle}/>
                </div>
                <div>
                  <label style={{ display:'block', fontSize:12, color:'rgba(255,255,255,.5)', marginBottom:7 }}>비밀번호 확인 *</label>
                  <input type="password" value={sgPw2} onChange={e=>setSgPw2(e.target.value)}
                    onKeyDown={e=>e.key==='Enter'&&handleSignup()} placeholder="동일하게 입력" style={iStyle}/>
                </div>
              </div>
              <p style={{ fontSize:12, color:'rgba(255,255,255,.3)', marginBottom:14 }}>가입 신청 후 관리자 승인을 받아야 로그인할 수 있습니다</p>
              {error && <div style={{ padding:'10px 14px', background:'rgba(192,57,43,.15)', border:'1px solid rgba(192,57,43,.4)', borderRadius:8, marginBottom:12, fontSize:13, color:'#F48771' }}>{error}</div>}
              {success && <div style={{ padding:'10px 14px', background:'rgba(26,127,78,.15)', border:'1px solid rgba(26,127,78,.4)', borderRadius:8, marginBottom:12, fontSize:13, color:'#4ade80' }}>{success}</div>}
              <button onClick={handleSignup} disabled={loading}
                style={{ width:'100%', padding:14, borderRadius:8, border:'none', background:loading?'#a86010':'#D87E13', color:'#071A3E', fontSize:15, fontWeight:700, fontFamily:"'Noto Sans KR',sans-serif", cursor:loading?'not-allowed':'pointer' }}>
                {loading?'처리 중...':'가입 신청'}
              </button>
              <div style={{ textAlign:'center', marginTop:10 }}>
                <button onClick={()=>{setShowSignup(false);setError('');setSuccess('')}}
                  style={{ background:'none', border:'none', color:'rgba(255,255,255,.4)', fontSize:12, cursor:'pointer', fontFamily:"'Noto Sans KR',sans-serif" }}>
                  ← 로그인으로 돌아가기
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </>
  )
}
