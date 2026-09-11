'use client'
import { useEffect, useState } from 'react'
import { parentLookup, parentLoginWithPin } from '@/lib/auth'
import { useAuth } from '@/context/AuthContext'

// 공용 NFC 카드 등원 체크인 — 로그인 없이 접근 가능한 공개 페이지.
// 학원 입구에 놓인 NFC 카드 1개를 학생이 자기 폰으로 태그하면 이 페이지가 열린다.
// 그 폰이 학부모 포털에 "자동 로그인"이 남아있으면(app/page.tsx와 동일한 방식으로 복원)
// 추가 입력 없이 바로 등원 처리되고, 처음 태그하는 폰이면 전화번호+PIN을 한 번만 입력한다
// (이후 자동 로그인을 켜두면 다음 태그부터는 바로 처리된다).
// 등원 처리 자체는 태블릿 키오스크(/checkin)와 동일한 kiosk-checkin 함수를 사용한다.

const AUTO_KEY = 'parent_auto_login'
const navyDk = '#071A3E', navy = '#0D2A5E', gold = '#D87E13'
const re = '#C0392B', gr = '#1A7F4E'

type Child = { id: number; name: string; birth_year: number; school: string }

type Screen =
  | { kind: 'loading' }
  | { kind: 'phone' }
  | { kind: 'pin'; phone: string }
  | { kind: 'select'; children: Child[] }
  | { kind: 'success'; name: string; late: boolean; already: boolean }
  | { kind: 'error'; message: string }

