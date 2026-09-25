import { supabase } from './supabase'

/** 기존 Supabase 로그인 세션을 내부 API에 전달한다. 쓰기 요청을 자동 재시도하지 않는다. */
export async function staffFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!path.startsWith('/api/')) throw new Error('내부 API 경로만 사용할 수 있습니다.')
  try {
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error || !session) return Response.json({ error: '다시 로그인해 주세요.' }, { status: 401 })
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${session.access_token}`)
    return await fetch(path, { ...init, headers, redirect: 'error' })
  } catch {
    return Response.json({ error: '서버에 연결하지 못했습니다. 처리 결과를 확인한 후 다시 시도해 주세요.' }, { status: 503 })
  }
}
