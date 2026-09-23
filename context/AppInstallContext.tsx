'use client'
import { createContext, useContext, useEffect, useRef, useState } from 'react'

type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
type InstallState = {
  installed: boolean
  installing: boolean
  message: string
  install: () => Promise<void>
}
const AppInstallContext = createContext<InstallState | null>(null)

export function AppInstallProvider({ children }: { children: React.ReactNode }) {
  const deferred = useRef<InstallEvent | null>(null)
  const busy = useRef(false)
  const [installed, setInstalled] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const displayMode = window.matchMedia('(display-mode: standalone)')
    const standalone = displayMode.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 설치 상태는 브라우저에서만 확인할 수 있다.
    setInstalled(standalone)
    function onPrompt(event: Event) {
      event.preventDefault()
      deferred.current = event as InstallEvent
    }
    function onInstalled() {
      deferred.current = null
      setInstalled(true)
      setMessage('앱 설치가 완료되었습니다.')
    }
    function onDisplayMode() { if (displayMode.matches) onInstalled() }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    displayMode.addEventListener('change', onDisplayMode)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      displayMode.removeEventListener('change', onDisplayMode)
    }
  }, [])

  async function install() {
    if (busy.current || installed) return
    const prompt = deferred.current
    if (!prompt) {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      setMessage(ios
        ? 'Safari에서 공유 버튼 → 홈 화면에 추가 → 추가를 눌러주세요.'
        : '브라우저 메뉴에서 앱 설치 또는 홈 화면에 추가를 선택해주세요. 항목이 없다면 Chrome 또는 Edge에서 다시 열어주세요. 이미 설치했다면 앱 목록에서 실행할 수 있습니다.')
      return
    }
    busy.current = true
    deferred.current = null // 설치 요청 이벤트는 한 번만 사용할 수 있다.
    setInstalling(true)
    setMessage('')
    try {
      await prompt.prompt()
      const { outcome } = await prompt.userChoice
      setMessage(outcome === 'accepted' ? '설치를 요청했습니다. 완료되면 앱 목록에서 실행해주세요.' : '설치를 취소했습니다. 브라우저 메뉴에서도 설치할 수 있습니다.')
    } catch {
      setMessage('설치 창을 열지 못했습니다. 브라우저 메뉴에서 앱 설치 또는 홈 화면에 추가를 선택해주세요.')
    } finally {
      busy.current = false
      setInstalling(false)
    }
  }

  return <AppInstallContext.Provider value={{ installed, installing, message, install }}>{children}</AppInstallContext.Provider>
}

export function useAppInstall() {
  const context = useContext(AppInstallContext)
  if (!context) throw new Error('AppInstallProvider is required')
  return context
}
