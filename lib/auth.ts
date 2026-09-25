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
    role: teacher.role as 'admin' | 'teacher' | 'assistant',
  }
}

type ParentChild = { id: number; name: string; birth_year: number; school: string }

// ── 학부모 전화번호 확인 (1단계) — 등록 여부만 확인하고, PIN 값은 다루지 않는다.
//    parents 테이블을 직접 조회하지 않고 RPC를 거친다 — 필터 없이 테이블 전체를
//    가져가는 것 자체를 막기 위해서다(정확히 일치하는 1건만 서버가 돌려준다). ──
export async function parentLookup(phone: string) {
  const { data, error } = await supabase.rpc('lookup_parent_by_phone', { p_phone: phone }).single()

  if (error || !data) {
    throw new Error('등록되지 않은 전화번호입니다. 담당 선생님에게 문의하세요.')
  }
  const row = data as { id: number; phone: string }
  return { parentId: row.id, phone: row.phone }
}

// ── 학부모 PIN 검증 (2단계) — PIN 비교는 DB 함수(verify_parent_pin)가 서버에서 수행하고,
//    클라이언트는 결과(성공 여부·자녀 목록)만 받는다. PIN 값 자체는 어디로도 노출되지 않는다. ──
export async function parentLoginWithPin(phone: string, pin: string) {
  const normalized = phone.replace(/-/g, '').replace(/\s/g, '')
  // .single()을 쓰지 않는다 — 틀린 PIN(잠기지 않은 상태)은 예외가 아니라 빈 결과(0행)로
  // 돌아온다(같은 트랜잭션에서 예외를 던지면 방금 남긴 실패 횟수 기록까지 롤백되기 때문).
  // .single()은 0행에도 기술적인 에러 메시지를 만들어내므로 배열로 직접 확인한다.
  const { data, error } = await supabase.rpc('verify_parent_pin', { p_phone: normalized, p_pin: pin })
  if (error) throw new Error(error.message || 'PIN이 올바르지 않습니다.')
  const rows = data as { parent_id: number; phone: string; is_default_pin: boolean; children: ParentChild[]; session_token: string }[]
  if (!rows || rows.length === 0) throw new Error('PIN이 올바르지 않습니다.')
  const row = rows[0]
  return {
    parentId: row.parent_id,
    phone: row.phone,
    children: row.children,
    isDefaultPin: row.is_default_pin,
    sessionToken: row.session_token,
  }
}

// ── 학부모 PIN 변경 — 기존 PIN이 맞아야만 통과한다(임의 계정 PIN 덮어쓰기 방지) ──
export async function updateParentPin(parentId: number, oldPin: string, newPin: string) {
  const { error } = await supabase.rpc('update_parent_pin', { p_parent_id: parentId, p_old_pin: oldPin, p_new_pin: newPin })
  if (error) throw new Error(error.message || 'PIN 변경에 실패했습니다.')
}

// ── 학생 전화번호 확인 (1단계) — 학부모 로그인과 동일한 방식, students.phone 기준 ──
export async function studentLookup(phone: string) {
  const { data, error } = await supabase.rpc('lookup_student_by_phone', { p_phone: phone }).maybeSingle()

  if (error || !data) {
    throw new Error('등록되지 않은 전화번호입니다. 담당 선생님에게 문의하세요.')
  }
  const row = data as { id: number; name: string; phone: string }
  return { studentId: row.id, name: row.name, phone: row.phone }
}

// ── 학생 PIN 검증 (2단계) ──
export async function studentLoginWithPin(phone: string, pin: string) {
  const normalized = phone.replace(/-/g, '').replace(/\s/g, '')
  const { data, error } = await supabase.rpc('verify_student_pin', { p_phone: normalized, p_pin: pin })
  if (error) throw new Error(error.message || 'PIN이 올바르지 않습니다.')
  const rows = data as { student_id: number; name: string; phone: string; is_default_pin: boolean; session_token: string }[]
  if (!rows || rows.length === 0) throw new Error('PIN이 올바르지 않습니다.')
  const row = rows[0]
  // 기존 학생 로그인은 유지하고, 시험 제출용 서버 검증 세션도 발급한다.
  if (!row.is_default_pin) await fetch('/api/student-tests', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'verify', studentId: row.student_id, pin }),
  }).catch(() => {})
  return {
    studentId: row.student_id,
    name: row.name,
    phone: row.phone,
    isDefaultPin: row.is_default_pin,
    sessionToken: row.session_token,
  }
}

// ── 학생 PIN 변경 — 기존 PIN이 맞아야만 통과한다(임의 계정 PIN 덮어쓰기 방지) ──
export async function updateStudentPin(studentId: number, oldPin: string, newPin: string) {
  const { error } = await supabase.rpc('update_student_pin', { p_student_id: studentId, p_old_pin: oldPin, p_new_pin: newPin })
  if (error) throw new Error(error.message || 'PIN 변경에 실패했습니다.')
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

  type ParentStudentRow = { student_id: number; students: ParentChild | null }
  const children = (parent.parent_students as unknown as ParentStudentRow[])
    .map(ps => ps.students)
    .filter((s): s is ParentChild => s != null)

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
  return { userId: user.id, name: teacher.name, role: teacher.role as 'admin' | 'teacher' | 'assistant' }
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
