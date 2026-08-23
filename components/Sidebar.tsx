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
  { key: 'app-qr', href: '/app-qr', label: '앱 설치 QR',
    icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM14 20h3M20 14v3M20 20v.01M17 17h.01"/></svg> },
]

const NAV_ORDER_KEY = 'admin_mobile_nav_order'

export default function Sidebar() {
  const [expanded, setExpanded] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [navOrder, setNavOrderState] = useState<string[]>([])
  const pathname = usePathname()
  const router   = useRouter()
  const { teacher, role, logout } = useAuth()
  const { mobileMode } = useMobileMode()
  const [unreadInquiries, setUnreadInquiries] = useState(0)
  const [unreadComments, setUnreadComments] = useState(0)

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

  const W = expanded ? 130 : 58

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
    return key === 'inquiries' ? unreadInquiries : key === 'records' ? unreadComments : 0
  }

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&family=Montserrat:wght@700;800&display=swap');
    .sb-tab {
      border: none; background: none; cursor: pointer;
      font-family: 'Noto Sans KR', sans-serif;
      color: #96A4BF;
      display: flex; align-items: center;
      flex-shrink: 0; width: 100%;
      transition: color .15s;
      position: relative;
    }
    .sb-tab:hover { color: #4B5C7E; }
    .sb-tab.active { color: #0D2A5E; font-weight: 700; }
    .sb-tab.active::before {
      content: '';
      position: absolute; left: 0;
      width: 3px; height: 24px;
      background: #D87E13;
      border-radius: 0 3px 3px 0;
    }
    .toggle-btn {
      position: absolute; right: -11px; top: 16px;
      width: 22px; height: 44px;
      background: #fff; border: 1px solid #EEF0F5; border-left: none;
      border-radius: 0 8px 8px 0;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      box-shadow: 3px 0 6px rgba(0,0,0,.07); z-index: 10; color: #B0B8CC;
    }
    .toggle-btn:hover { color: #0D2A5E; }
    .mnav-bar {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 200;
      background: #fff; border-top: 1px solid #EEF0F5;
      box-shadow: 0 -2px 10px rgba(0,0,0,.06);
      display: flex; padding-bottom: env(safe-area-inset-bottom);
    }
    .mnav-tab {
      flex: 1; border: none; background: none; cursor: pointer;
      font-family: 'Noto Sans KR', sans-serif;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 3px; padding: 8px 2px 7px; color: #96A4BF; position: relative;
    }
    .mnav-tab.active { color: #0D2A5E; }
    .mnav-backdrop {
      position: fixed; inset: 0; background: rgba(13,27,54,.45); z-index: 199;
    }
    .mnav-sheet {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 200;
      max-height: 70vh; background: #fff;
      border-radius: 16px 16px 0 0;
      display: flex; flex-direction: column;
      box-shadow: 0 -8px 30px rgba(0,0,0,.15);
      overflow-y: auto;
      padding-bottom: env(safe-area-inset-bottom);
    }
    .mnav-edit-btn {
      border: none; background: #F5F7FA; color: #4B5C7E; cursor: pointer;
      font-family: 'Noto Sans KR', sans-serif; font-size: 12px; font-weight: 600;
      padding: 5px 12px; border-radius: 20px;
    }
    .mnav-edit-row {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 18px; color: #0D1B36;
    }
    .mnav-move-btn {
      border: 1px solid #DDE3EE; background: #fff; color: #4B5C7E; cursor: pointer;
      width: 26px; height: 26px; border-radius: 6px;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .mnav-move-btn:disabled { opacity: .3; cursor: default; }
    .mnav-section-lb {
      padding: 10px 18px 4px; font-size: 11px; font-weight: 600; color: #96A4BF; letter-spacing: .3px;
    }
  `

  function NavButton({ item, big }: { item: typeof NAV[number]; big?: boolean }) {
    const active = pathname === item.href || pathname.startsWith(item.href + '/')
    const unreadCount = unreadCountOf(item.key)
    return (
      <button
        className={`sb-tab${active ? ' active' : ''}`}
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
              background: '#C0392B', border: '1.5px solid #fff',
            }} />
          )}
        </span>
        {(big || expanded)
          ? <span style={{ fontSize: big ? 13 : 12, display: 'flex', alignItems: 'center', gap: 5 }}>
              {item.label}
              {unreadCount > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#C0392B' }}>{unreadCount}</span>
              )}
            </span>
          : <span style={{ fontSize: 8, fontWeight: 600 }}>{item.label}</span>
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
              <button key={item.key} className={`mnav-tab${active ? ' active' : ''}`} onClick={() => router.push(item.href)}>
                <span style={{ display: 'flex', position: 'relative' }}>
                  {item.icon}
                  {unreadCount > 0 && (
                    <span style={{ position: 'absolute', top: -3, right: -5, width: 8, height: 8, borderRadius: '50%', background: '#C0392B', border: '1.5px solid #fff' }} />
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
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0D1B36' }}>전체 메뉴</span>
                <button className="mnav-edit-btn" onClick={() => setEditMode(e => !e)}>{editMode ? '완료' : '편집'}</button>
              </div>

              {editMode ? (
                <>
                  <p style={{ padding: '4px 18px 8px', fontSize: 11, color: '#96A4BF' }}>
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
      <aside style={{
        width: W,
        background: '#fff',
        borderRight: '1px solid #EEF0F5',
        display: 'flex', flexDirection: 'column',
        padding: '16px 0',
        flexShrink: 0,
        position: 'relative',
        transition: 'width .22s cubic-bezier(.4,0,.2,1)',
        overflow: 'visible',
        minHeight: '100vh',
      }}>

        {/* 메뉴 목록 */}
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {visibleNav.map((item, idx) => (
            item.key.startsWith('divider')
              ? (expanded ? <div key={idx} style={{ height: 1, background: '#F5F5F8', margin: '6px 0' }} /> : null)
              : <NavButton key={item.key} item={item} />
          ))}
        </nav>

        {/* 접기/펼치기 버튼 */}
        <button
          className="toggle-btn"
          onClick={() => setExpanded(e => !e)}
          title="메뉴 접기/펼치기"
        >
          <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            style={{ transform: expanded ? 'none' : 'rotate(180deg)', transition: 'transform .22s' }}>
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
      </aside>
    </>
  )
}
