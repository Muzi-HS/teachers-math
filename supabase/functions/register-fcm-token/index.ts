import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  try {
    const { parent_id, student_id, token, session_token } = await req.json()

    if ((!parent_id && !student_id) || !token || !session_token) {
      return new Response(
        JSON.stringify({ error: 'parent_id 또는 student_id, token, session_token이 필요합니다.' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }
    // 소유자 컬럼(parent_id/student_id) — 정확히 하나만 채운다
    const ownerCol = parent_id ? 'parent_id' : 'student_id'
    const ownerId = parent_id ?? student_id

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // session_token이 요청 본문의 parent_id/student_id를 실제로 가리키는지 서버에서
    // 확인한다 — 그렇지 않으면 남의 parent_id/student_id를 넣어서 그 사람의 알림
    // 수신처를 내 기기로 바꿔치기할 수 있었다.
    let authorized = false
    if (student_id) {
      const { data } = await supabase.rpc('session_owns_student', { p_token: session_token, p_student_id: student_id })
      authorized = data === true
    } else {
      const { data } = await supabase.rpc('session_subject', { p_token: session_token }).maybeSingle()
      authorized = !!data && data.subject_type === 'parent' && data.subject_id === parent_id
    }
    if (!authorized) {
      return new Response(
        JSON.stringify({ error: '이 계정으로 등록할 권한이 없습니다. 다시 로그인해 주세요.' }),
        { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // 이미 동일 토큰이 등록된 경우 → 중복 저장 불필요
    const { data: existing } = await supabase
      .from('fcm_tokens')
      .select('id')
      .eq(ownerCol, ownerId)
      .eq('token', token)
      .maybeSingle()

    if (existing) {
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // 새 토큰을 먼저 저장하고, 저장이 확실히 성공한 뒤에만 같은 소유자의 나머지(오래된)
    // 토큰을 정리한다 — 예전에는 삭제 후 삽입 순서였는데, 삭제는 성공하고 삽입이
    // 실패하면(일시적 오류 등) 그 학부모의 토큰이 통째로 사라져 버려서 알림이 영구히
    // 안 가는 문제가 있었다 (강서현 학생 학부모 사례로 확인됨)
    const { error: insertError } = await supabase
      .from('fcm_tokens')
      .insert({ [ownerCol]: ownerId, token })

    if (insertError) {
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // 새 토큰 저장 확인 후 같은 소유자의 다른 토큰들만 정리 (중복 푸시 방지)
    await supabase
      .from('fcm_tokens')
      .delete()
      .eq(ownerCol, ownerId)
      .neq('token', token)

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
