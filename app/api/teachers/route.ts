import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// service_role 키 — 서버에서만 사용
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/teachers — 새 선생님 계정 생성 (관리자만)
export async function POST(req: NextRequest) {
  try {
    const { name, email, password, role, requesterId } = await req.json()

    // 1. 요청자가 admin인지 확인
    const { data: requester } = await supabaseAdmin
      .from('teachers')
      .select('role')
      .eq('user_id', requesterId)
      .single()

    if (requester?.role !== 'admin') {
      return NextResponse.json(
        { error: '관리자만 선생님 계정을 생성할 수 있습니다.' },
        { status: 403 }
      )
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

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// GET /api/teachers — 전체 선생님 목록 조회 (관리자만)
export async function GET(req: NextRequest) {
  const requesterId = req.nextUrl.searchParams.get('requesterId')

  const { data: requester } = await supabaseAdmin
    .from('teachers')
    .select('role')
    .eq('user_id', requesterId)
    .single()

  if (requester?.role !== 'admin') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const { data: teachers } = await supabaseAdmin
    .from('teachers')
    .select('id, name, email, role, created_at')
    .order('created_at', { ascending: true })

  return NextResponse.json({ teachers })
}

// DELETE /api/teachers — 선생님 계정 삭제 (관리자만)
export async function DELETE(req: NextRequest) {
  const { targetUserId, requesterId } = await req.json()

  const { data: requester } = await supabaseAdmin
    .from('teachers')
    .select('role')
    .eq('user_id', requesterId)
    .single()

  if (requester?.role !== 'admin') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  // Auth + DB 동시 삭제
  await supabaseAdmin.auth.admin.deleteUser(targetUserId)

  return NextResponse.json({ success: true })
}