'use client'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { requestFCMToken, onForegroundMessage } from '@/lib/firebase'

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
  { href: '/parent/notices', label: '공지사항',
    icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg> },
  { href: '/parent/events', label: '학원일정',
    icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2" strokeWidth={2}/><path strokeWidth={2} d="M16 2v4M8 2v4M3 10h18"/></svg> },
  { href: '/parent/records', label: '수업기록',
    icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg> },
]

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  const { parent, role, loading, logout } = useAuth()
  const router   = useRouter()
  const pathname = usePathname()

  const [selChild, setSelChild] = useState<number | null>(null)
  const [ready,    setReady]    = useState(false)

  // useRef로 초기화 여부 추적 — 리렌더에 영향 없음
  const initDone = useRef(false)

  async function registerFCMToken(parentId: number) {
    try {
      console.log('[FCM] 토큰 등록 시작, parentId:', parentId)
      const token = await requestFCMToken()
      console.log('[FCM] 토큰 발급 결과:', token ? '성공' : '실패(null)')
      if (!token) return

      const { error } = await supabase.functions.invoke('register-fcm-token', {
        body: { parent_id: parentId, token },
      })
      if (error) {
        console.error('[FCM] DB 저장 실패:', error)
      } else {
        console.log('[FCM] DB 저장 성공')
      }
    } catch (e) {
      console.error('[FCM] 토큰 등록 오류:', e)
    }
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

  // /parent 루트 접근 시 공지로 리다이렉트 (별도 effect, pathname만 의존)
  useEffect(() => {
    if (!ready) return
    if (pathname === '/parent') {
      router.replace('/parent/notices')
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
