'use client'
import { useState } from 'react'
import { supabase, TEACHER_AUTO_LOGIN_KEY } from '@/lib/supabase'
import { teacherLogin } from '@/lib/auth'
import { useAuth } from '@/context/AuthContext'

// 태블릿 키오스크 전용 화면 — 어떤 메뉴/버튼에서도 링크로 연결되지 않고
// 이 URL(/checkin)을 직접 입력해야만 들어올 수 있다. 관리자/선생님/조교 중
// 아무 계정으로나 로그인해야 체크인 화면이 보이고, 자동 로그인은 지원하지 않는다
// (탭/브라우저를 닫으면 로그인이 풀리고 다시 로그인해야 한다).

const navyDk = '#071A3E', navy = '#0D2A5E', gold = '#D87E13'
const re = '#C0392B', gr = '#1A7F4E'

function KioskLoginGate({ children }: { children: React.ReactNode }) {
  const { role, loading, loginAsTeacher } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleLogin() {
    setErr(''); setBusy(true)
    try {
      if (!email || !password) throw new Error('이메일과 비밀번호를 입력하세요.')
      // 이 화면은 자동 로그인을 쓰지 않는다 — 탭/브라우저를 닫으면 다시 로그인해야 한다
      localStorage.removeItem(TEACHER_AUTO_LOGIN_KEY)
      const teacher = await teacherLogin(email, password)
      loginAsTeacher(teacher)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: navyDk, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,.5)', fontFamily: "'Noto Sans KR',sans-serif" }}>확인 중...</p>
      </div>
    )
  }

  if (role === 'admin' || role === 'teacher' || role === 'assistant') {
    return <>{children}</>
  }

  return (
    <div style={{
      minHeight: '100vh', background: navyDk, display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontFamily: "'Noto Sans KR',sans-serif", padding: 20,
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap');`}</style>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <p style={{ fontSize: 20, fontWeight: 900, color: '#fff', marginBottom: 4, textAlign: 'center' }}>티처스 수학학원</p>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', marginBottom: 28, textAlign: 'center' }}>등원 체크인 — 관리자 로그인</p>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,.5)', marginBottom: 7 }}>이메일</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="이메일 입력"
            style={{ width: '100%', padding: '12px 16px', borderRadius: 8, border: '1.5px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 16, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,.5)', marginBottom: 7 }}>비밀번호</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()} placeholder="비밀번호 입력"
            style={{ width: '100%', padding: '12px 16px', borderRadius: 8, border: '1.5px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 16, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        {err && (
          <div style={{ padding: '10px 14px', background: 'rgba(192,57,43,.15)', border: '1px solid rgba(192,57,43,.4)', borderRadius: 8, marginBottom: 12, fontSize: 13, color: '#F48771' }}>
            {err}
          </div>
        )}
        <button onClick={handleLogin} disabled={busy} style={{
          width: '100%', padding: 14, borderRadius: 8, border: 'none', background: busy ? '#a86010' : gold,
          color: navyDk, fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: busy ? 'not-allowed' : 'pointer',
        }}>
          {busy ? '로그인 중...' : '로그인'}
        </button>
      </div>
    </div>
  )
}

type Candidate = { studentId: number; studentName: string; school: string | null; parentId: number }

type Screen = { kind: 'input' } | { kind: 'select'; candidates: Candidate[] } | { kind: 'confirm'; c: Candidate }
  | { kind: 'success'; name: string; late: boolean } | { kind: 'error'; message: string }

export default function CheckinKioskPage() {
  return (
    <KioskLoginGate>
      <CheckinKioskInner />
    </KioskLoginGate>
  )
}

