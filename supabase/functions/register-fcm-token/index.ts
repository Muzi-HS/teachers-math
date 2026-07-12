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

    // 기존 토큰 전부 삭제 후 새 토큰으로 교체 (중복 푸시 방지)
    await supabase
      .from('fcm_tokens')
      .delete()
      .eq('parent_id', parent_id)

    const { error } = await supabase
      .from('fcm_tokens')
      .insert({ parent_id, token })

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

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
