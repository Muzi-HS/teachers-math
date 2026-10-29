'use client'
import { MobileModeProvider } from '@/context/MobileModeContext'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useResetMenuScroll } from '@/lib/use-reset-menu-scroll'
import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
import { requestFCMToken, isFCMSupported } from '@/lib/firebase'
import { NotificationSetupGuidance } from '@/components/NotificationSetupGuidance'
import { notificationSetupIssue } from '@/lib/notification-settings'
import ForegroundNotification from '@/components/ForegroundNotification'
import { StudentThemeProvider, useStudentTheme } from '@/context/StudentThemeContext'
import { isGiantsTheme, isUniversityTheme, UNIVERSITY_THEMES } from '@/lib/student-theme'
import UniversityEmblem from '@/components/UniversityEmblem'
import UniversityBrandPanel from '@/components/UniversityBrandPanel'
import './student-theme.css'

const navy='var(--ui-primary)', navyDk='var(--ui-primary)', bd='var(--ui-border)', bg='var(--ui-bg)', tx2='var(--ui-text-2)'

const NAV = [
  { href: '/student/home', label: '홈',
    icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="m3 11 9-8 9 8M5 10v10h14V10"/></svg> },
  { href: '/student/tests', label: '시험',
    icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="5" y="4" width="14" height="17" rx="2" strokeWidth={2}/><path d="M9 9h6M9 13h6M9 17h3" strokeWidth={2}/></svg> },
  { href: '/student/schedule', label: '학원일정',
    icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2" strokeWidth={2}/><path strokeWidth={2} d="M16 2v4M8 2v4M3 10h18"/></svg> },
  { href: '/student/notices', label: '공지',
    icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg> },
  { href: '/student/coupons', label: '쿠폰함',
    icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M9 5H4a1 1 0 00-1 1v3a2 2 0 010 4v3a1 1 0 001 1h5m0-12h11a1 1 0 011 1v3a2 2 0 000 4v3a1 1 0 01-1 1H9m0-12v12"/></svg> },
]

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return <div className="internal-ui" data-ui-theme="green" style={{ display: 'contents' }}>
    <StudentThemeProvider><MobileModeProvider><StudentLayoutContent>{children}</StudentLayoutContent></MobileModeProvider></StudentThemeProvider>
  </div>
}

function StudentLayoutContent({ children }: { children: React.ReactNode }) {
  const { student, role, loading, logout } = useAuth()
  const router   = useRouter()
  const pathname = usePathname()
  const { theme } = useStudentTheme()
  useResetMenuScroll(pathname)

  const [ready, setReady] = useState(false)
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | null>(null)
  const [notifBannerDismissed, setNotifBannerDismissed] = useState(false)
  const [notifRequesting, setNotifRequesting] = useState(false)

  // 시험 화면은 별도 API를 사용하므로 화면 코드만 미리 준비해 탭 전환 시간을 줄인다.
  useEffect(() => {
    if (student?.studentId) router.prefetch('/student/tests')
  }, [student?.studentId, router])

  const initDone = useRef(false)

  const registerFCMToken = useCallback(async (studentId: number, promptPermission = false): Promise<boolean> => {
    try {
      const token = await requestFCMToken(promptPermission)
      if (typeof Notification !== 'undefined') setNotifPerm(Notification.permission)
      if (!token || !student?.sessionToken) return false
      // session_token을 함께 보내서, Edge Function이 student_id를 그대로 믿지 않고
      // "이 토큰이 정말 이 studentId의 것인지" 서버에서 확인하게 한다.
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/register-fcm-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ student_id: studentId, token, session_token: student.sessionToken }),
        }
      )
      const data = await res.json()
      return res.ok && data.success === true
    } catch (e) {
      console.error('[FCM] 학생 토큰 등록 오류:', e)
      return false
    }
  }, [student])

  async function enableNotifications(): Promise<boolean> {
    if (!student?.studentId || notifRequesting) return false
    const issue = notificationSetupIssue()
    if (issue) { window.alert(issue); return false }
    setNotifRequesting(true)
    try { return await registerFCMToken(student.studentId, true) }
    finally { setNotifRequesting(false) }
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
    const timer = window.setTimeout(() => {
      initDone.current = true
      setReady(true)
      if (student?.studentId) void registerFCMToken(student.studentId)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loading, role, student, router, registerFCMToken])

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
  }, [student?.studentId, registerFCMToken])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return
    function onMessage(e: MessageEvent) {
      if (e.data?.type !== 'push-navigate' || !e.data.link) return
      if (e.data.link === window.location.pathname) window.location.reload()
      else router.push(e.data.link)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [router])

  useEffect(() => {
    if (!ready) return
    if (pathname === '/student') router.replace('/student/home')
  }, [pathname, ready, router])

  if (loading || !ready) return (
    <div style={{ minHeight: '100vh', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 36, height: 36, border: `3px solid ${bd}`, borderTop: `3px solid ${navy}`, borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ fontSize: 13, color: tx2 }}>로딩 중...</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (!role || role !== 'student') return null

  return (
    <div className="student-shell" data-student-theme={theme} data-student-screen={pathname} style={{ minHeight: '100vh', background: bg, fontFamily: "'Noto Sans KR',sans-serif", display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&family=Montserrat:wght@700;800&display=swap');
        * { box-sizing: border-box; }
        .student-main { padding-bottom: calc(88px + env(safe-area-inset-bottom)); }
        .student-nav { padding-bottom: env(safe-area-inset-bottom); height: calc(70px + env(safe-area-inset-bottom)); }
      `}</style>

      {/* 상단 헤더 */}
      <header className="student-header" style={{
        background: 'var(--student-card-bg, #fff)', borderBottom: '1px solid #EBF0EC',
        padding: '0 20px', height: 62,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
          <Image src="/logo.png" alt="로고" width={24} height={24} style={{ objectFit: 'contain', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--student-203f30, #203f30)', letterSpacing: -.2, flexShrink: 0, whiteSpace: 'nowrap' }}>
            티처스 수학학원
          </span>
          {isGiantsTheme(theme) && <span className="student-giants-badge">GIANTS</span>}
          {isUniversityTheme(theme) && <span className="student-university-badge"><UniversityEmblem theme={theme} />{UNIVERSITY_THEMES[theme].short}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <button className="student-theme-entry" onClick={() => router.push('/student/themes')} aria-label={`${student?.name ?? ''} 학생, 내 테마 선택`}>{student?.name ?? ''} 학생</button>
          <button
            onClick={logout} aria-label="로그아웃"
            style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--student-819085, #819085)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '50%' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
          </button>
        </div>
      </header>

      {/* 본문 */}
      <main className="student-main" style={{ flex: 1, padding: '16px 16px calc(88px + env(safe-area-inset-bottom))', maxWidth: 640, width: '100%', margin: '0 auto' }}>
        {notifPerm && notifPerm !== 'granted' && !notifBannerDismissed && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'var(--ui-warning-bg)', border: '1px solid var(--ui-warning)', borderRadius: 12,
            padding: '12px 14px', marginBottom: 14,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: navyDk }}>
                {notifPerm === 'denied' ? '알림이 차단되어 있어요' : '알림을 켜주세요'}
              </p>
              <p style={{ margin: '3px 0 0', fontSize: 11.5, color: tx2, lineHeight: 1.5 }}>
                <NotificationSetupGuidance permission={notifPerm} />
              </p>
            </div>
            {notifPerm !== 'denied' && (
              <button onClick={enableNotifications} disabled={notifRequesting} style={{
                flexShrink: 0, border: 'none', borderRadius: 8, padding: '8px 14px',
                background: navy, color: 'var(--student-card-bg, #fff)', fontWeight: 700, fontSize: 12,
                cursor: notifRequesting ? 'not-allowed' : 'pointer', opacity: notifRequesting ? .7 : 1,
                fontFamily: 'inherit',
              }}>{notifRequesting ? '확인 중...' : '알림 켜기'}</button>
            )}
            <button onClick={dismissNotifBanner} aria-label="닫기" style={{
              flexShrink: 0, border: 'none', background: 'var(--ui-surface-2)',
              color: navyDk, borderRadius: '50%', width: 24, height: 24,
              cursor: 'pointer', fontSize: 14, lineHeight: 1,
            }}>×</button>
          </div>
        )}
        {isUniversityTheme(theme) && pathname === '/student/home' && <UniversityBrandPanel theme={theme} />}
        {children}
      </main>

      {/* 하단 탭바 */}
      <nav className="student-nav" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        background: 'var(--student-card-bg, #fff)', borderTop: '1px solid #E2EAE3',
        display: 'flex',
      }}>
        {NAV.map(item => {
          const active = pathname.startsWith(item.href)
          return (
            <button key={item.href} onClick={() => router.push(item.href)} style={{
              flex: 1, display: 'flex', flexDirection: 'column', position: 'relative',
              alignItems: 'center', justifyContent: 'center', gap: 6,
              height: 70,
              background: 'none', border: 'none', cursor: 'pointer',
              color: active ? 'var(--student-23633f, #23633f)' : 'var(--student-819085, #819085)',
              fontFamily: "'Noto Sans KR',sans-serif",
              transition: 'color .15s',
            }}>
              {active && <span style={{ position: 'absolute', top: 0, width: 18, height: 2, background: 'var(--student-23633f, #23633f)', borderRadius: '0 0 2px 2px' }} />}
              <span style={{ color: active ? 'var(--student-23633f, #23633f)' : 'var(--student-819085, #819085)', display: 'flex' }}>{item.icon}</span>
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 400 }}>{item.label}</span>
            </button>
          )
        })}
      </nav>
      <ForegroundNotification />
    </div>
  )
}
