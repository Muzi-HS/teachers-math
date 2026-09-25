import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin-api-auth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const authorization = await requireAdmin(req, supabaseAdmin)
    if (authorization.response) return authorization.response
    const { logId, approved } = await req.json()

    if (!logId) return NextResponse.json({ error: 'logId required' }, { status: 400 })

    const { error } = await supabaseAdmin
      .from('attendance_log')
      .update({
        approved: approved ?? true,
        approved_by: approved !== false ? authorization.userId : null,
        approved_at: approved !== false ? new Date().toISOString() : null,
      })
      .eq('id', logId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
