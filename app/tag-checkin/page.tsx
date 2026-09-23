'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { requestFCMToken } from '@/lib/firebase'
import { IconCheck, IconAlertTriangle } from '@/components/icons'

// 공용 NFC 카드 등원 체크인 — 로그인 없이 접근 가능한 공개 페이지.
// 학원 입구에 놓인 NFC 카드 1개를 학생이 자기 폰으로 태그하면 이 페이지가 열린다.
//
// 하이브리드 방식: 이 폰에 저장된 로그인 정보(localStorage)가 있으면 입력 없이
// 바로 등원 처리한다(안드로이드는 보통 이 경로로 태그만 하면 끝). 저장된 정보가
// 없으면(또는 사라졌으면) 태블릿 키오스크(/checkin)와 동일한 "학부모 휴대폰 번호
// 뒷 4자리 입력" 방식으로 대체하고, 성공하면 다음 태그를 위해 다시 저장을 시도한다.
// 아이폰에서 NFC 태그를 열 때 뜨는 미리보기 화면은 일반 사파리가 아니라 애플이
// 매번 새로 시작하는 임시 웹뷰라 저장이 계속 사라질 수 있는데, 그 경우에도 매번
// 뒷 4자리만 입력하면 되므로(전체 전화번호+PIN보다 훨씬 빠름) 크게 불편하지 않다.
//
// 체크인에 성공하면 그 자리에서 이 폰을 "본인(학생) 명의"로 알림 등록까지 같이 시도한다.
// 학생/학부모 계정에 로그인(전화번호+PIN)해야만 알림을 받을 수 있었던 것과 달리,
// 여기서는 등원 체크인 자체와 동일한 신뢰 수준(부모 번호 뒷 4자리 확인)만으로 충분하다고
// 보고 별도 PIN을 요구하지 않는다 — 학생에게 학부모 PIN을 알려줄 필요가 없어진다.
const AUTO_KEY = 'tag_checkin_auto_login'
const navyDk = 'var(--ui-primary)', navy = 'var(--ui-primary)', gold = 'var(--ui-primary)'
const re = 'var(--ui-danger)', gr = 'var(--ui-success)'

type Child = { id: number; name: string; school: string | null }
type ParentSession = { parentId: number; phone: string; children: Child[] }
type Candidate = { studentId: number; studentName: string; school: string | null; parentId: number }

type Screen = { kind: 'loading' } | { kind: 'input' } | { kind: 'select'; candidates: Candidate[] } | { kind: 'confirm'; c: Candidate }
  | { kind: 'success'; name: string; late: boolean; already: boolean } | { kind: 'error'; message: string }

export default function TagCheckinPage() {
  const [digits, setDigits] = useState('')
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  // 뒷 4자리 검색 결과로 찾은 후보들을 (다음 태그를 위한) 저장용 부모 세션과 함께 들고 있는다
  const [parentSessions, setParentSessions] = useState<Record<number, ParentSession>>({})

  // 이 폰에 저장된 로그인이 있으면 입력 없이 바로 등원 처리 시도
  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTO_KEY)
      if (raw) {
        const session: ParentSession = JSON.parse(raw).session
        if (session?.children?.length) {
          proceedWithChildren(session.children.map(c => ({
            studentId: c.id, studentName: c.name, school: c.school, parentId: session.parentId,
          })))
          return
        }
      }
    } catch {}
    setScreen({ kind: 'input' })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 로그인/PIN 없이, 방금 확인된 학생 본인 명의로 이 폰의 FCM 토큰을 등록한다.
  // 실패해도(알림 미지원 브라우저, 권한 거부 등) 등원 체크인 자체에는 영향 없다.
  async function registerThisDeviceForNotifications(studentId: number) {
    try {
      const token = await requestFCMToken()
      if (!token) return
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/register-fcm-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ student_id: studentId, token }),
      })
    } catch {}
  }

  function proceedWithChildren(candidates: Candidate[]) {
    if (candidates.length === 0) setScreen({ kind: 'error', message: '연결된 학생 정보가 없습니다. 선생님께 문의하세요.' })
    else if (candidates.length === 1) setScreen({ kind: 'confirm', c: candidates[0] })
    else setScreen({ kind: 'select', candidates })
  }

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
        return
      }

      const sessions: Record<number, ParentSession> = {}
      const candidates: Candidate[] = []
      for (const p of data as any[]) {
        const children: Child[] = []
        for (const ps of (p.parent_students ?? [])) {
          if (!ps.students) continue
          children.push({ id: ps.students.id, name: ps.students.name, school: ps.students.school ?? null })
          candidates.push({ studentId: ps.students.id, studentName: ps.students.name, school: ps.students.school ?? null, parentId: p.id })
        }
        sessions[p.id] = { parentId: p.id, phone: p.phone, children }
      }
      setParentSessions(sessions)

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
        setScreen({ kind: 'error', message: result?.error ?? '등원 처리에 실패했습니다. 선생님께 문의하세요.' })
        return
      }
      // 다음 태그부터는 입력 없이 되도록 이 폰에 저장 시도 (저장이 유지되는 폰이면 다음엔 바로 처리됨)
      const session = parentSessions[c.parentId]
      if (session) {
        try { localStorage.setItem(AUTO_KEY, JSON.stringify({ session })) } catch {}
      }
      // 이 폰(=학생 본인 폰)이 앞으로도 본인 등원 알림을 직접 받을 수 있도록, 별도 로그인/PIN
      // 없이 방금 뒷 4자리로 확인된 학생 본인 명의로 바로 등록한다. 로그인 계정이 필요한
      // 알림 등록과 달리, 여기서는 등원 체크인 자체와 동일한 신뢰 수준(뒷 4자리 확인)만 있으면
      // 충분하다고 보고 PIN을 따로 요구하지 않는다.
      registerThisDeviceForNotifications(c.studentId)
      setScreen({ kind: 'success', name: c.studentName, late: !!result.late, already: !!result.already })
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

      <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
        <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 6 }}>티처스 수학학원</p>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,.5)', marginBottom: 36 }}>NFC 태그 등원 체크인</p>

        {(screen.kind === 'loading' || (busy && screen.kind === 'select')) && (
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,.6)' }}>확인 중...</p>
        )}

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

        {screen.kind === 'select' && !busy && (
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
              color: 'var(--ui-primary-text)', fontSize: 18, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 12,
            }}>
              {busy ? '처리 중...' : '등원'}
            </button>
            <button onClick={reset} style={backBtnStyle}>← 다시 입력</button>
          </>
        )}

        {screen.kind === 'success' && (
          <div style={{ padding: '30px 0' }}>
            <p style={{ marginBottom: 12, color: gr, display: 'flex', justifyContent: 'center' }}><IconCheck size={40} strokeWidth={2.5} /></p>
            <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 8 }}>{screen.name} 학생</p>
            <p style={{ fontSize: 16, color: gr, fontWeight: 700 }}>
              {screen.already ? '이미 등원 처리되었습니다' : `등원 완료!${screen.late ? ' (지각)' : ''}`}
            </p>
          </div>
        )}

        {screen.kind === 'error' && (
          <div style={{ padding: '20px 0' }}>
            <p style={{ marginBottom: 12, color: re, display: 'flex', justifyContent: 'center' }}><IconAlertTriangle size={32} strokeWidth={2} /></p>
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
