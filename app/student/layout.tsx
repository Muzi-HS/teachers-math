'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
import { requestFCMToken, isFCMSupported } from '@/lib/firebase'
import ForegroundNotification from '@/components/ForegroundNotification'

const navy='#0D2A5E', navyDk='#071A3E', bd='#DDE3EE', bg='#F5F7FA', tx2='#4B5C7E', tx3='#96A4BF'

const NAV = [
  { href: '/student/tests', label: '시험',
    icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="5" y="4" width="14" height="17" rx="2" strokeWidth={2}/><path d="M9 9h6M9 13h6M9 17h3" strokeWidth={2}/></svg> },
  { href: '/student/records', label: '수업기록',
    icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg> },
  { href: '/student/notices', label: '반 공지',
    icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg> },
  { href: '/student/schedule', label: '학원일정',
    icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2" strokeWidth={2}/><path strokeWidth={2} d="M16 2v4M8 2v4M3 10h18"/></svg> },
  { href: '/student/coupons', label: '쿠폰함',
    icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M9 5H4a1 1 0 00-1 1v3a2 2 0 010 4v3a1 1 0 001 1h5m0-12h11a1 1 0 011 1v3a2 2 0 000 4v3a1 1 0 01-1 1H9m0-12v12"/></svg> },
]

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { student, role, loading, logout } = useAuth()
  const router   = useRouter()
  const pathname = usePathname()

  const [ready, setReady] = useState(false)
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | null>(null)
  const [notifBannerDismissed, setNotifBannerDismissed] = useState(false)
  const [notifRequesting, setNotifRequesting] = useState(false)
  const initDone = useRef(false)

  async function registerFCMToken(studentId: number) {
    try {
      const token = await requestFCMToken()
      if (typeof Notification !== 'undefined') setNotifPerm(Notification.permission)
      if (!token) return
      await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/register-fcm-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ student_id: studentId, token }),
        }
      )
    } catch (e) {
      console.error('[FCM] 학생 토큰 등록 오류:', e)
    }
  }

  async function enableNotifications() {
    if (!student?.studentId || notifRequesting) return
    setNotifRequesting(true)
    await registerFCMToken(student.studentId)
    setNotifRequesting(false)
  }

  function dismissNotifBanner() {
    try { sessionStorage.setItem('notifBannerDismissed', '1') } catch {}
    setNotifBannerDismissed(true)
  }

  useEffect(() => {
    if (loading) return
    if (!role || role !== 'student') {
      router.replace('/')
      return
    }
    if (initDone.current) return
    initDone.current = true
    if (student?.studentId) registerFCMToken(student.studentId)
    setReady(true)
  }, [loading, role, student]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return
    isFCMSupported().then(supported => {
      if (!supported) return
      setNotifPerm(Notification.permission)
      try {
        if (sessionStorage.getItem('notifBannerDismissed') === '1') setNotifBannerDismissed(true)
      } catch {}
    })
  }, [])

  const notifPermRef = useRef<NotificationPermission | null>(null)
  useEffect(() => { notifPermRef.current = notifPerm }, [notifPerm])
  useEffect(() => {
    if (typeof document === 'undefined' || typeof Notification === 'undefined') return
    function recheck() {
      if (document.visibilityState !== 'visible') return
      const current = Notification.permission
      if (current === notifPermRef.current) return
      setNotifPerm(current)
      if (current === 'granted' && notifPermRef.current !== 'granted' && student?.studentId) {
        registerFCMToken(student.studentId)
      }
    }
    document.addEventListener('visibilitychange', recheck)
    window.addEventListener('focus', recheck)
    return () => {
      document.removeEventListener('visibilitychange', recheck)
      window.removeEventListener('focus', recheck)
    }
  }, [student?.studentId]) // eslint-disable-line react-hooks/exhaustive-deps

  function navigateToLink(link: string) {
    if (link === window.location.pathname) window.location.reload()
    else router.push(link)
  }

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return
    function onMessage(e: MessageEvent) {
      if (e.data?.type !== 'push-navigate' || !e.data.link) return
      navigateToLink(e.data.link)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [router]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready) return
    if (pathname === '/student') router.replace('/student/records')
  }, [pathname, ready, router])

  if (loading || !ready) return (
    <div style={{ minHeight: '100vh', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 36, height: 36, border: '3px solid #DDE3EE', borderTop: `3px solid ${navy}`, borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ fontSize: 13, color: tx2 }}>로딩 중...</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (!role || role !== 'student') return null

  return (
    <div style={{ minHeight: '100vh', background: bg, fontFamily: "'Noto Sans KR',sans-serif", display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&family=Montserrat:wght@700;800&display=swap');
        * { box-sizing: border-box; }
        .student-main { padding-bottom: calc(80px + env(safe-area-inset-bottom)); }
        .student-nav { padding-bottom: env(safe-area-inset-bottom); height: calc(62px + env(safe-area-inset-bottom)); }
      `}</style>

      {/* 상단 헤더 */}
      <header style={{
        background: `linear-gradient(135deg,${navyDk} 0%,${navy} 100%)`,
        padding: '0 16px', height: 54,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100,
        boxShadow: '0 2px 8px rgba(0,0,0,.2)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Image src="/logo.png" alt="로고" width={30} height={30} style={{ objectFit: 'contain', flexShrink: 0 }} />
          <span style={{ fontFamily: 'Montserrat,sans-serif', fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: 0.5 }}>
            TEACHERS MATH
          </span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', background: 'rgba(255,255,255,.1)', padding: '2px 6px', borderRadius: 10 }}>
            학생
          </span>
        </div>
        <button
          onClick={logout}
          style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Noto Sans KR',sans-serif", padding: 0 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,.9)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,.5)')}
        >
          로그아웃
        </button>
      </header>

      {/* 본문 */}
      <main className="student-main" style={{ flex: 1, padding: '16px 16px 80px', maxWidth: 640, width: '100%', margin: '0 auto' }}>
        {notifPerm && notifPerm !== 'granted' && !notifBannerDismissed && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: '#FEF3E2', border: '1px solid #D87E1355', borderRadius: 12,
            padding: '12px 14px', marginBottom: 14,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: navyDk }}>
                {notifPerm === 'denied' ? '알림이 차단되어 있어요' : '알림을 켜주세요'}
              </p>
              <p style={{ margin: '3px 0 0', fontSize: 11.5, color: tx2, lineHeight: 1.5 }}>
                {notifPerm === 'denied'
                  ? '등원 체크인 알림을 받으려면 휴대폰 설정 → 이 앱(또는 브라우저)의 알림 권한을 허용으로 바꿔주세요.'
                  : '등원 체크인을 하면 바로 알려드려요.'}
              </p>
            </div>
            {notifPerm !== 'denied' && (
              <button onClick={enableNotifications} disabled={notifRequesting} style={{
                flexShrink: 0, border: 'none', borderRadius: 8, padding: '8px 14px',
                background: navy, color: '#fff', fontWeight: 700, fontSize: 12,
                cursor: notifRequesting ? 'not-allowed' : 'pointer', opacity: notifRequesting ? .7 : 1,
                fontFamily: 'inherit',
              }}>{notifRequesting ? '확인 중...' : '알림 켜기'}</button>
            )}
            <button onClick={dismissNotifBanner} aria-label="닫기" style={{
              flexShrink: 0, border: 'none', background: 'rgba(13,42,94,.08)',
              color: navyDk, borderRadius: '50%', width: 24, height: 24,
              cursor: 'pointer', fontSize: 14, lineHeight: 1,
            }}>×</button>
          </div>
        )}
        {children}
      </main>

      {/* 하단 탭바 */}
      <nav className="student-nav" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        background: '#fff', borderTop: `1px solid ${bd}`,
        display: 'flex',
        boxShadow: '0 -2px 10px rgba(0,0,0,.08)',
        alignItems: 'flex-start',
      }}>
        {NAV.map(item => {
          const active = pathname.startsWith(item.href)
          return (
            <button key={item.href} onClick={() => router.push(item.href)} style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 3,
              height: 62,
              background: 'none', border: 'none', cursor: 'pointer',
              color: active ? navy : tx3,
              fontFamily: "'Noto Sans KR',sans-serif",
              transition: 'color .15s',
              borderTop: active ? `2.5px solid ${navy}` : '2.5px solid transparent',
              paddingTop: 2,
            }}>
              <span style={{ color: active ? navy : tx3, display: 'flex' }}>{item.icon}</span>
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 400 }}>{item.label}</span>
            </button>
          )
        })}
      </nav>
      <ForegroundNotification />
    </div>
  )
}
