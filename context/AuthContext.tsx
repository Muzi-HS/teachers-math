'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { clearClientSession, validateClientSession } from '@/lib/client-session'

type TeacherSession = {
  userId: string
  email: string
  name: string
  role: 'admin' | 'teacher' | 'assistant'
}

type ParentSession = {
  parentId: number
  phone: string
  children: { id: number; name: string; birth_year: number; school: string }[]
  sessionToken: string
}

type StudentSession = {
  studentId: number
  phone: string
  name: string
  sessionToken: string
}

type AuthContextType = {
  teacher: TeacherSession | null
  parent: ParentSession | null
  student: StudentSession | null
  role: 'admin' | 'teacher' | 'assistant' | 'parent' | 'student' | null
  loading: boolean
  logout: () => Promise<void>
  loginAsTeacher: (t: TeacherSession) => void
  loginAsParent: (p: ParentSession) => void
  loginAsStudent: (s: StudentSession) => void
}

const AuthContext = createContext<AuthContextType>({
  teacher: null,
  parent: null,
  student: null,
  role: null,
  loading: true,
  logout: async () => {},
  loginAsTeacher: () => {},
  loginAsParent: () => {},
  loginAsStudent: () => {},
})

// 학부모/학생 "자동 로그인" 체크 시 localStorage에 { session } 형태로 저장해둔 세션을
// sessionStorage로 복원한다. sessionStorage는 탭을 닫으면 사라지므로, 앱을 완전히 껐다
// 다시 켰을 때(새 탭/새 창)는 이 localStorage 값이 없으면 로그인 상태가 복원되지 않는다.
function restoreAutoLogin(autoKey: string, sessionKey: string): string | null {
  const existing = sessionStorage.getItem(sessionKey)
  if (existing) return existing
  try {
    const auto = localStorage.getItem(autoKey)
    if (!auto) return null
    const parsed = JSON.parse(auto)
    if (!parsed?.session) return null
    const raw = JSON.stringify(parsed.session)
    sessionStorage.setItem(sessionKey, raw)
    return raw
  } catch { return null }
}

async function fetchTeacherProfile(userId: string): Promise<TeacherSession | null> {
  const { data, error } = await supabase
    .from('teachers')
    .select('name, role, approved')
    .eq('user_id', userId)
    .eq('approved', true)
    .maybeSingle()
  if (error || !data) return null
  return { userId, email: '', name: data.name, role: data.role }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [teacher, setTeacher] = useState<TeacherSession | null>(null)
  const [parent,  setParent]  = useState<ParentSession | null>(null)
  const [student, setStudent] = useState<StudentSession | null>(null)
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

      // 2. 학부모 세션 확인 (sessionStorage, 없으면 자동 로그인 localStorage에서 복원)
      // sessionToken이 없는 옛 세션(이번 배포 이전 로그인)은 새 게이트웨이 함수를 호출할 수
      // 없으므로, 빈 화면 대신 로그아웃 상태로 되돌려 다시 로그인하도록 한다.
      try {
        const raw = restoreAutoLogin('parent_auto_login', 'parent_session')
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed?.sessionToken && await validateClientSession('parent', parsed.parentId, parsed.sessionToken)) {
            setParent(parsed)
            setLoading(false)
            return
          }
          clearClientSession('parent')
          window.alert('로그인 유지 기간이 만료되었습니다. 다시 로그인해 주세요.')
        }
      } catch {
        window.alert('로그인 상태를 확인하지 못했습니다. 인터넷 연결을 확인한 후 새로고침해 주세요.')
        setLoading(false)
        return
      }

      // 3. 학생 세션 확인 (sessionStorage, 없으면 자동 로그인 localStorage에서 복원)
      try {
        const raw = restoreAutoLogin('student_auto_login', 'student_session')
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed?.sessionToken && await validateClientSession('student', parsed.studentId, parsed.sessionToken)) {
            setStudent(parsed)
          } else {
            clearClientSession('student')
            window.alert('로그인 유지 기간이 만료되었습니다. 다시 로그인해 주세요.')
          }
        }
      } catch {
        window.alert('로그인 상태를 확인하지 못했습니다. 인터넷 연결을 확인한 후 새로고침해 주세요.')
      }

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
            setStudent(null)
          }
        } else if (event === 'SIGNED_OUT') {
          setTeacher(null)
          setParent(null)
          setStudent(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // Recheck long-lived tabs when returning to the app and while it is visible.
  useEffect(() => {
    const kind = parent ? 'parent' : student ? 'student' : null
    const session = parent ?? student
    if (!kind || !session) return
    const id = parent?.parentId ?? student!.studentId
    let cancelled = false
    let checking = false
    async function check() {
      if (document.visibilityState !== 'visible' || checking) return
      checking = true
      try {
        const valid = await validateClientSession(kind!, id, session!.sessionToken)
        if (cancelled || valid) return
        clearClientSession(kind!)
        setParent(null)
        setStudent(null)
        window.alert('로그인 유지 기간이 만료되었습니다. 다시 로그인해 주세요.')
        router.replace('/')
      } catch {
        // Temporary network failures must not erase a saved login.
      } finally { checking = false }
    }
    void check()
    const timer = window.setInterval(() => { void check() }, 5 * 60 * 1000)
    document.addEventListener('visibilitychange', check)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [parent, student, router])

  function loginAsTeacher(t: TeacherSession) {
    setTeacher(t)
    setParent(null)
    setStudent(null)
  }

  function loginAsParent(p: ParentSession) {
    setParent(p)
    setTeacher(null)
    setStudent(null)
  }

  function loginAsStudent(s: StudentSession) {
    setStudent(s)
    setTeacher(null)
    setParent(null)
  }

  async function logout() {
    await fetch('/api/student-tests', { method: 'DELETE' }).catch(() => {})
    // 로그아웃 시 서버에 발급된 세션 토큰 자체를 무효화한다 — 안 지우면 브라우저 저장소만
    // 비워질 뿐, 토큰이 유출된 적 있다면 만료(최대 30일) 전까지 그 토큰으로는 계속 접근 가능했다.
    const token = parent?.sessionToken ?? student?.sessionToken
    if (token) supabase.rpc('client_logout', { p_token: token }).then(() => {}, () => {})
    setLoading(true)
    setTeacher(null)
    setParent(null)
    setStudent(null)
    sessionStorage.removeItem('parent_session')
    localStorage.removeItem('parent_auto_login')
    sessionStorage.removeItem('student_session')
    localStorage.removeItem('student_auto_login')
    await supabase.auth.signOut()
    setLoading(false)
    router.replace('/')
  }

  const role = teacher?.role ?? (parent ? 'parent' : student ? 'student' : null)

  return (
    <AuthContext.Provider value={{ teacher, parent, student, role, loading, logout, loginAsTeacher, loginAsParent, loginAsStudent }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
