'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import { isStudentTheme, type StudentTheme } from '@/lib/student-theme'

const ThemeContext = createContext<{ theme: StudentTheme; loading: boolean; error: string; save: (theme: StudentTheme) => Promise<boolean> }>({ theme: 'green', loading: false, error: '', save: async () => false })
export function useStudentTheme() { return useContext(ThemeContext) }
export function StudentThemeProvider({ children }: { children: React.ReactNode }) {
  const { student } = useAuth()
  const token = student?.sessionToken
  const studentId = student?.studentId
  const [saved, setSaved] = useState<{ owner: number; theme: StudentTheme } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const activeToken = useRef(token)
  useEffect(() => { activeToken.current = token }, [token])
  const theme = saved && saved.owner === studentId ? saved.theme : 'green'
  const restore = useCallback(async (signal: AbortSignal) => {
    if (!token || !studentId) return
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/student-theme', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      if (activeToken.current === token && !signal.aborted) setSaved({ owner: studentId, theme: isStudentTheme(data.theme) ? data.theme : 'green' })
    } catch {
      if (!signal.aborted && activeToken.current === token) setError('저장된 테마를 불러오지 못했어요. 다시 열어주세요.')
    } finally { if (!signal.aborted && activeToken.current === token) setLoading(false) }
  }, [token, studentId])
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => { void restore(controller.signal) }, 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [restore])
  const save = async (next: StudentTheme) => {
    if (!token || !studentId) return false
    setError('')
    try {
      const response = await fetch('/api/student-theme', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ theme: next }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      if (activeToken.current !== token) return false
      setSaved({ owner: studentId, theme: next })
      return true
    } catch {
      if (activeToken.current === token) setError('테마를 저장하지 못했어요. 다시 시도해주세요.')
      return false
    }
  }
  return <ThemeContext.Provider value={{ theme, loading, error, save }}>{children}</ThemeContext.Provider>
}