function CheckinKioskInner() {
  const [digits, setDigits] = useState('')
  const [screen, setScreen] = useState<Screen>({ kind: 'input' })
  const [busy, setBusy] = useState(false)

  function reset() {
    setDigits('')
    setScreen({ kind: 'input' })
  }

  async function search(last4: string) {
    setBusy(true)
    try {
      const { data, error } = await supabase
        .from('parents')
        .select('id, phone, parent_students(student_id, students(id, name, school))')
        .like('phone', `%${last4}`)

      if (error || !data || data.length === 0) {
        setScreen({ kind: 'error', message: '일치하는 학부모 전화번호가 없습니다.' })
        setBusy(false)
        return
      }

      const candidates: Candidate[] = []
      for (const p of data as any[]) {
        for (const ps of (p.parent_students ?? [])) {
          if (!ps.students) continue
          candidates.push({
            studentId: ps.students.id, studentName: ps.students.name,
            school: ps.students.school ?? null, parentId: p.id,
          })
        }
      }

      if (candidates.length === 0) {
        setScreen({ kind: 'error', message: '연결된 학생 정보가 없습니다. 선생님께 문의하세요.' })
      } else if (candidates.length === 1) {
        setScreen({ kind: 'confirm', c: candidates[0] })
      } else {
        setScreen({ kind: 'select', candidates })
      }
    } finally {
      setBusy(false)
    }
  }

  async function confirmCheckin(c: Candidate) {
    setBusy(true)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/kiosk-checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ student_id: c.studentId }),
        }
      )
      const result = await res.json().catch(() => null)
      if (!res.ok || !result?.success) {
        setScreen({ kind: 'error', message: '등원 처리에 실패했습니다. 선생님께 문의하세요.' })
        return
      }
      setScreen({ kind: 'success', name: c.studentName, late: !!result.late })
      setTimeout(reset, 3000)
    } catch {
      setScreen({ kind: 'error', message: '네트워크 오류로 처리하지 못했습니다.' })
    } finally {
      setBusy(false)
    }
  }

  function pressDigit(d: string) {
    if (busy || screen.kind !== 'input') return
    const next = (digits + d).slice(0, 4)
    setDigits(next)
    if (next.length === 4) search(next)
  }
  function pressBackspace() {
    if (busy || screen.kind !== 'input') return
    setDigits(d => d.slice(0, -1))
  }
  function pressClear() {
    if (busy || screen.kind !== 'input') return
    setDigits('')
  }

  return (
    <div style={{
      minHeight: '100vh', background: navyDk, display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontFamily: "'Noto Sans KR',sans-serif", padding: 20,
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap');`}</style>

      <div style={{ width: '100%', maxWidth: 480, textAlign: 'center' }}>
        <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 6 }}>티처스 수학학원</p>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,.5)', marginBottom: 36 }}>등원 체크인</p>

        {screen.kind === 'input' && (
          <>
            <p style={{ fontSize: 16, color: 'rgba(255,255,255,.85)', marginBottom: 20 }}>
              학부모 휴대폰 번호 뒷 4자리를 입력해주세요
            </p>
            <div style={{ display: 'flex', gap: 18, justifyContent: 'center', marginBottom: 32 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{
                  width: 46, height: 56, borderRadius: 10,
                  background: 'rgba(255,255,255,.06)', border: `1.5px solid ${i < digits.length ? gold : 'rgba(255,255,255,.15)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 26, fontWeight: 700, color: '#fff',
                }}>
                  {digits[i] ?? ''}
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => (
                <button key={n} onClick={() => pressDigit(n)} disabled={busy} style={keyStyle}>{n}</button>
              ))}
              <button onClick={pressClear} disabled={busy} style={{ ...keyStyle, fontSize: 15, color: 'rgba(255,255,255,.5)' }}>지우기</button>
              <button onClick={() => pressDigit('0')} disabled={busy} style={keyStyle}>0</button>
              <button onClick={pressBackspace} disabled={busy} style={{ ...keyStyle, fontSize: 20 }}>⌫</button>
            </div>

            {busy && <p style={{ marginTop: 20, fontSize: 13, color: 'rgba(255,255,255,.5)' }}>확인 중...</p>}
          </>
        )}

        {screen.kind === 'select' && (
          <>
            <p style={{ fontSize: 16, color: 'rgba(255,255,255,.85)', marginBottom: 20 }}>
              일치하는 학생이 여러 명입니다. 본인을 선택해주세요
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {screen.candidates.map(c => (
                <button key={c.studentId} onClick={() => confirmCheckin(c)} disabled={busy} style={{
                  padding: '16px 18px', borderRadius: 10, border: '1.5px solid rgba(255,255,255,.15)',
                  background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 17, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit', display: 'flex', justifyContent: 'space-between',
                }}>
                  <span>{c.studentName}</span>
                  {c.school && <span style={{ fontSize: 13, color: 'rgba(255,255,255,.45)', fontWeight: 400 }}>{c.school}</span>}
                </button>
              ))}
            </div>
            <button onClick={reset} style={backBtnStyle}>← 다시 입력</button>
          </>
        )}

        {screen.kind === 'confirm' && (
          <>
            <p style={{ fontSize: 20, color: '#fff', marginBottom: 8 }}>
              <b style={{ color: gold }}>{screen.c.studentName}</b> 학생
            </p>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,.6)', marginBottom: 28 }}>맞으면 등원을 눌러주세요</p>
            <button onClick={() => confirmCheckin(screen.c)} disabled={busy} style={{
              width: '100%', padding: 18, borderRadius: 12, border: 'none', background: gold,
              color: navyDk, fontSize: 18, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 12,
            }}>
              {busy ? '처리 중...' : '등원'}
            </button>
            <button onClick={reset} style={backBtnStyle}>← 다시 입력</button>
          </>
        )}

        {screen.kind === 'success' && (
          <div style={{ padding: '30px 0' }}>
            <p style={{ fontSize: 40, marginBottom: 12 }}>✅</p>
            <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 8 }}>{screen.name} 학생</p>
            <p style={{ fontSize: 16, color: gr, fontWeight: 700 }}>등원 완료!{screen.late ? ' (지각)' : ''}</p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,.4)', marginTop: 18 }}>잠시 후 초기 화면으로 돌아갑니다</p>
          </div>
        )}

        {screen.kind === 'error' && (
          <div style={{ padding: '20px 0' }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}>⚠️</p>
            <p style={{ fontSize: 16, color: re, fontWeight: 700, marginBottom: 24 }}>{screen.message}</p>
            <button onClick={reset} style={{
              width: '100%', padding: 16, borderRadius: 12, border: 'none', background: navy,
              color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              다시 시도
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const keyStyle: React.CSSProperties = {
  padding: '20px 0', borderRadius: 12, border: '1.5px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.05)', color: '#fff', fontSize: 24, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
}

const backBtnStyle: React.CSSProperties = {
  width: '100%', padding: 12, borderRadius: 10, border: 'none', background: 'none',
  color: 'rgba(255,255,255,.4)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
}
