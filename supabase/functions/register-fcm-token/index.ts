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
    const { parent_id, token } = await req.json()

    if (!parent_id || !token) {
      return new Response(
        JSON.stringify({ error: 'parent_id and token are required' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 이미 동일 토큰이 등록된 경우 → 중복 저장 불필요
    const { data: existing } = await supabase
      .from('fcm_tokens')
      .select('id')
      .eq('parent_id', parent_id)
      .eq('token', token)
      .maybeSingle()

    if (existing) {
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // 새 토큰을 먼저 저장하고, 저장이 확실히 성공한 뒤에만 그 parent의 나머지(오래된)
    // 토큰을 정리한다 — 예전에는 삭제 후 삽입 순서였는데, 삭제는 성공하고 삽입이
    // 실패하면(일시적 오류 등) 그 학부모의 토큰이 통째로 사라져 버려서 알림이 영구히
    // 안 가는 문제가 있었다 (강서현 학생 학부모 사례로 확인됨)
    const { error: insertError } = await supabase
      .from('fcm_tokens')
      .insert({ parent_id, token })

    if (insertError) {
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // 새 토큰 저장 확인 후 같은 parent의 다른 토큰들만 정리 (중복 푸시 방지)
    await supabase
      .from('fcm_tokens')
      .delete()
      .eq('parent_id', parent_id)
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
