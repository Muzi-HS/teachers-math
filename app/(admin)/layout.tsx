'use client'
import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
import Sidebar from '@/components/Sidebar'
import { menuAccess, Role } from '@/lib/permissions'

const navy = '#0D2A5E', navyDk = '#071A3E'

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
        fontSize: 12, color: 'rgba(255,255,255,.5)',
        fontFamily: "'Noto Sans KR',sans-serif",
        padding: 0, transition: 'color .15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,.9)')}
      onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,.5)')}
    >
      로그아웃
    </button>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { teacher, role, loading } = useAuth()
  const router   = useRouter()
  const pathname = usePathname()

  // useRef로 초기화 여부 추적 — 리렌더에 영향 없음
  const initDone = useRef(false)

  // 1) 인증 체크 — loading/role이 바뀔 때만 실행
  useEffect(() => {
    if (loading) return
    if (!role || role === 'parent') {
      router.replace('/')
      return
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

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#F5F7FA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 36, height: 36, border: '3px solid #DDE3EE', borderTop: `3px solid ${navy}`, borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ fontSize: 13, color: '#4B5C7E' }}>로딩 중...</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (!role || role === 'parent') return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', fontFamily: "'Noto Sans KR',sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&family=Montserrat:wght@700;800&display=swap');`}</style>

      {/* 상단 헤더 */}
      <header style={{
        background: `linear-gradient(135deg, ${navyDk} 0%, ${navy} 100%)`,
        height: 52, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 20px',
        position: 'sticky', top: 0, zIndex: 100,
        boxShadow: '0 2px 8px rgba(0,0,0,.2)', flexShrink: 0,
      }}>
        {/* 왼쪽: 로고 · 학원명 · 배지 · 이름 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Image src="/logo.png" alt="로고" width={30} height={30} style={{ objectFit: 'contain', flexShrink: 0 }} />
          <span style={{ fontFamily: 'Montserrat,sans-serif', fontSize: 12, fontWeight: 800, color: '#fff', letterSpacing: .5 }}>
            TEACHERS MATH
          </span>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,.45)', background: 'rgba(255,255,255,.1)', padding: '2px 7px', borderRadius: 10 }}>
            {role === 'admin' ? '관리자' : '선생님'}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.85)' }}>
            {teacher?.name ?? ''}
          </span>
        </div>

        {/* 오른쪽: 로그아웃 */}
        <LogoutButton />
      </header>

      {/* 사이드바 + 본문 */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar />
        <main style={{ flex: 1, background: '#F5F7FA', overflowY: 'auto', minHeight: 0 }}>
          {children}
        </main>
      </div>
    </div>
  )
}
