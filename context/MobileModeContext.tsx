'use client'
import { createContext, useContext, useEffect, useState, useSyncExternalStore, ReactNode } from 'react'

// 작은 화면은 자동 적용하고, 넓은 PC 화면에서는 모바일 미리보기를 허용한다.
// 터치 기기의 가로 모드도 포함한다. 이전에 저장한 PC 모드는 자동 감지를 막지 않는다.
const STORAGE_KEY = 'admin_mobile_mode'
const MOBILE_QUERY = '(max-width: 900px), (max-width: 1100px) and (pointer: coarse)'

function subscribeToScreen(onChange: () => void) {
  const media = window.matchMedia(MOBILE_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
function getScreenSnapshot() { return window.matchMedia(MOBILE_QUERY).matches }
function getServerSnapshot() { return true }

type MobileModeContextType = {
  mobileMode: boolean
  isMobileScreen: boolean
  setMobileMode: (v: boolean) => void
}

const MobileModeContext = createContext<MobileModeContextType>({
  mobileMode: false,
  isMobileScreen: false,
  setMobileMode: () => {},
})

export function useMobileMode() {
  return useContext(MobileModeContext)
}

export function MobileModeProvider({ children }: { children: ReactNode }) {
  const isMobileScreen = useSyncExternalStore(subscribeToScreen, getScreenSnapshot, getServerSnapshot)
  const [previewMobile, setMobileModeState] = useState(false)
  const mobileMode = isMobileScreen || previewMobile

  useEffect(() => {
    try { setMobileModeState(localStorage.getItem(STORAGE_KEY) === '1') } catch {}
  }, [])

  function setMobileMode(v: boolean) {
    setMobileModeState(v)
    try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0') } catch {}
  }

  return (
    <MobileModeContext.Provider value={{ mobileMode, isMobileScreen, setMobileMode }}>
      {children}
    </MobileModeContext.Provider>
  )
}
