'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

type Theme = 'green' | 'navy'
const KEY = 'admin_color_theme'
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'green', toggle: () => {} })

export function useInternalTheme() { return useContext(ThemeContext) }

// 내부 화면에서만 테마를 상속한다. 메인/로그인 화면의 색상에는 영향을 주지 않는다.
export function InternalThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('green')
  useEffect(() => {
    const restore = () => {
      try { setTheme(localStorage.getItem(KEY) === 'navy' ? 'navy' : 'green') } catch {}
    }
    restore()
    const onStorage = (event: StorageEvent) => { if (event.key === KEY || event.key === null) restore() }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  function toggle() {
    const next = theme === 'green' ? 'navy' : 'green'
    setTheme(next)
    try { localStorage.setItem(KEY, next) } catch {}
  }

  return <ThemeContext.Provider value={{ theme, toggle }}>
    <div className="internal-ui" data-ui-theme={theme} style={{ display: 'contents' }}>{children}</div>
  </ThemeContext.Provider>
}
