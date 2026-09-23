'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { onForegroundMessage } from '@/lib/firebase'

type Notice = { title: string; body: string; link: string | null }

// 푸시 수신은 화면 이동과 분리한다. 페이지를 다시 마운트하면 작성 중인 폼이 사라진다.
export default function ForegroundNotification() {
  const router = useRouter()
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | undefined
    onForegroundMessage(payload => {
      if (disposed) return
      const rawLink = payload?.data?.link
      let link: string | null = null
      if (typeof rawLink === 'string' && rawLink.startsWith('/')) {
        const url = new URL(rawLink, window.location.origin)
        if (url.origin === window.location.origin) link = url.pathname + url.search + url.hash
      }
      setNotice({
        title: payload?.data?.title || payload?.notification?.title || '새 알림',
        body: payload?.data?.body || payload?.notification?.body || '새로운 소식이 도착했습니다.',
        link,
      })
    }).then(fn => {
      // Firebase 초기화 전에 화면을 나간 경우에도 구독을 남기지 않는다.
      if (disposed) fn?.()
      else unsubscribe = fn
    })
    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [])

  function openNotice() {
    if (!notice?.link) return
    if (!window.confirm('알림 내용을 열면 화면이 이동하거나 새로고침됩니다. 작성 중인 내용을 저장한 후 확인해 주세요. 지금 여시겠습니까?')) return
    const link = notice.link
    setNotice(null)
    // 같은 페이지의 데이터는 최초 진입 시 조회되므로, 명시적으로 확인한 경우에만 다시 연다.
    if (link === window.location.pathname + window.location.search + window.location.hash) window.location.reload()
    else router.push(link)
  }

  if (!notice) return null

  return (
    <aside aria-label="새 알림" style={{
      position: 'fixed', top: 64, right: 12, zIndex: 10000,
      width: 'min(340px, calc(100vw - 24px))', boxSizing: 'border-box',
      padding: 14, background: '#fff', border: '1px solid var(--ui-border)',
      borderLeft: '4px solid var(--ui-primary)', borderRadius: 10,
      boxShadow: '0 4px 18px rgba(0,0,0,.15)', color: 'var(--ui-text)',
      fontFamily: "'Noto Sans KR',sans-serif",
    }}>
      <div role="status" aria-live="polite" style={{ overflowWrap: 'anywhere' }}>
        <strong style={{ fontSize: 13 }}>{notice.title}</strong>
        <p style={{ fontSize: 13, margin: '6px 0', maxHeight: 96, overflowY: 'auto' }}>{notice.body}</p>
      </div>
      <p style={{ fontSize: 12, color: 'var(--ui-text-2)', margin: '6px 0 10px' }}>작성 중인 내용을 저장한 후 확인해 주세요.</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={() => setNotice(null)} style={{ padding: '6px 10px', border: '1px solid var(--ui-border)', borderRadius: 6, background: '#fff', color: 'var(--ui-text-2)', cursor: 'pointer', font: 'inherit', fontSize: 12 }}>닫기</button>
        {notice.link && <button type="button" onClick={openNotice} style={{ padding: '6px 10px', border: 'none', borderRadius: 6, background: 'var(--ui-primary)', color: '#fff', cursor: 'pointer', font: 'inherit', fontSize: 12 }}>내용 확인</button>}
      </div>
    </aside>
  )
}
