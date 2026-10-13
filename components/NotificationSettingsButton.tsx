'use client'
import { useState } from 'react'
import Link from 'next/link'
import { notificationSetupIssue } from '@/lib/notification-settings'

export default function NotificationSettingsButton({ permission, onEnable, unreadCount = 0, noticesHref }: {
  permission: NotificationPermission | null; onEnable: () => Promise<boolean>; unreadCount?: number; noticesHref?: string
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function enable() {
    if (busy) return
    setOpen(true)
    const issue = notificationSetupIssue()
    if (issue) { setMessage(issue); return }
    setBusy(true); setMessage('알림 설정을 확인하고 있습니다…')
    try {
      // Call immediately from the tap so the permission prompt retains user activation.
      const success = await onEnable()
      setMessage(success ? '알림 설정이 완료되었습니다.' : Notification.permission === 'denied' ? '알림이 차단되었습니다. 기기·브라우저 설정에서 허용한 뒤 다시 눌러주세요.' : Notification.permission === 'default' ? '알림 허용을 선택해 주세요. 종 버튼을 눌러 다시 설정할 수 있습니다.' : '알림 등록을 완료하지 못했습니다. 네트워크 연결을 확인하고 다시 시도해주세요.')
    } catch { setMessage('알림 설정에 실패했습니다. 다시 시도해주세요.') }
    finally { setBusy(false) }
  }
  return <div style={{ position: 'relative' }}>
    <button type="button" onClick={() => void enable()} disabled={busy} aria-label={`알림 설정${unreadCount ? ` · 읽지 않은 공지 ${unreadCount}건` : ''}`} aria-expanded={open} style={{ position: 'relative', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', color: permission === 'granted' ? '#23633F' : '#4E6456', background: 'none', border: 'none', cursor: busy ? 'wait' : 'pointer', borderRadius: '50%' }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>
      {unreadCount > 0 && <span style={{ position: 'absolute', top: 1, right: 1, minWidth: 14, height: 14, padding: '0 3px', borderRadius: 7, background: '#E4574A', color: '#fff', fontSize: 9, lineHeight: '14px' }}>{unreadCount}</span>}
    </button>
    {open && <section aria-label="알림 설정 안내" style={{ position: 'fixed', top: 70, left: 16, right: 16, width: 'auto', maxWidth: 420, margin: '0 auto', boxSizing: 'border-box', maxHeight: 'calc(100dvh - 94px - env(safe-area-inset-bottom))', overflowY: 'auto', overflowWrap: 'anywhere', padding: 16, background: '#fff', border: '1px solid #E2EAE3', borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,.12)', color: '#203F30', zIndex: 120 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><strong style={{ fontSize: 13 }}>알림 설정</strong><button type="button" onClick={() => setOpen(false)} aria-label="알림 안내 닫기" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 8 }}>✕</button></div>
      <p role="status" style={{ margin: '8px 0 12px', fontSize: 12, lineHeight: 1.7 }}>{message}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}><button type="button" disabled={busy} onClick={() => void enable()} style={{ padding: '7px 10px', border: '1px solid #E2EAE3', borderRadius: 6, background: '#fff', color: '#23633F', font: 'inherit', fontSize: 12, cursor: 'pointer' }}>{busy ? '확인 중…' : '다시 확인'}</button>{noticesHref && <Link href={noticesHref} onClick={() => setOpen(false)} style={{ fontSize: 12, color: '#23633F' }}>공지사항 보기{unreadCount ? ` (${unreadCount})` : ''}</Link>}</div>
    </section>}
  </div>
}
