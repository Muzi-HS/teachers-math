'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type TeacherSession = {
  userId: string
  email: string
  name: string
  role: 'admin' | 'teacher'
}

type ParentSession = {
  parentId: number
  phone: string
  children: { id: number; name: string; birth_year: number; school: string }[]
}

type AuthContextType = {
  teacher: TeacherSession | null
  parent: ParentSession | null
  role: 'admin' | 'teacher' | 'parent' | null
  loading: boolean
  logout: () => Promise<void>
  loginAsTeacher: (t: TeacherSession) => void
  loginAsParent: (p: ParentSession) => void
}

const AuthContext = createContext<AuthContextType>({
  teacher: null,
  parent: null,
  role: null,
  loading: true,
  logout: async () => {},
  loginAsTeacher: () => {},
  loginAsParent: () => {},
})

async function fetchTeacherProfile(userId: string): Promise<TeacherSession | null> {
  const { data, error } = await supabase
    .from('teachers')
    .select('name, role')
    .eq('user_id', userId)
    .single()
  if (error || !data) return null
  return { userId, email: '', name: data.name, role: data.role }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [teacher, setTeacher] = useState<TeacherSession | null>(null)
  const [parent,  setParent]  = useState<ParentSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      setLoading(true)

      // 1. Supabase Auth 세션 확인 (선생님/관리자)
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const profile = await fetchTeacherProfile(session.user.id)
        if (profile) {
          setTeacher({ ...profile, email: session.user.email! })
          setLoading(false)
          return
        }
      }

      // 2. 학부모 세션 확인 (sessionStorage)
      try {
        const raw = sessionStorage.getItem('parent_session')
        if (raw) {
          const parsed = JSON.parse(raw)
          setParent(parsed)
        }
      } catch {}

      setLoading(false)
    }

    init()

    // Supabase Auth 상태 변화 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const profile = await fetchTeacherProfile(session.user.id)
          if (profile) {
            setTeacher({ ...profile, email: session.user.email! })
            setParent(null)
          }
        } else if (event === 'SIGNED_OUT') {
          setTeacher(null)
          setParent(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  function loginAsTeacher(t: TeacherSession) {
    setTeacher(t)
    setParent(null)
  }

  function loginAsParent(p: ParentSession) {
    setParent(p)
    setTeacher(null)
  }

  async function logout() {
    setLoading(true)
    setTeacher(null)
    setParent(null)
    sessionStorage.removeItem('parent_session')
    localStorage.removeItem('parent_auto_login')
    await supabase.auth.signOut()
    setLoading(false)
    router.replace('/')
  }

  const role = teacher?.role ?? (parent ? 'parent' : null)

  return (
    <AuthContext.Provider value={{ teacher, parent, role, loading, logout, loginAsTeacher, loginAsParent }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
