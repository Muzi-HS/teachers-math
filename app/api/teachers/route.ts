import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin-api-auth'

// service_role 키 — 서버에서만 사용
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/teachers — 새 선생님 계정 생성 (관리자만)
export async function POST(req: NextRequest) {
  try {
    const authorization = await requireAdmin(req, supabaseAdmin)
    if (authorization.response) return authorization.response
    const { name, email, password, role } = await req.json()
    if (role != null && !['admin', 'teacher', 'assistant'].includes(role)) {
      return NextResponse.json({ error: '올바른 역할을 선택하세요.' }, { status: 400 })
    }

    // 2. admin 2명 제한 확인 (DB 트리거가 막아주지만 이중 체크)
    if (role === 'admin') {
      const { count } = await supabaseAdmin
        .from('teachers')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'admin')

      if ((count ?? 0) >= 2) {
        return NextResponse.json(
          { error: '관리자는 최대 2명까지만 등록 가능합니다.' },
          { status: 400 }
        )
      }
    }

    // 3. Supabase Auth에 계정 생성
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,  // 이메일 인증 없이 바로 활성화
      })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    // 4. teachers 테이블에 프로필 저장
    const { error: dbError } = await supabaseAdmin
      .from('teachers')
      .insert({
        user_id: authData.user.id,
        name,
        email,
        role: role ?? 'teacher',
      })

    if (dbError) {
      // Auth 계정은 만들어졌는데 DB 저장 실패 시 Auth 계정도 삭제
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, userId: authData.user.id })

  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// GET /api/teachers — 전체 선생님 목록 조회 (관리자만)
export async function GET(req: NextRequest) {
  const authorization = await requireAdmin(req, supabaseAdmin)
  if (authorization.response) return authorization.response

  const { data: teachers, error } = await supabaseAdmin
    .from('teachers')
    .select('id, name, email, role, created_at')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: '목록을 불러오지 못했습니다.' }, { status: 500 })
  return NextResponse.json({ teachers }, { headers: { 'Cache-Control': 'no-store' } })
}

// DELETE /api/teachers — 선생님 계정 삭제 (관리자만)
export async function DELETE(req: NextRequest) {
  const authorization = await requireAdmin(req, supabaseAdmin)
  if (authorization.response) return authorization.response
  try {
    const { targetUserId } = await req.json()
    if (typeof targetUserId !== 'string' || !targetUserId.trim()) {
      return NextResponse.json({ error: '삭제할 계정을 확인하세요.' }, { status: 400 })
    }
    if (targetUserId === authorization.userId) {
      return NextResponse.json({ error: '현재 로그인한 계정은 삭제할 수 없습니다.' }, { status: 400 })
    }
    const { data: target, error: targetError } = await supabaseAdmin.from('teachers')
      .select('id').eq('user_id', targetUserId).maybeSingle()
    if (targetError) return NextResponse.json({ error: '계정을 확인하지 못했습니다.' }, { status: 500 })
    if (!target) return NextResponse.json({ error: '선생님 계정을 찾을 수 없습니다.' }, { status: 404 })
    const { error } = await supabaseAdmin.auth.admin.deleteUser(targetUserId)
    if (error) return NextResponse.json({ error: '계정 삭제에 실패했습니다.' }, { status: 500 })
    // FK CASCADE가 없는 설치에서도 프로필을 정리한다.
    const { error: profileError } = await supabaseAdmin.from('teachers').delete().eq('user_id', targetUserId)
    if (profileError) return NextResponse.json({ error: '로그인 계정은 삭제됐지만 프로필 정리에 실패했습니다. 관리자 확인이 필요합니다.' }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: '계정 삭제 요청을 처리하지 못했습니다.' }, { status: 500 })
  }
}
