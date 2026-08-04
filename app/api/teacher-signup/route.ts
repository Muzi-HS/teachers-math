import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { name, email, password, phone } = await req.json()

    if (!name || !email || !password) {
      return NextResponse.json({ error: '필수 항목을 입력하세요.' }, { status: 400 })
    }

    // 이미 가입된 이메일 체크
    const { data: existing } = await supabaseAdmin
      .from('teachers')
      .select('id')
      .eq('email', email.trim())
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: '이미 가입된 이메일입니다.' }, { status: 400 })
    }

    // Supabase Auth 계정 생성 (서비스 롤 — RLS 우회)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    // teachers 테이블에 미승인 상태로 저장
    const { error: dbError } = await supabaseAdmin
      .from('teachers')
      .insert({
        user_id: authData.user.id,
        name: name.trim(),
        email: email.trim(),
        phone: phone ? String(phone).replace(/-/g, '') : '',
        role: 'teacher',
        approved: false,
      })

    if (dbError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
