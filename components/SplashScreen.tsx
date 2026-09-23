'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
import { TEACHER_AUTO_LOGIN_KEY } from '@/lib/supabase'

const mint = '#EAF7F0', deep = '#154A32', deep2 = '#2A6349'

// 모바일 화면 + 자동 로그인이 설정된 상태로 웹앱에 들어올 때만 보여주는 로딩 화면.
// (자동 로그인이 아니면 바로 히어로/로그인 화면이 뜨므로 스플래시가 필요 없고, 데스크톱도
// 마찬가지로 스킵한다.) 실제 히어로와 같은 문구·구성을 등장 애니메이션 없이 보여주다가,
// 최소 1초 + 로그인 확인이 끝나는 시점 중 더 늦은 쪽에 맞춰 사라진다.
export default function SplashScreen() {
  const { loading: authLoading } = useAuth()
  const [shouldShow, setShouldShow] = useState<boolean | null>(null) // null = 아직 판단 전(아무것도 렌더 안 함)
  const [minTimeDone, setMinTimeDone] = useState(false)
  const [entered, setEntered] = useState(false)
  const [fading, setFading] = useState(false)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    let hasAutoLogin = false
    try {
      hasAutoLogin =
        localStorage.getItem(TEACHER_AUTO_LOGIN_KEY) === '1' ||
        !!localStorage.getItem('parent_auto_login') ||
        !!localStorage.getItem('student_auto_login')
    } catch {}
    const isMobile = window.matchMedia('(max-width: 768px)').matches
    setShouldShow(hasAutoLogin && isMobile)
  }, [])

  useEffect(() => {
    if (shouldShow !== true) return
    const enterTimer = setTimeout(() => setEntered(true), 30)
    const minTimer = setTimeout(() => setMinTimeDone(true), 1000)
    return () => { clearTimeout(enterTimer); clearTimeout(minTimer) }
  }, [shouldShow])

  useEffect(() => {
    if (shouldShow !== true || !minTimeDone || authLoading) return
    setFading(true)
    const hideTimer = setTimeout(() => setVisible(false), 300)
    return () => clearTimeout(hideTimer)
  }, [shouldShow, minTimeDone, authLoading])

  if (shouldShow !== true || !visible) return null

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, overflow: 'hidden',
        background: mint, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '24px',
        opacity: fading ? 0 : 1, transition: 'opacity .3s ease',
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;500;600;800&display=swap');`}</style>
      <div style={{
        maxWidth: 'min(880px,92vw)', width: '100%', fontFamily: "'Noto Sans KR',sans-serif",
        opacity: entered ? 1 : 0, transform: entered ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity .5s cubic-bezier(.16,1,.3,1), transform .5s cubic-bezier(.16,1,.3,1)',
      }}>
        <h1 style={{ fontSize: 'clamp(30px, 6.4vw, 60px)', lineHeight: 1.28, letterSpacing: '-0.02em', marginBottom: 28, color: deep, wordBreak: 'keep-all' }}>
          <span style={{ fontWeight: 800 }}>꾸준히</span>
          <span style={{ fontWeight: 300, margin: '0 0.28em' }}>그리고</span>
          <span style={{ fontWeight: 800 }}>단단히</span>
        </h1>

        <div style={{ height: 1, background: 'rgba(21,74,50,.3)', maxWidth: 480, margin: '0 auto 26px' }} />

        <div style={{ marginBottom: 26 }}>
          <p style={{ fontSize: 'clamp(14px, 1.9vw, 18px)', lineHeight: 1.9, fontWeight: 500, color: deep2, wordBreak: 'keep-all' }}>
            성장하는 사람이 되기를,<br />한번 더 성장하는 것의 무한한 가치를 믿으며
          </p>
          <p style={{ fontSize: 'clamp(14px, 1.9vw, 18px)', lineHeight: 1.9, fontWeight: 500, color: deep2, marginTop: 12, wordBreak: 'keep-all' }}>
            이를 위해 고민하고 노력하는 사람이 되기를,<br />그리고 자유롭게 살아가기를
          </p>
        </div>

        <div style={{ height: 1, background: 'rgba(21,74,50,.3)', maxWidth: 480, margin: '0 auto 30px' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <Image src="/logo-green.png" alt="" width={68} height={42} style={{ objectFit: 'contain', flexShrink: 0 }} priority />
          <div style={{ textAlign: 'left' }}>
            <p style={{ fontSize: 20, fontWeight: 800, color: deep, letterSpacing: '-0.02em', lineHeight: 1, margin: 0 }}>티처스 수학학원</p>
            <p style={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(21,74,50,.55)', letterSpacing: 3, lineHeight: 1, margin: '6px 0 0' }}>TEACHERS MATH</p>
          </div>
        </div>
      </div>
    </div>
  )
}
