'use client'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useResetMenuScroll } from '@/lib/use-reset-menu-scroll'
import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
import { requestFCMToken, isFCMSupported } from '@/lib/firebase'
import ForegroundNotification from '@/components/ForegroundNotification'
import { MobileModeProvider } from '@/context/MobileModeContext'
import { supabase } from '@/lib/supabase'

const navy='var(--ui-primary)', navyDk='var(--ui-primary)', bd='var(--ui-border)', bg='var(--ui-bg)', tx2='var(--ui-text-2)'

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
  { href: '/parent/home', label: '홈',
    icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="m3 11 9-8 9 8M5 10v10h14V10"/></svg> },
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
  // 학부모 화면은 테마 선택 없이 그린 테마로 고정한다 (관리자 화면의 InternalThemeProvider/
  // localStorage 토글을 상속하지 않도록 data-ui-theme을 직접 "green"으로 박아둔다).
  return <div className="internal-ui" data-ui-theme="green" style={{ display: 'contents' }}>
    <MobileModeProvider><ParentLayoutContent>{children}</ParentLayoutContent></MobileModeProvider>
  </div>
}

function ParentLayoutContent({ children }: { children: React.ReactNode }) {
  const { parent, role, loading, logout } = useAuth()
  const router   = useRouter()
  const pathname = usePathname()
  useResetMenuScroll(pathname)

  const [selChild, setSelChild] = useState<number | null>(null)
  const [ready,    setReady]    = useState(false)
  const [unreadNotices, setUnreadNotices] = useState(0)

  // 진짜 "안 읽음" 개수는 서버에서 SECURITY DEFINER로 계산한다(client_unread_notice_count).
  // notice_reads 테이블은 anon 직접 SELECT 정책이 보안 강화 과정에서 제거되어(스태프 전용),
  // 브라우저에서 anon 키로 이 테이블을 직접 조회하면 항상 빈 결과만 받아서 공지를 읽어도
  // 배지가 절대 사라지지 않는 문제가 있었다 — client_mark_notice_read와 같은 방식으로
  // 서버 쪽 RPC가 개수를 계산해서 돌려주도록 바꿨다. 공지 화면은 페이지 이동 없이 그
  // 자리에서 읽음 처리를 하므로, pathname 변화뿐 아니라 그 화면이 쏘는 'notice-read'
  // 이벤트로도 다시 계산해서 종 배지가 바로 갱신되게 한다.
  useEffect(() => {
    if (!parent?.sessionToken || !parent.children || parent.children.length === 0) {
      const timer = window.setTimeout(() => setUnreadNotices(0), 0)
      return () => window.clearTimeout(timer)
    }
    let cancelled = false
    function checkUnread() {
      supabase.rpc('client_unread_notice_count', { p_token: parent!.sessionToken }).then(({ data, error }) => {
        if (cancelled || error) return
        setUnreadNotices((data as number) ?? 0)
      })
    }
    checkUnread()
    window.addEventListener('notice-read', checkUnread)
    return () => { cancelled = true; window.removeEventListener('notice-read', checkUnread) }
  }, [parent, pathname])

  // 문의하기 안 읽음 개수 — 문의 메시지에는 서버 쪽 읽음 표시가 없어서, 마지막으로
  // "문의하기" 탭을 연 시각(로컬 저장, parentId별)보다 최근에 온 "선생님" 답장 수를
  // 안 읽은 개수로 센다. 문의 탭에 들어가면(app/parent/inquiries/page.tsx) 그 시각을
  // 지금으로 갱신하고 'inquiry-read' 이벤트를 쏴서 여기서 바로 다시 계산한다.
  const [unreadInquiries, setUnreadInquiries] = useState(0)
  useEffect(() => {
    if (!parent?.sessionToken || !parent.parentId) {
      const timer = window.setTimeout(() => setUnreadInquiries(0), 0)
      return () => window.clearTimeout(timer)
    }
    let cancelled = false
    function checkUnread() {
      supabase.rpc('client_inquiry_messages', { p_token: parent!.sessionToken }).then(({ data }) => {
        if (cancelled) return
        const msgs = (data ?? []) as { sender_type: 'parent' | 'admin'; created_at: string }[]
        let seen = ''
        try { seen = localStorage.getItem(`parent_inquiries_seen_${parent!.parentId}`) ?? '' } catch {}
        const unread = msgs.filter(m => m.sender_type === 'admin' && (!seen || m.created_at > seen)).length
        setUnreadInquiries(unread)
      })
    }
    checkUnread()
    window.addEventListener('inquiry-read', checkUnread)
    return () => { cancelled = true; window.removeEventListener('inquiry-read', checkUnread) }
  }, [parent, pathname])

  // 알림 권한 배너 — 토큰이 없으면(=권한 미허용) 매 세션마다 다시 안내
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | null>(null)
  const [notifBannerDismissed, setNotifBannerDismissed] = useState(false)
  const [notifRequesting, setNotifRequesting] = useState(false)

  // useRef로 초기화 여부 추적 — 리렌더에 영향 없음
  const initDone = useRef(false)

  const registerFCMToken = useCallback(async (parentId: number) => {
    try {
      console.log('[FCM] 토큰 등록 시작, parentId:', parentId)
      const token = await requestFCMToken()
      console.log('[FCM] 토큰 발급 결과:', token ? '성공' : '실패(null)')
      if (typeof Notification !== 'undefined') setNotifPerm(Notification.permission)
      if (!token) return

      if (!parent?.sessionToken) return
      // register-fcm-token Edge Function 호출 (기존 토큰 삭제 후 새 토큰 저장)
      // session_token을 함께 보내서, Edge Function이 parent_id를 그대로 믿지 않고
      // "이 토큰이 정말 이 parentId의 것인지" 서버에서 확인하게 한다.
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/register-fcm-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ parent_id: parentId, token, session_token: parent.sessionToken }),
        }
      )
      const data = await res.json()
      if (data.success) console.log('[FCM] DB 저장 성공')
      else console.error('[FCM] DB 저장 실패:', data.error)
    } catch (e) {
      console.error('[FCM] 토큰 등록 오류:', e)
    }
  }, [parent])

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
    // Mark initialization after the scheduled update so a cancelled effect can retry.

    // 자녀 1명이면 자동 선택
    const onlyChildId = parent?.children?.length === 1 ? parent.children[0].id : null

    // FCM 토큰 등록 (백그라운드)
    const timer = window.setTimeout(() => {
      initDone.current = true
      if (onlyChildId != null) setSelChild(onlyChildId)
      setReady(true)
      if (parent?.parentId) void registerFCMToken(parent.parentId)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loading, role, parent, router, registerFCMToken])

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
  }, [parent?.parentId, registerFCMToken])

  // 사용자가 백그라운드 알림을 직접 클릭한 경우에만 해당 메뉴로 이동한다.
  // 앱 사용 중 수신한 알림은 ForegroundNotification에서 입력 내용을 유지하며 표시한다.
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

  // /parent 루트 접근 시 홈으로 리다이렉트 (별도 effect, pathname만 의존)
  useEffect(() => {
    if (!ready) return
    if (pathname === '/parent') {
      router.replace('/parent/home')
    }
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

  if (!role || role !== 'parent') return null

  const childList = parent?.children ?? []

  return (
    <div style={{ minHeight: '100vh', background: bg, fontFamily: "'Noto Sans KR',sans-serif", display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&family=Montserrat:wght@700;800&display=swap');
        * { box-sizing: border-box; }
        .parent-main { padding-bottom: calc(88px + env(safe-area-inset-bottom)); }
        .parent-nav { padding-bottom: env(safe-area-inset-bottom); height: calc(70px + env(safe-area-inset-bottom)); }
      `}</style>

      {/* 상단 헤더 */}
      <header style={{
        background: '#fff', borderBottom: '1px solid #EBF0EC',
        padding: '0 20px', height: 62,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
          <Image src="/logo.png" alt="로고" width={24} height={24} style={{ objectFit: 'contain', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#203F30', letterSpacing: -.2, flexShrink: 0, whiteSpace: 'nowrap' }}>
            티처스 수학학원
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: '#627668', whiteSpace: 'nowrap' }}>{childList.find(c => c.id === selChild)?.name ?? ''} 학부모님</span>
          <button
            onClick={logout} aria-label="로그아웃"
            style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#819085', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '50%' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
          </button>
        </div>
      </header>

      {/* 자녀 선택 탭 (다자녀인 경우만) */}
      {childList.length > 1 && (
        <div style={{ background: '#fff', borderBottom: '1px solid #EBF0EC', padding: '10px 16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 4, background: '#E9EFEA', padding: 4, borderRadius: 9, maxWidth: 640, margin: '0 auto' }}>
            {childList.map(c => (
              <button key={c.id} onClick={() => setSelChild(c.id)} style={{
                flex: 1, minWidth: 0, minHeight: 40, border: 0, borderRadius: 6, fontSize: 12,
                fontWeight: selChild === c.id ? 700 : 500,
                background: selChild === c.id ? '#fff' : 'transparent',
                color: selChild === c.id ? '#1C5939' : '#667C6D',
                boxShadow: selChild === c.id ? '0 1px 4px rgba(28,89,57,.04)' : 'none',
                cursor: 'pointer', fontFamily: "'Noto Sans KR',sans-serif", whiteSpace: 'nowrap',
              }}>
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 본문 */}
      <main className="parent-main" style={{ flex: 1, padding: '16px 16px calc(88px + env(safe-area-inset-bottom))', maxWidth: 640, width: '100%', margin: '0 auto' }}>
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
              flexShrink: 0, border: 'none', background: 'var(--ui-surface-2)',
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
        background: '#fff', borderTop: '1px solid #E2EAE3',
        display: 'flex',
      }}>
        {NAV.map(item => {
          const active = pathname.startsWith(item.href)
          const badge = item.href === '/parent/notices' ? unreadNotices
            : item.href === '/parent/inquiries' ? unreadInquiries
            : 0
          return (
            <button key={item.href} onClick={() => router.push(item.href)} style={{
              flex: 1, display: 'flex', flexDirection: 'column', position: 'relative',
              alignItems: 'center', justifyContent: 'center', gap: 6,
              height: 70,
              background: 'none', border: 'none', cursor: 'pointer',
              color: active ? '#23633F' : '#819085',
              fontFamily: "'Noto Sans KR',sans-serif",
              transition: 'color .15s',
            }}>
              {active && <span style={{ position: 'absolute', top: 0, width: 18, height: 2, background: '#23633F', borderRadius: '0 0 2px 2px' }} />}
              <span style={{ position: 'relative', color: active ? '#23633F' : '#819085', display: 'flex' }}>
                {item.icon}
                {badge > 0 && <span style={{
                  position: 'absolute', top: -4, right: -8, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8,
                  background: '#E4574A', color: '#fff', fontSize: 9, fontWeight: 700, lineHeight: '16px', textAlign: 'center',
                }}>{badge > 99 ? '99+' : badge}</span>}
              </span>
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 400 }}>{item.label}</span>
            </button>
          )
        })}
      </nav>
      <ForegroundNotification />
    </div>
  )
}