export default function TagCheckinPage() {
  const { parent, role, loading: authLoading, loginAsParent } = useAuth()
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' })
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [pinErr, setPinErr] = useState('')
  const [autoLogin, setAutoLogin] = useState(true)
  const [busy, setBusy] = useState(false)
  const [restoreDone, setRestoreDone] = useState(false)

  // 자동 로그인 복원 (app/page.tsx의 로그인 페이지와 동일한 방식)
  useEffect(() => {
    if (authLoading || role) { setRestoreDone(true); return }
    try {
      const raw = localStorage.getItem(AUTO_KEY)
      if (raw) loginAsParent(JSON.parse(raw).session)
    } catch {}
    setRestoreDone(true)
  }, [authLoading, role]) // eslint-disable-line react-hooks/exhaustive-deps

  // 로그인 상태가 확정되면(복원되었거나, 원래 없었거나) 바로 다음 단계로 진행
  useEffect(() => {
    if (!restoreDone || authLoading) return
    if (role === 'parent' && parent) proceedWithChildren(parent.children as Child[])
    else if (role !== 'parent') setScreen({ kind: 'phone' })
  }, [restoreDone, authLoading, role, parent]) // eslint-disable-line react-hooks/exhaustive-deps

  function proceedWithChildren(children: Child[]) {
    if (children.length === 0) setScreen({ kind: 'error', message: '연결된 학생 정보가 없습니다. 선생님께 문의하세요.' })
    else if (children.length === 1) doCheckin(children[0])
    else setScreen({ kind: 'select', children })
  }

  async function doCheckin(child: Child) {
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
          body: JSON.stringify({ student_id: child.id }),
        }
      )
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.success) {
        setScreen({ kind: 'error', message: data?.error ?? '등원 처리에 실패했습니다. 선생님께 문의하세요.' })
        return
      }
      setScreen({ kind: 'success', name: child.name, late: !!data.late, already: !!data.already })
    } catch {
      setScreen({ kind: 'error', message: '네트워크 오류로 처리하지 못했습니다.' })
    } finally {
      setBusy(false)
    }
  }

  async function handlePhoneSubmit() {
    if (!phone) return
    setBusy(true); setPinErr('')
    try {
      await parentLookup(phone)
      setPin('')
      setScreen({ kind: 'pin', phone })
    } catch (e: any) {
      setScreen({ kind: 'error', message: e.message })
    } finally {
      setBusy(false)
    }
  }

  async function handlePinSubmit(phoneVal: string, pinVal: string) {
    setBusy(true); setPinErr('')
    try {
      const result = await parentLoginWithPin(phoneVal, pinVal)
      const session = { parentId: result.parentId, phone: result.phone, children: result.children }
      if (autoLogin) localStorage.setItem(AUTO_KEY, JSON.stringify({ session }))
      sessionStorage.setItem('parent_session', JSON.stringify(session))
      loginAsParent(session)
      proceedWithChildren(session.children as Child[])
    } catch (e: any) {
      setPinErr(e.message)
      setPin('')
      setBusy(false)
    }
  }

  function reset() {
    setPhone(''); setPin(''); setPinErr('')
    setScreen({ kind: 'phone' })
  }

  return (
    <div style={{
      minHeight: '100vh', background: navyDk, display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontFamily: "'Noto Sans KR',sans-serif", padding: 20,
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap');`}</style>
      <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
        <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 6 }}>티처스 수학학원</p>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,.5)', marginBottom: 36 }}>NFC 태그 등원 체크인</p>

        {(screen.kind === 'loading' || (busy && (screen.kind === 'select'))) && (
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,.6)' }}>확인 중...</p>
        )}

        {screen.kind === 'phone' && (
          <>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,.85)', marginBottom: 16 }}>
              처음 태그하셨네요. 학부모 전화번호를 입력해주세요
            </p>
            <input
              type="tel" inputMode="numeric" value={phone}
              onChange={e => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={e => e.key === 'Enter' && handlePhoneSubmit()}
              placeholder="01012345678" autoFocus
              style={{
                width: '100%', padding: '14px 16px', borderRadius: 10,
                border: '1.5px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.06)',
                color: '#fff', fontSize: 18, textAlign: 'center', letterSpacing: 1,
                outline: 'none', fontFamily: 'inherit', marginBottom: 16, boxSizing: 'border-box',
              }}
            />
            <button onClick={handlePhoneSubmit} disabled={busy || !phone} style={{
              width: '100%', padding: 16, borderRadius: 12, border: 'none',
              background: gold, color: navyDk, fontSize: 16, fontWeight: 900,
              cursor: 'pointer', fontFamily: 'inherit', opacity: busy || !phone ? .6 : 1,
            }}>
              {busy ? '확인 중...' : '다음'}
            </button>
          </>
        )}

        {screen.kind === 'pin' && (
          <>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,.85)', marginBottom: 16 }}>PIN 번호 4자리를 입력해주세요</p>
            <input
              type="tel" inputMode="numeric" value={pin}
              onChange={e => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 4)
                setPin(v)
                if (v.length === 4) handlePinSubmit(screen.phone, v)
              }}
              autoFocus
              style={{
                width: '100%', padding: '14px 16px', borderRadius: 10,
                border: '1.5px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.06)',
                color: '#fff', fontSize: 24, textAlign: 'center', letterSpacing: 12,
                outline: 'none', fontFamily: 'inherit', marginBottom: 12, boxSizing: 'border-box',
              }}
            />
            {pinErr && <p style={{ fontSize: 13, color: re, marginBottom: 12 }}>{pinErr}</p>}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 16, cursor: 'pointer' }}>
              <input type="checkbox" checked={autoLogin} onChange={e => setAutoLogin(e.target.checked)} style={{ accentColor: gold }} />
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }}>이 폰에서 자동 로그인 유지 (다음부터 태그만 하면 바로 처리)</span>
            </label>
            <button onClick={reset} style={{
              width: '100%', padding: 12, borderRadius: 10, border: 'none', background: 'none',
              color: 'rgba(255,255,255,.4)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
            }}>← 전화번호 다시 입력</button>
          </>
        )}

        {screen.kind === 'select' && !busy && (
          <>
            <p style={{ fontSize: 16, color: 'rgba(255,255,255,.85)', marginBottom: 20 }}>본인을 선택해주세요</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {screen.children.map(c => (
                <button key={c.id} onClick={() => doCheckin(c)} disabled={busy} style={{
                  padding: '16px 18px', borderRadius: 10, border: '1.5px solid rgba(255,255,255,.15)',
                  background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 17, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit', display: 'flex', justifyContent: 'space-between',
                }}>
                  <span>{c.name}</span>
                  {c.school && <span style={{ fontSize: 13, color: 'rgba(255,255,255,.45)', fontWeight: 400 }}>{c.school}</span>}
                </button>
              ))}
            </div>
          </>
        )}

        {screen.kind === 'success' && (
          <div style={{ padding: '30px 0' }}>
            <p style={{ fontSize: 40, marginBottom: 12 }}>✅</p>
            <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 8 }}>{screen.name} 학생</p>
            <p style={{ fontSize: 16, color: gr, fontWeight: 700 }}>
              {screen.already ? '이미 등원 처리되었습니다' : `등원 완료!${screen.late ? ' (지각)' : ''}`}
            </p>
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
