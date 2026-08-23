'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

// 관리자/선생님이 PC에서도 모바일 화면 형태로 볼 수 있도록 하는 수동 전환 스위치.
// 실제 창 너비와 무관하게 켜고 끌 수 있어야 하므로, 각 화면은 반드시 이 값을 보고
// 레이아웃을 분기해야 한다 (CSS 미디어쿼리/auto-fit만으로는 전환되지 않음).
const STORAGE_KEY = 'admin_mobile_mode'

type MobileModeContextType = {
  mobileMode: boolean
  setMobileMode: (v: boolean) => void
}

const MobileModeContext = createContext<MobileModeContextType>({
  mobileMode: false,
  setMobileMode: () => {},
})

export function useMobileMode() {
  return useContext(MobileModeContext)
}

export function MobileModeProvider({ children }: { children: ReactNode }) {
  const [mobileMode, setMobileModeState] = useState(false)

  useEffect(() => {
    try { setMobileModeState(localStorage.getItem(STORAGE_KEY) === '1') } catch {}
  }, [])

  function setMobileMode(v: boolean) {
    setMobileModeState(v)
    try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0') } catch {}
  }

  return (
    <MobileModeContext.Provider value={{ mobileMode, setMobileMode }}>
      {children}
    </MobileModeContext.Provider>
  )
}
