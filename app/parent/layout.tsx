'use client'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { requestFCMToken, onForegroundMessage, isFCMSupported } from '@/lib/firebase'

const navy='#0D2A5E', navyDk='#071A3E', bd='#DDE3EE', bg='#F5F7FA', tx2='#4B5C7E', tx3='#96A4BF'

// ── 자녀 선택 Context ──
type Child = { id: number; name: string; birth_year: number; school: string }
type ParentChildCtx = {
  selChild: number | null
  setSelChild: (id: number) => void
  children: Child[]
}
export const ParentChildContext = createContext<ParentChildCtx>({
  selChild: null,
  setSelChild: () => {},
  children: [],
})
export function useParentChild() {
  return useContext(ParentChildContext)
}

const NAV = [
  { href: '/parent/records', label: '수업기록',
    icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg> },
  { href: '/parent/notices', label: '공지사항',
    icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg> },
  { href: '/parent/events', label: '학원일정',
    icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2" strokeWidth={2}/><path strokeWidth={2} d="M16 2v4M8 2v4M3 10h18"/></svg> },
  { href: '/parent/inquiries', label: '문의하기',
    icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg> },
]

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  const { parent, role, loading, logout } = useAuth()
  const router   = useRouter()
  const pathname = usePathname()

  const [selChild, setSelChild] = useState<number | null>(null)
  const [ready,    setReady]    = useState(false)

  // 알림 권한 배너 — 토큰이 없으면(=권한 미허용) 매 세션마다 다시 안내
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | null>(null)
  const [notifBannerDismissed, setNotifBannerDismissed] = useState(false)
  const [notifRequesting, setNotifRequesting] = useState(false)

  // useRef로 초기화 여부 추적 — 리렌더에 영향 없음
  const initDone = useRef(false)

  async function registerFCMToken(parentId: number) {
    try {
      console.log('[FCM] 토큰 등록 시작, parentId:', parentId)
      const token = await requestFCMToken()
      console.log('[FCM] 토큰 발급 결과:', token ? '성공' : '실패(null)')
      if (typeof Notification !== 'undefined') setNotifPerm(Notification.permission)
      if (!token) return

      // register-fcm-token Edge Function 호출 (기존 토큰 삭제 후 새 토큰 저장)
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/register-fcm-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ parent_id: parentId, token }),
        }
      )
      const data = await res.json()
      if (data.success) console.log('[FCM] DB 저장 성공')
      else console.error('[FCM] DB 저장 실패:', data.error)
    } catch (e) {
      console.error('[FCM] 토큰 등록 오류:', e)
    }
  }

  // 배너의 "알림 켜기" 버튼 — 권한이 아직 결정 안 됐으면(default) 다시 허용 팝업을 띄운다
  // (브라우저는 한 번 "차단"된 권한은 JS로 다시 물어볼 수 없어 안내 문구로 대체)
  async function enableNotifications() {
    if (!parent?.parentId || notifRequesting) return
    setNotifRequesting(true)
    await registerFCMToken(parent.parentId)
    setNotifRequesting(false)
  }

  function dismissNotifBanner() {
    try { sessionStorage.setItem('notifBannerDismissed', '1') } catch {}
    setNotifBannerDismissed(true)
  }

  useEffect(() => {
    if (loading) return

    // 비로그인 또는 학부모 아닌 경우 → 로그인 페이지로
    if (!role || role !== 'parent') {
      router.replace('/')
      return
    }

    // 이미 초기화됐으면 추가 로직 없음
    if (initDone.current) return
    initDone.current = true

    // 자녀 1명이면 자동 선택
    if (parent?.children?.length === 1) {
      setSelChild(parent.children[0].id)
    }

    // FCM 토큰 등록 (백그라운드)
    if (parent?.parentId) {
      registerFCMToken(parent.parentId)
    }

    setReady(true)
  }, [loading, role, parent])

  // 알림 권한 배너 표시 여부 — 세션마다 다시 확인해서, 꺼둔 채 다음에 들어와도 다시 안내한다
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

  // 토큰 등록은 앱 최초 진입 시 딱 한 번만 시도된다. 거부(denied) 상태였다가
  // 앱을 새로고침/재실행하지 않고 휴대폰 설정에서 바로 "허용"으로 바꾸고 돌아오면
  // 이 변경을 감지할 방법이 없어 토큰이 끝내 등록되지 않아 "발송 실패"가 계속 나던 문제.
  // 화면으로 다시 돌아올 때마다 권한을 다시 확인해서, 방금 허용으로 바뀌었으면 등록을 재시도한다.
  const notifPermRef = useRef<NotificationPermission | null>(null)
  useEffect(() => { notifPermRef.current = notifPerm }, [notifPerm])
  useEffect(() => {
    if (typeof document === 'undefined' || typeof Notification === 'undefined') return
    function recheck() {
      if (document.visibilityState !== 'visible') return
      const current = Notification.permission
      if (current === notifPermRef.current) return
      setNotifPerm(current)
      if (current === 'granted' && notifPermRef.current !== 'granted' && parent?.parentId) {
        registerFCMToken(parent.parentId)
      }
    }
    document.addEventListener('visibilitychange', recheck)
    window.addEventListener('focus', recheck)
    return () => {
      document.removeEventListener('visibilitychange', recheck)
      window.removeEventListener('focus', recheck)
    }
  }, [parent?.parentId])

  // 알림 클릭(백그라운드) 또는 앱이 열려있는 중에 푸시 수신(포그라운드) 시
  // 해당 메뉴로 바로 이동 — 이미 그 페이지에 머물러 있으면 router.push는 아무 효과가
  // 없으므로(리마운트 안 됨) 새로고침으로 강제 리마운트시켜 읽음 처리가 정상 실행되게 한다
  function navigateToLink(link: string) {
    if (link === window.location.pathname) window.location.reload()
    else router.push(link)
  }

  // 백그라운드(앱이 닫혀있거나 다른 탭)에서 알림을 클릭했을 때 — 서비스워커가 보내는 이동 요청 처리
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return
    function onMessage(e: MessageEvent) {
      if (e.data?.type !== 'push-navigate' || !e.data.link) return
      navigateToLink(e.data.link)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [router])

  // 포그라운드(앱을 이미 보고 있는 중)에 알림이 도착했을 때 — 배경 알림과 동일하게 바로 이동
  // (포그라운드 메시지는 OS 알림 배너 없이 SDK로만 전달되므로 별도 처리 필요)
  useEffect(() => {
    let unsub: (() => void) | undefined
    onForegroundMessage(payload => {
      const link: string | undefined = payload?.data?.link
      if (link) navigateToLink(link)
    }).then(fn => { unsub = fn })
    return () => { if (typeof unsub === 'function') unsub() }
  }, [router])

  // /parent 루트 접근 시 수업기록으로 리다이렉트 (별도 effect, pathname만 의존)
  useEffect(() => {
    if (!ready) return
    if (pathname === '/parent') {
      router.replace('/parent/records')
    }
  }, [pathname, ready])

  if (loading || !ready) return (
    <div style={{ minHeight: '100vh', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 36, height: 36, border: '3px solid #DDE3EE', borderTop: `3px solid ${navy}`, borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ fontSize: 13, color: tx2 }}>로딩 중...</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (!role || role !== 'parent') return null

  const childList = parent?.children ?? []

  return (
    <div style={{ minHeight: '100vh', background: bg, fontFamily: "'Noto Sans KR',sans-serif", display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&family=Montserrat:wght@700;800&display=swap');
        * { box-sizing: border-box; }
        .parent-main { padding-bottom: calc(80px + env(safe-area-inset-bottom)); }
        .parent-nav { padding-bottom: env(safe-area-inset-bottom); height: calc(62px + env(safe-area-inset-bottom)); }
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
            학부모
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

      {/* 자녀 선택 탭 (다자녀인 경우만) */}
      {childList.length > 1 && (
        <div style={{ background: '#fff', borderBottom: `1px solid ${bd}`, padding: '8px 16px', display: 'flex', gap: 8, overflowX: 'auto', flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: tx3, alignSelf: 'center', flexShrink: 0 }}>자녀:</span>
          {childList.map(c => (
            <button key={c.id} onClick={() => setSelChild(c.id)} style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 13,
              fontWeight: selChild === c.id ? 700 : 400,
              border: `1.5px solid ${selChild === c.id ? navy : bd}`,
              background: selChild === c.id ? navy : '#fff',
              color: selChild === c.id ? '#fff' : tx2,
              cursor: 'pointer', fontFamily: "'Noto Sans KR',sans-serif",
              flexShrink: 0, transition: 'all .15s', whiteSpace: 'nowrap',
            }}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* 본문 */}
      <main className="parent-main" style={{ flex: 1, padding: '16px 16px 80px', maxWidth: 640, width: '100%', margin: '0 auto' }}>
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
                  ? '수업기록·공지사항 알림을 받으려면 휴대폰 설정 → 이 앱(또는 브라우저)의 알림 권한을 허용으로 바꿔주세요.'
                  : '수업기록이 등록되거나 공지사항이 올라오면 바로 알려드려요.'}
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
        <ParentChildContext.Provider value={{ selChild, setSelChild, children: childList }}>
          {children}
        </ParentChildContext.Provider>
      </main>

      {/* 하단 탭바 */}
      <nav className="parent-nav" style={{
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
    </div>
  )
}
