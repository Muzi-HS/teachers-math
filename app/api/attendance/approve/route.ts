import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { logId, approved, approvedBy } = await req.json()

    if (!logId) return NextResponse.json({ error: 'logId required' }, { status: 400 })

    // 요청자가 관리자인지 확인
    if (approvedBy) {
      const { data: requester } = await supabaseAdmin
        .from('teachers')
        .select('role')
        .eq('user_id', approvedBy)
        .single()
      if (requester?.role !== 'admin') {
        return NextResponse.json({ error: '관리자만 승인할 수 있습니다.' }, { status: 403 })
      }
    }

    const { error } = await supabaseAdmin
      .from('attendance_log')
      .update({
        approved: approved ?? true,
        approved_by: approved !== false ? (approvedBy ?? null) : null,
        approved_at: approved !== false ? new Date().toISOString() : null,
      })
      .eq('id', logId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
