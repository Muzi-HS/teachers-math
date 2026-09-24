'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
import { menuAccess, Role } from '@/lib/permissions'
import { supabase } from '@/lib/supabase'
import { isUnreadParentComment } from '@/lib/records'
import { useMobileMode } from '@/context/MobileModeContext'

const NAV = [
  { key: 'dashboard', href: '/dashboard', label: '대시보드',
    icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
  { key: 'analytics', href: '/analytics', label: '접속 분석',
    icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M3 3v18h18"/><path d="M7 16l4-6 3 4 5-8"/></svg> },
  { key: 'notices', href: '/notices', label: '공지사항',
    icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg> },
  { key: 'schedule', href: '/schedule', label: '학원일정',
    icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> },
  { key: 'inquiries', href: '/inquiries', label: '문의하기',
    icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg> },
  { key: 'divider1', href: '', label: '', icon: null },
  { key: 'teachers', href: '/teachers', label: '선생님관리',
    icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg> },
  { key: 'attendance', href: '/attendance', label: '출근부',
    icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4"/></svg> },
  { key: 'divider1', href: '', label: '', icon: null },
  { key: 'students', href: '/students', label: '학생관리',
    icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg> },
  { key: 'classes', href: '/classes', label: '반관리',
    icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M19 21H5a2 2 0 01-2-2V7l7-4 7 4v12a2 2 0 01-2 2z"/><path d="M9 21V12h6v9"/></svg> },
  { key: 'records', href: '/records', label: '수업기록',
    icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01"/></svg> },
  { key: 'tests', href: '/tests', label: '테스트',
    icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg> },
  { key: 'stats', href: '/stats', label: '통계',
    icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 20V10M12 20V4M6 20v-6"/></svg> },
  { key: 'divider2', href: '', label: '', icon: null },
  { key: 'coupons', href: '/coupons', label: '쿠폰처리',
    icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 5H4a1 1 0 00-1 1v3a2 2 0 010 4v3a1 1 0 001 1h5m0-12h11a1 1 0 011 1v3a2 2 0 000 4v3a1 1 0 01-1 1H9m0-12v12"/></svg> },
  { key: 'consultations', href: '/consultations', label: '상담신청',
    icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg> },
  { key: 'app-qr', href: '/app-qr', label: '앱설치',
    icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM14 20h3M20 14v3M20 20v.01M17 17h.01"/></svg> },
  { key: 'site-settings', href: '/site-settings', label: '사이트 설정',
    icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg> },
]

const NAV_ORDER_KEY = 'admin_mobile_nav_order'
const RAIL_W = 58
const EXPANDED_W = 176

// 접혔을 때(아이콘 레일)는 좁은 폭에 맞춰 원래 라벨보다 짧은 이름으로 보여준다
const SHORT_LABEL: Record<string, string> = {
  'site-settings': '설정',
  analytics: '분석',
  notices: '공지',
  schedule: '일정',
  inquiries: '문의',
  teachers: '선생님',
  records: '기록',
  coupons: '쿠폰',
}

export default function Sidebar() {
  // 버튼으로 여닫는 대신, 마우스가 사이드바 위에 있는 동안만 넓게 펼쳐지는
  // supabase 스타일 호버 레일. 평소에는 아이콘만 보이는 좁은 레일로 있다가
  // 마우스가 올라오면 펼쳐지고, 벗어나면 다시 좁아진다.
  const [hovering, setHovering] = useState(false)
  const expanded = hovering
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [navOrder, setNavOrderState] = useState<string[]>([])
  const pathname = usePathname()
  const router   = useRouter()
  const { teacher, role, logout } = useAuth()
  const { mobileMode } = useMobileMode()
  const [unreadInquiries, setUnreadInquiries] = useState(0)
  const [unreadComments, setUnreadComments] = useState(0)
  const [unreadConsultations, setUnreadConsultations] = useState(0)

  useEffect(() => {
    if (role !== 'admin') return
    let cancelled = false
    async function fetchUnread() {
      const { count } = await supabase.from('consultation_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'new')
      if (!cancelled) setUnreadConsultations(count ?? 0)
    }
    fetchUnread()
    const iv = setInterval(fetchUnread, 60000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [role, pathname])

  useEffect(() => {
    if (role !== 'admin') return
    let cancelled = false
    async function fetchUnread() {
      const { count } = await supabase.from('inquiry_messages')
        .select('id', { count: 'exact', head: true })
        .eq('sender_type', 'parent').eq('is_read', false)
      if (!cancelled) setUnreadInquiries(count ?? 0)
    }
    fetchUnread()
    const iv = setInterval(fetchUnread, 60000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [role, pathname])

  useEffect(() => {
    if (role !== 'admin' && role !== 'teacher') return
    let cancelled = false
    async function fetchUnread() {
      const { data } = await supabase.from('records')
        .select('parent_comment,parent_comment_at,parent_comment_read_at')
        .eq('is_draft', false).not('parent_comment', 'is', null)
      if (!cancelled) setUnreadComments((data ?? []).filter(isUnreadParentComment).length)
    }
    fetchUnread()
    const iv = setInterval(fetchUnread, 60000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [role, pathname])

  // 모바일 모드에서는 메뉴 이동 시 자동으로 드로어/편집모드를 닫는다
  useEffect(() => { setDrawerOpen(false); setEditMode(false) }, [pathname])

  const visibleNav = role
    ? NAV.filter(item =>
        item.key.startsWith('divider') ||
        (menuAccess[item.key]?.(role as Role) ?? false)
      )
    : []

  // 모바일 하단바 순서 — 기기에 저장된 순서를 불러오고, 새로 추가되거나 권한이 바뀌어
  // 새로 보이는 메뉴는 뒤쪽에 자동으로 붙여준다
  useEffect(() => {
    if (!role) return
    const navOnly = visibleNav.filter(item => !item.key.startsWith('divider'))
    const defaultOrder = navOnly.map(i => i.key)
    let saved: string[] = []
    try { saved = JSON.parse(localStorage.getItem(NAV_ORDER_KEY) ?? '[]') } catch {}
    const savedValid = saved.filter(k => defaultOrder.includes(k))
    const merged = [...savedValid, ...defaultOrder.filter(k => !savedValid.includes(k))]
    setNavOrderState(merged)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role])

  function setNavOrder(updater: (prev: string[]) => string[]) {
    setNavOrderState(prev => {
      const next = updater(prev)
      try { localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  function moveNav(key: string, dir: -1 | 1) {
    setNavOrder(order => {
      const idx = order.indexOf(key)
      const newIdx = idx + dir
      if (idx < 0 || newIdx < 0 || newIdx >= order.length) return order
      const copy = [...order]
      ;[copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]]
      return copy
    })
  }

  function unreadCountOf(key: string) {
    return key === 'inquiries' ? unreadInquiries
      : key === 'records' ? unreadComments
      : key === 'consultations' ? unreadConsultations
      : 0
  }

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&family=Montserrat:wght@700;800&display=swap');
    .sb-tab {
      border: none; background: none; cursor: pointer;
      font-family: 'Noto Sans KR', sans-serif;
      color: var(--ui-text-2);
      display: flex; align-items: center;
      flex-shrink: 0; width: 100%;
      transition: color .15s, background .15s;
      position: relative;
    }
    .sb-tab:hover { color: var(--ui-primary); background: var(--ui-surface-2); }
    .sb-tab.active { color: var(--chrome-active-text); font-weight: 700; background: var(--chrome-active-bg); }
    .sb-tab.active::before {
      content: '';
      position: absolute; left: 2px;
      width: 3px; height: 18px;
      background: var(--ui-accent);
      border-radius: 3px;
    }
    .desktop-menu .sb-tab { border-radius: 8px; }
    .desktop-menu { scrollbar-width: thin; scrollbar-color: var(--ui-border) transparent; }
    @media(prefers-reduced-motion:reduce){.sb-tab{transition:none;}}
    .mnav-bar {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 200;
      background: var(--ui-surface); border-top: 1px solid var(--ui-border);
      box-shadow: 0 -2px 10px rgba(20,83,45,.05);
      display: flex; padding-bottom: env(safe-area-inset-bottom);
    }
    .mnav-tab {
      flex: 1; border: none; background: none; cursor: pointer;
      font-family: 'Noto Sans KR', sans-serif;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 3px; padding: 8px 2px 7px; color: var(--ui-text-2); position: relative;
    }
    .mnav-tab.active { color: var(--chrome-active-text); background: var(--chrome-active-bg); }
    .mnav-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 199;
    }
    .mnav-sheet {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 200;
      max-height: 70vh; background: var(--ui-surface);
      border-radius: 16px 16px 0 0;
      display: flex; flex-direction: column;
      box-shadow: 0 -8px 30px rgba(0,0,0,.2);
      overflow-y: auto;
      padding-bottom: env(safe-area-inset-bottom);
    }
    .mnav-edit-btn {
      border: none; background: var(--ui-surface-2); color: var(--ui-text-2); cursor: pointer;
      font-family: 'Noto Sans KR', sans-serif; font-size: 12px; font-weight: 600;
      padding: 5px 12px; border-radius: 20px;
    }
    .mnav-edit-row {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 18px; color: var(--ui-text);
    }
    .mnav-move-btn {
      border: 1px solid var(--ui-border); background: var(--ui-surface); color: var(--ui-text-2); cursor: pointer;
      width: 26px; height: 26px; border-radius: 6px;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .mnav-move-btn:disabled { opacity: .3; cursor: default; }
    .mnav-section-lb {
      padding: 10px 18px 4px; font-size: 11px; font-weight: 600; color: var(--ui-text-3); letter-spacing: .3px;
    }
  `

  function NavButton({ item, big }: { item: typeof NAV[number]; big?: boolean }) {
    const active = pathname === item.href || pathname.startsWith(item.href + '/')
    const unreadCount = unreadCountOf(item.key)
    return (
      <button
        className={`sb-tab${active ? ' active' : ''}`}
        aria-current={active ? 'page' : undefined}
        onClick={() => router.push(item.href)}
        title={!expanded && !big ? item.label : ''}
        style={
          big
            ? { height: 46, padding: '0 18px', gap: 12, justifyContent: 'flex-start' }
            : expanded
              ? { height: 42, padding: '0 16px', gap: 10, justifyContent: 'flex-start' }
              : { height: 48, justifyContent: 'center', flexDirection: 'column', gap: 3 }
        }
      >
        <span style={{ flexShrink: 0, display: 'flex', position: 'relative' }}>
          {item.icon}
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute', top: -3, right: -5,
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--ui-danger)', border: '1.5px solid var(--ui-surface)',
            }} />
          )}
        </span>
        {(big || expanded)
          ? <span style={{ fontSize: big ? 13 : 12, display: 'flex', alignItems: 'center', gap: 5 }}>
              {item.label}
              {unreadCount > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ui-danger)' }}>{unreadCount}</span>
              )}
            </span>
          : <span style={{ fontSize: 8, fontWeight: 600 }}>{SHORT_LABEL[item.key] ?? item.label}</span>
        }
      </button>
    )
  }

  if (mobileMode) {
    const navOnly = visibleNav.filter(item => !item.key.startsWith('divider'))
    const navByKey: Record<string, typeof NAV[number]> = {}
    for (const item of navOnly) navByKey[item.key] = item
    const orderedNav = navOrder.map(k => navByKey[k]).filter(Boolean)
    const primary = orderedNav.slice(0, 4)
    const rest = orderedNav.slice(4)
    const restActive = rest.some(item => pathname === item.href || pathname.startsWith(item.href + '/'))

    return (
      <>
        <style>{css}</style>
        <nav className="mnav-bar">
          {primary.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            const unreadCount = unreadCountOf(item.key)
            return (
              <button key={item.key} aria-current={active ? 'page' : undefined} className={`mnav-tab${active ? ' active' : ''}`} onClick={() => router.push(item.href)}>
                <span style={{ display: 'flex', position: 'relative' }}>
                  {item.icon}
                  {unreadCount > 0 && (
                    <span style={{ position: 'absolute', top: -3, right: -5, width: 8, height: 8, borderRadius: '50%', background: 'var(--ui-danger)', border: '1.5px solid var(--chrome-bg)' }} />
                  )}
                </span>
                <span style={{ fontSize: 10, fontWeight: active ? 700 : 500 }}>{item.label}</span>
              </button>
            )
          })}
          {rest.length > 0 && (
            <button className={`mnav-tab${restActive ? ' active' : ''}`} onClick={() => setDrawerOpen(o => !o)}>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
              </svg>
              <span style={{ fontSize: 10, fontWeight: restActive ? 700 : 500 }}>더보기</span>
            </button>
          )}
        </nav>
        {drawerOpen && (
          <>
            <div className="mnav-backdrop" onClick={() => { setDrawerOpen(false); setEditMode(false) }} />
            <nav className="mnav-sheet">
              <div style={{ padding: '14px 18px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ui-text)' }}>전체 메뉴</span>
                <button className="mnav-edit-btn" onClick={() => setEditMode(e => !e)}>{editMode ? '완료' : '편집'}</button>
              </div>

              {editMode ? (
                <>
                  <p style={{ padding: '4px 18px 8px', fontSize: 11, color: 'var(--ui-text-3)' }}>
                    화살표로 순서를 바꾸면 위 4개가 하단 메뉴바에 표시됩니다
                  </p>
                  {orderedNav.map((item, idx) => (
                    <div key={item.key}>
                      {idx === 0 && <div className="mnav-section-lb">하단 메뉴바</div>}
                      {idx === 4 && <div className="mnav-section-lb">더보기 목록</div>}
                      <div className="mnav-edit-row">
                        <span style={{ display: 'flex', flexShrink: 0 }}>{item.icon}</span>
                        <span style={{ flex: 1, fontSize: 13 }}>{item.label}</span>
                        <button className="mnav-move-btn" disabled={idx === 0} onClick={() => moveNav(item.key, -1)} aria-label="위로">
                          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M18 15l-6-6-6 6" /></svg>
                        </button>
                        <button className="mnav-move-btn" disabled={idx === orderedNav.length - 1} onClick={() => moveNav(item.key, 1)} aria-label="아래로">
                          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 9l6 6 6-6" /></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                rest.map(item => <NavButton key={item.key} item={item} big />)
              )}
            </nav>
          </>
        )}
      </>
    )
  }

  return (
    <>
      <style>{css}</style>
      {/* 좁은 폭만큼 자리를 항상 차지하는 스페이서 — 호버로 넓어져도 본문(main)이 밀리지 않게 한다 */}
      <div style={{ width: RAIL_W, flexShrink: 0, position: 'relative', height: '100%' }}>
        <aside
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          style={{
            position: 'absolute', top: 0, left: 0, bottom: 0,
            width: expanded ? EXPANDED_W : RAIL_W,
            background: 'var(--ui-surface)',
            borderRight: '1px solid var(--ui-border)',
            boxShadow: expanded ? '4px 0 16px rgba(0,0,0,.08)' : 'none',
            display: 'flex', flexDirection: 'column',
            padding: '10px 6px',
            transition: 'width .18s cubic-bezier(.4,0,.2,1)',
            overflow: 'visible',
            zIndex: 60,
          }}
        >
          {/* 메뉴 목록 */}
          <nav id="desktop-admin-menu" className="desktop-menu" aria-label="관리 메뉴" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {visibleNav.map((item, idx) => (
              item.key.startsWith('divider')
                ? (expanded ? <div key={idx} style={{ height: 1, flexShrink: 0, background: 'var(--ui-border)', margin: '8px 12px' }} /> : null)
                : <NavButton key={item.key} item={item} />
            ))}
          </nav>
        </aside>
      </div>
    </>
  )
}
