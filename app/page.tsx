'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { teacherLogin, parentLogin } from '@/lib/auth'
import { useAuth } from '@/context/AuthContext'

type Tab = 'parent' | 'teacher'

export default function LoginPage() {
  const router = useRouter()
  const { role, loading: authLoading, loginAsTeacher, loginAsParent } = useAuth()

  // role이 확정된 후에 이동 — 상태가 적용된 다음 렌더에서만 실행
  useEffect(() => {
    if (authLoading) return
    if (role === 'admin') router.replace('/dashboard')
    else if (role === 'teacher') router.replace('/attendance')
    else if (role === 'parent') router.replace('/parent/notices')
  }, [role, authLoading])

  const [tab,        setTab]       = useState<Tab>('parent')
  const [showSignup, setShowSignup] = useState(false)
  const [email,    setEmail]    = useState('')
  const [phone,    setPhone]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [success,  setSuccess]  = useState('')

  // 회원가입 필드
  const [sgName,  setSgName]  = useState('')
  const [sgEmail, setSgEmail] = useState('')
  const [sgPhone, setSgPhone] = useState('')
  const [sgPw,    setSgPw]    = useState('')
  const [sgPw2,   setSgPw2]   = useState('')

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 16px', borderRadius: 8,
    border: '1.5px solid rgba(255,255,255,.12)',
    background: 'rgba(255,255,255,.06)', color: '#fff',
    fontSize: 14, fontFamily: "'Noto Sans KR', sans-serif", outline: 'none',
    boxSizing: 'border-box',
  }

  async function handleLogin() {
    setError(''); setLoading(true)
    try {
      if (tab === 'teacher') {
        if (!email || !password) throw new Error('이메일과 비밀번호를 입력하세요.')
        const teacher = await teacherLogin(email, password)
        loginAsTeacher(teacher)
        // 이동은 위의 useEffect가 role 변경 후 처리
      } else {
        if (!phone) throw new Error('전화번호를 입력하세요.')
        const parent = await parentLogin(phone)
        sessionStorage.setItem('parent_session', JSON.stringify(parent))
        loginAsParent(parent)
        // 이동은 위의 useEffect가 role 변경 후 처리
      }
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
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
      // 1. Supabase Auth 계정 생성
      const { data, error: authErr } = await supabase.auth.signUp({
        email: sgEmail.trim(),
        password: sgPw,
      })
      if (authErr) throw new Error(authErr.message)
      if (!data.user) throw new Error('회원가입에 실패했습니다.')

      // 2. teachers 테이블에 등록 (승인 대기)
      const { error: tErr } = await supabase.from('teachers').insert({
        user_id:  data.user.id,
        name:     sgName.trim(),
        email:    sgEmail.trim(),
        phone:    sgPhone.replace(/-/g, ''),
        role:     'teacher',
        approved: false,
      })
      if (tErr) throw new Error('선생님 정보 등록 실패: ' + tErr.message)

      setSuccess('가입 신청이 완료됐습니다. 관리자 승인 후 로그인할 수 있습니다.')
      setSgName(''); setSgEmail(''); setSgPhone(''); setSgPw(''); setSgPw2('')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const TABS = [
    { key: 'parent',  label: '학부모', emoji: '👪' },
    { key: 'teacher', label: '선생님', emoji: '👨‍🏫' },
  ] as const

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Noto Sans KR', sans-serif; }
        input::placeholder { color: rgba(255,255,255,.25); }
        input:focus { border-color: #D87E13 !important; }
      `}</style>

      <div style={{ minHeight: '100vh', background: '#071A3E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 420, padding: '48px 40px' }}>

          {/* 로고 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 36 }}>
            <Image src="/logo.png" alt="로고" width={52} height={52} style={{ objectFit: 'contain', flexShrink: 0 }} />
            <div>
              <h1 style={{ fontFamily: "'Noto Sans KR',sans-serif", fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: 0.5 }}>
                TEACHERS MATH
              </h1>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', letterSpacing: 2, marginTop: 2 }}>
                티처스 수학학원
              </p>
            </div>
          </div>

          <p style={{ fontSize: 24, fontWeight: 700, color: '#fff', marginBottom: 8 }}>티처스 수학학원</p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', marginBottom: 28 }}>계정 유형을 선택하고 로그인하세요</p>

          {/* 탭 */}
          {!showSignup && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
              {TABS.map(({ key, label, emoji }) => (
                <button key={key} onClick={() => { setTab(key as Tab); setError(''); setSuccess('') }} style={{
                  flex: 1, padding: '10px 0', borderRadius: 8,
                  border: `1.5px solid ${tab === key ? '#D87E13' : 'rgba(255,255,255,.15)'}`,
                  background: tab === key ? 'rgba(216,126,19,.18)' : 'rgba(255,255,255,.05)',
                  color: tab === key ? '#F09830' : 'rgba(255,255,255,.6)',
                  fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  fontFamily: "'Noto Sans KR',sans-serif", transition: 'all .2s',
                }}>
                  <div>{emoji}</div>
                  <div style={{ marginTop: 4 }}>{label}</div>
                </button>
              ))}
            </div>
          )}

          {/* 로그인 폼 */}
          {!showSignup && (
            <>
              {tab === 'teacher' && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,.5)', marginBottom: 8 }}>이메일</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="이메일 입력" style={inputStyle} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,.5)', marginBottom: 8 }}>비밀번호</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleLogin()}
                      placeholder="비밀번호 입력" style={inputStyle} />
                  </div>
                </>
              )}

              {tab === 'parent' && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,.5)', marginBottom: 8 }}>전화번호</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                    placeholder="전화번호 입력" style={inputStyle} />
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,.3)', marginTop: 8 }}>
                    하이픈(-) 없이 숫자만 입력하세요
                  </p>
                </div>
              )}
            </>
          )}

          {/* 회원가입 폼 */}
          {showSignup && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,.5)', marginBottom: 8 }}>이름 *</label>
                  <input value={sgName} onChange={e => setSgName(e.target.value)} placeholder="홍길동" style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,.5)', marginBottom: 8 }}>연락처</label>
                  <input type="tel" value={sgPhone} onChange={e => setSgPhone(e.target.value.replace(/-/g,''))}
                    placeholder="01000000000" style={inputStyle} />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,.5)', marginBottom: 8 }}>이메일 *</label>
                <input type="email" value={sgEmail} onChange={e => setSgEmail(e.target.value)}
                  placeholder="example@email.com" style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,.5)', marginBottom: 8 }}>비밀번호 *</label>
                  <input type="password" value={sgPw} onChange={e => setSgPw(e.target.value)}
                    placeholder="6자 이상" style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,.5)', marginBottom: 8 }}>비밀번호 확인 *</label>
                  <input type="password" value={sgPw2} onChange={e => setSgPw2(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSignup()}
                    placeholder="동일하게 입력" style={inputStyle} />
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,.3)', marginBottom: 16 }}>
                가입 신청 후 관리자 승인을 받아야 로그인할 수 있습니다
              </p>
            </>
          )}

          {/* 에러 / 성공 메시지 */}
          {error && (
            <div style={{ padding: '10px 14px', background: 'rgba(192,57,43,.15)', border: '1px solid rgba(192,57,43,.4)', borderRadius: 8, marginBottom: 12, fontSize: 13, color: '#F48771' }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ padding: '10px 14px', background: 'rgba(26,127,78,.15)', border: '1px solid rgba(26,127,78,.4)', borderRadius: 8, marginBottom: 12, fontSize: 13, color: '#4ade80' }}>
              {success}
            </div>
          )}

          {/* 버튼 */}
          <button
            onClick={showSignup ? handleSignup : handleLogin}
            disabled={loading}
            style={{
              width: '100%', marginTop: 8, padding: 14, borderRadius: 8, border: 'none',
              background: loading ? '#a86010' : '#D87E13', color: '#071A3E',
              fontSize: 15, fontWeight: 700, fontFamily: "'Noto Sans KR',sans-serif",
              cursor: loading ? 'not-allowed' : 'pointer', transition: 'background .2s',
            }}
          >
            {loading ? '처리 중...' : showSignup ? '가입 신청' : '로그인'}
          </button>

          {/* 회원가입 링크 */}
          <div style={{ textAlign: 'center', marginTop: 5 }}>
            {showSignup ? (
              <button onClick={() => { setShowSignup(false); setError(''); setSuccess('') }}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', fontSize: 12, cursor: 'pointer', fontFamily: "'Noto Sans KR',sans-serif" }}>
                ← 로그인으로 돌아가기
              </button>
            ) : (
              <button onClick={() => { setShowSignup(true); setError(''); setSuccess('') }}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.35)', fontSize: 12, cursor: 'pointer', fontFamily: "'Noto Sans KR',sans-serif", textDecoration: 'underline' }}>
                선생님 계정 생성
              </button>
            )}
          </div>

        </div>
      </div>
    </>
  )
}
