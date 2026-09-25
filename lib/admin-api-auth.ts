import type { SupabaseClient } from '@supabase/supabase-js'

type AdminAuthorization = { userId: string; response?: never } | { userId?: never; response: Response }

/** 요청 본문의 사용자 ID가 아닌, Auth 서버가 검증한 토큰의 사용자만 신뢰한다. */
export async function requireAdmin(request: Request, db: SupabaseClient): Promise<AdminAuthorization> {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!token) return { response: Response.json({ error: '로그인이 필요합니다.' }, { status: 401 }) }
  try {
    const { data: { user }, error } = await db.auth.getUser(token)
    if (error || !user) return { response: Response.json({ error: '로그인이 만료되었습니다. 다시 로그인해 주세요.' }, { status: 401 }) }
    const { data: profile, error: profileError } = await db.from('teachers')
      .select('role,approved').eq('user_id', user.id).maybeSingle()
    if (profileError) return { response: Response.json({ error: '권한 확인에 실패했습니다. 다시 시도해 주세요.' }, { status: 503 }) }
    if (profile?.role !== 'admin' || profile.approved !== true) {
      return { response: Response.json({ error: '승인된 관리자만 사용할 수 있습니다.' }, { status: 403 }) }
    }
    return { userId: user.id }
  } catch {
    return { response: Response.json({ error: '인증 서버에 연결할 수 없습니다. 다시 시도해 주세요.' }, { status: 503 }) }
  }
}
