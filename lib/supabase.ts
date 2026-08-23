import { createClient } from '@supabase/supabase-js'

// 선생님/관리자 로그인 시 '자동 로그인' 체크 여부에 따라 세션 저장 위치를 동적으로 전환한다.
// - 체크함: localStorage에 저장 → 브라우저를 닫았다 열어도 로그인 유지
// - 체크 안함: sessionStorage에만 저장 → 탭/브라우저를 닫으면 로그아웃
// (학부모는 Supabase Auth를 쓰지 않고 별도의 전화번호+PIN 세션을 쓰므로 이 설정과 무관)
export const TEACHER_AUTO_LOGIN_KEY = 'teacher_auto_login_enabled'

function isAutoLoginOn() {
  try { return localStorage.getItem(TEACHER_AUTO_LOGIN_KEY) === '1' } catch { return false }
}

const authStorage = typeof window === 'undefined' ? undefined : {
  getItem: (key: string) => {
    if (isAutoLoginOn()) return localStorage.getItem(key)
    // 이번 세션(sessionStorage) 우선, 없으면 과거에 저장된 localStorage 세션도 허용(하위 호환)
    return sessionStorage.getItem(key) ?? localStorage.getItem(key)
  },
  setItem: (key: string, value: string) => {
    if (isAutoLoginOn()) {
      localStorage.setItem(key, value)
    } else {
      sessionStorage.setItem(key, value)
      localStorage.removeItem(key)
    }
  },
  removeItem: (key: string) => {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  },
}

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  authStorage ? { auth: { storage: authStorage, persistSession: true, autoRefreshToken: true } } : undefined
)
