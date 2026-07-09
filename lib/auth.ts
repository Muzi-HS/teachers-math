import { supabase } from './supabase'

// ── 선생님/관리자 로그인 ──
export async function teacherLogin(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (error) throw new Error('이메일 또는 비밀번호가 올바르지 않습니다.')

  // teachers 테이블에서 role + 승인 여부 조회
  const { data: teacher, error: te } = await supabase
    .from('teachers')
    .select('name, role, approved')
    .eq('user_id', data.user.id)
    .single()

  if (te || !teacher) throw new Error('선생님 계정 정보를 찾을 수 없습니다.')
  if (!teacher.approved) {
    await supabase.auth.signOut()
    throw new Error('관리자 승인 대기 중입니다. 승인 후 로그인할 수 있습니다.')
  }

  return {
    userId: data.user.id,
    email: data.user.email!,
    name: teacher.name,
    role: teacher.role as 'admin' | 'teacher',
  }
}

// ── 학부모 전화번호 확인 (1단계) ──
export async function parentLookup(phone: string) {
  const normalized = phone.replace(/-/g, '').replace(/\s/g, '')

  const { data: parent, error } = await supabase
    .from('parents')
    .select(`
      id, phone, pin,
      parent_students (
        student_id,
        students ( id, name, birth_year, school )
      )
    `)
    .eq('phone', normalized)
    .single()

  if (error || !parent) {
    throw new Error('등록되지 않은 전화번호입니다. 담당 선생님에게 문의하세요.')
  }

  const children = (parent.parent_students as any[]).map((ps: any) => ps.students)
  return {
    parentId: parent.id,
    phone: parent.phone,
    pin: parent.pin ?? '0000',
    children,
  }
}

// ── 학부모 PIN 검증 (2단계) ──
export async function parentLoginWithPin(phone: string, pin: string) {
  const data = await parentLookup(phone)
  if (data.pin !== pin) throw new Error('PIN이 올바르지 않습니다.')
  return {
    parentId: data.parentId,
    phone: data.phone,
    children: data.children,
    isDefaultPin: data.pin === '0000',
  }
}

// ── 학부모 PIN 변경 ──
export async function updateParentPin(parentId: number, newPin: string) {
  const { error } = await supabase
    .from('parents')
    .update({ pin: newPin })
    .eq('id', parentId)
  if (error) throw new Error('PIN 변경에 실패했습니다.')
}

// ── 학부모 로그인 (전화번호만) - 기존 호환용 ──
export async function parentLogin(phone: string) {
  // 전화번호 정규화: 하이픈 제거해서 DB 저장 형식(01012341234)에 맞춤
  const normalized = phone.replace(/-/g, '').replace(/\s/g, '')

  const { data: parent, error } = await supabase
    .from('parents')
    .select(`
      id,
      phone,
      parent_students (
        student_id,
        students ( id, name, birth_year, school )
      )
    `)
    .eq('phone', normalized)
    .single()

  if (error || !parent) {
    throw new Error('등록되지 않은 전화번호입니다. 담당 선생님에게 문의하세요.')
  }

  const children = (parent.parent_students as any[]).map((ps: any) => ps.students)

  return {
    parentId: parent.id,
    phone: parent.phone,
    children,
  }
}

// ── 로그아웃 ──
export async function logout() {
  await supabase.auth.signOut()
  // 학부모 세션도 제거
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('parent_session')
  }
}

// ── 현재 선생님 세션 확인 ──
export async function getCurrentTeacher() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: teacher } = await supabase
    .from('teachers')
    .select('name, role')
    .eq('user_id', user.id)
    .single()

  if (!teacher) return null
  return { userId: user.id, name: teacher.name, role: teacher.role as 'admin' | 'teacher' }
}

// ── 현재 학부모 세션 확인 ──
export function getCurrentParent() {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem('parent_session')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}