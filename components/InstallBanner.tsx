'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

const navy = '#0D2A5E', navyDk = '#071A3E'

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

function isStandalone() {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as any).standalone === true
}

function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase())
}

export default function InstallBanner() {
  const pathname = usePathname()
  const isParentRoute = pathname?.startsWith('/parent') ?? false
  const [visible, setVisible] = useState(false)
  const [platform, setPlatform] = useState<'android' | 'ios'>('android')
  const [deferred, setDeferred] = useState<BIPEvent | null>(null)

  useEffect(() => {
    // 이미 홈 화면 앱(standalone)으로 실행 중이면 아예 표시하지 않음
    if (isStandalone()) return
    // 이번 세션에서 이미 닫았으면 표시하지 않음
    if (sessionStorage.getItem('installBannerDismissed') === '1') return

    if (isIOS()) {
      setPlatform('ios')
      setVisible(true)
      return
    }

    function onBIP(e: Event) {
      e.preventDefault()
      setDeferred(e as BIPEvent)
      setPlatform('android')
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', onBIP)
    return () => window.removeEventListener('beforeinstallprompt', onBIP)
  }, [])

  function dismiss() {
    sessionStorage.setItem('installBannerDismissed', '1')
    setVisible(false)
  }

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    if (outcome === 'accepted') setVisible(false)
    else dismiss()
  }

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, zIndex: 2000,
      bottom: isParentRoute ? 'calc(62px + env(safe-area-inset-bottom))' : 0,
      background: `linear-gradient(135deg, ${navyDk} 0%, ${navy} 100%)`,
      color: '#fff', padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: 12,
      boxShadow: '0 -4px 16px rgba(0,0,0,.2)',
      fontFamily: "'Noto Sans KR',sans-serif",
    }}>
      <Image src="/logo3.png" alt="" width={34} height={34} style={{ objectFit: 'contain', flexShrink: 0, borderRadius: 8, background: '#fff', padding: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>홈 화면에 추가</p>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,.75)' }}>
          {platform === 'ios'
            ? '하단 공유 버튼 → "홈 화면에 추가"를 눌러주세요'
            : '앱처럼 빠르게 접속할 수 있어요'}
        </p>
      </div>
      {platform === 'android' && (
        <button onClick={install} style={{
          flexShrink: 0, border: 'none', borderRadius: 8, padding: '8px 14px',
          background: '#D87E13', color: navyDk, fontWeight: 700, fontSize: 12,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>설치</button>
      )}
      <button onClick={dismiss} aria-label="닫기" style={{
        flexShrink: 0, border: 'none', background: 'rgba(255,255,255,.12)',
        color: '#fff', borderRadius: '50%', width: 26, height: 26,
        cursor: 'pointer', fontSize: 15, lineHeight: 1,
      }}>×</button>
    </div>
  )
}
