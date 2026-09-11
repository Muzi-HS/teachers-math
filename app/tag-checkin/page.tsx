'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// 학생 개인 NFC 태그 등원 체크인 — 로그인 없이 접근 가능한 공개 페이지.
// 학생이 자기 소유 NFC 스티커(반관리 > 학생 상세에서 발급한 고유 토큰이 담긴 URL)를
// 자기 폰에 대면 이 페이지가 열리고, 열리자마자 자동으로 등원 처리를 시도한다.
// 태블릿 키오스크(/checkin)와 동일한 kiosk-checkin 함수를 student_id 대신 nfc_token으로 호출한다.

const navyDk = '#071A3E', gold = '#D87E13'
const re = '#C0392B', gr = '#1A7F4E'

type Result =
  | { kind: 'loading' }
  | { kind: 'success'; name: string; late: boolean; already: boolean }
  | { kind: 'error'; message: string }

export default function TagCheckinPage() {
  const [result, setResult] = useState<Result>({ kind: 'loading' })

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('t')
    if (!token) {
      setResult({ kind: 'error', message: '유효하지 않은 태그입니다.' })
      return
    }
    ;(async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/kiosk-checkin`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ nfc_token: token }),
          }
        )
        const data = await res.json().catch(() => null)
        if (!res.ok || !data?.success) {
          setResult({ kind: 'error', message: data?.error ?? '등원 처리에 실패했습니다. 선생님께 문의하세요.' })
          return
        }
        setResult({ kind: 'success', name: data.studentName, late: !!data.late, already: !!data.already })
      } catch {
        setResult({ kind: 'error', message: '네트워크 오류로 처리하지 못했습니다.' })
      }
    })()
  }, [])

  return (
    <div style={{
      minHeight: '100vh', background: navyDk, display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontFamily: "'Noto Sans KR',sans-serif", padding: 20,
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap');`}</style>
      <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
        <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 6 }}>티처스 수학학원</p>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,.5)', marginBottom: 36 }}>NFC 태그 등원 체크인</p>

        {result.kind === 'loading' && (
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,.6)' }}>처리 중...</p>
        )}

        {result.kind === 'success' && (
          <div style={{ padding: '30px 0' }}>
            <p style={{ fontSize: 40, marginBottom: 12 }}>✅</p>
            <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 8 }}>{result.name} 학생</p>
            <p style={{ fontSize: 16, color: gr, fontWeight: 700 }}>
              {result.already ? '이미 등원 처리되었습니다' : `등원 완료!${result.late ? ' (지각)' : ''}`}
            </p>
          </div>
        )}

        {result.kind === 'error' && (
          <div style={{ padding: '20px 0' }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}>⚠️</p>
            <p style={{ fontSize: 16, color: re, fontWeight: 700 }}>{result.message}</p>
          </div>
        )}
      </div>
    </div>
  )
}
