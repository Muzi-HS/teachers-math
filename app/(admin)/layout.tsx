'use client'
import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { requestFCMToken } from '@/lib/firebase'
import ForegroundNotification from '@/components/ForegroundNotification'
import Sidebar from '@/components/Sidebar'
import { menuAccess, Role } from '@/lib/permissions'
import { MobileModeProvider, useMobileMode } from '@/context/MobileModeContext'
import { IconSmartphone } from '@/components/icons'
import ThemeToggle from '@/components/ui/ThemeToggle'
import { InternalThemeProvider } from '@/context/InternalThemeContext'

// 관리자용 FCM 토큰 등록 — 학부모(register-fcm-token 엣지함수)와 달리 관리자는 Supabase Auth
// 세션이 있어 RLS(본인 user_id만)로 바로 보호되므로 클라이언트에서 직접 upsert한다.
async function registerAdminFCMToken(userId: string) {
  try {
    const token = await requestFCMToken()
    if (!token) return
    await supabase.from('admin_fcm_tokens').delete().eq('user_id', userId)
    await supabase.from('admin_fcm_tokens').insert({ user_id: userId, token })
  } catch (e) {
    console.error('[FCM] 관리자 토큰 등록 오류:', e)
  }
}

function pathToMenuKey(pathname: string): string | null {
  return pathname.split('/').filter(Boolean)[0] ?? null
}

function LogoutButton() {
  const { logout } = useAuth()
  return (
    <button
      onClick={logout}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        fontSize: 12, color: 'var(--chrome-text-2)',
        fontFamily: "'Noto Sans KR',sans-serif",
        padding: 0, transition: 'color .15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,.9)')}
      onMouseLeave={e => (e.currentTarget.style.color = 'var(--chrome-text-2)')}
    >
      로그아웃
    </button>
  )
}

function MobileModeToggle() {
  const { mobileMode, isMobileScreen, setMobileMode } = useMobileMode()
  if (isMobileScreen) return null
  if (mobileMode) {
    return (
      <button
        onClick={() => setMobileMode(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'rgba(255,255,255,.14)', border: 'none', borderRadius: 20,
          cursor: 'pointer', padding: '4px 10px',
          fontSize: 11, fontWeight: 600, color: '#fff',
          fontFamily: "'Noto Sans KR',sans-serif",
        }}
      >
        <IconSmartphone size={12} /> 미리보기 종료
      </button>
    )
  }
  return (
    <button
      onClick={() => setMobileMode(true)}
      title="모바일 화면 미리보기"
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        background: 'none', border: 'none', cursor: 'pointer',
        fontSize: 12, color: 'var(--chrome-text-2)',
        fontFamily: "'Noto Sans KR',sans-serif",
        padding: 0, transition: 'color .15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,.85)')}
      onMouseLeave={e => (e.currentTarget.style.color = 'var(--chrome-text-2)')}
    >
      <IconSmartphone size={12} /> 모바일 미리보기
    </button>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <InternalThemeProvider><MobileModeProvider>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </MobileModeProvider></InternalThemeProvider>
  )
}

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const { teacher, role, loading } = useAuth()
  const { mobileMode } = useMobileMode()
  const router   = useRouter()
  const pathname = usePathname()

  // useRef로 초기화 여부 추적 — 리렌더에 영향 없음
  const initDone = useRef(false)

  // 1) 인증 체크 — loading/role이 바뀔 때만 실행
  useEffect(() => {
    if (loading) return
    if (!role || role === 'parent' || role === 'student') {
      router.replace('/')
      return
    }
    if (!initDone.current && role === 'admin' && teacher?.userId) {
      registerAdminFCMToken(teacher.userId)
    }
    initDone.current = true
  }, [loading, role])

  // 2) 메뉴 접근 권한 체크 — pathname이 바뀔 때만 실행
  useEffect(() => {
    if (!initDone.current) return
    const key = pathToMenuKey(pathname)
    if (key && menuAccess[key] && !menuAccess[key](role as Role)) {
      router.replace('/attendance')
    }
  }, [pathname])

  // 사용자가 백그라운드 알림을 직접 클릭한 경우에만 해당 메뉴로 이동한다.
  // 앱 사용 중 수신한 알림은 ForegroundNotification에서 입력 내용을 유지하며 표시한다.
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
  }, [router])

  if (loading) return (
    <div style={{ height: '100dvh', background: 'var(--ui-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 36, height: 36, border: '3px solid var(--ui-border)', borderTop: '3px solid var(--ui-primary)', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ fontSize: 13, color: 'var(--ui-text-2)' }}>로딩 중...</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (!role || role === 'parent' || role === 'student') return null

  return (
    <div className="admin-shell" style={{ display: 'flex', flexDirection: 'column', height: '100dvh', fontFamily: "'Noto Sans KR',sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&family=Montserrat:wght@700;800&display=swap');`}</style>

      {/* 상단 헤더 */}
      <header style={{
        background: 'var(--chrome-bg)',
        height: 52, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 20px',
        borderBottom: '1px solid var(--chrome-border)',
        zIndex: 100, flexShrink: 0,
      }}>
        {/* 왼쪽: 로고 · 학원명 · 배지 · 이름 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, overflow: 'hidden' }}>
          <Image src="/logo.png" alt="로고" width={30} height={30} style={{ objectFit: 'contain', flexShrink: 0 }} />
          {!mobileMode && (
            <span style={{ fontFamily: 'Montserrat,sans-serif', fontSize: 12, fontWeight: 800, color: '#fff', letterSpacing: .5 }}>
              TEACHERS MATH
            </span>
          )}
          <span style={{ fontSize: 11, color: 'var(--chrome-text-2)', background: 'rgba(255,255,255,.1)', padding: '2px 7px', borderRadius: 10, flexShrink: 0 }}>
            {role === 'admin' ? '관리자' : role === 'assistant' ? '조교' : '선생님'}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.85)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {teacher?.name ?? ''}
          </span>
        </div>

        {/* 오른쪽: 모바일 전환 · 로그아웃 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {!mobileMode && <ThemeToggle />}
          <MobileModeToggle />
          <LogoutButton />
        </div>
      </header>

      {/* 사이드바 + 본문 */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {!mobileMode && <Sidebar />}
        <main style={{ flex: 1, background: 'var(--ui-bg)', overflowY: 'auto', minHeight: 0, minWidth: 0, paddingBottom: mobileMode ? 'env(safe-area-inset-bottom)' : 0 }}>
          {children}
        </main>
      </div>
      {mobileMode && <Sidebar />}
      <ForegroundNotification />
    </div>
  )
}
