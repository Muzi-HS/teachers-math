import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, createServiceClient, sendFcmToTokens } from '../_shared/fcm.ts'

// 학부모가 새 문의를 등록했을 때 모든 관리자에게 푸시 발송
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { title, body, link } = await req.json()

    const supabase = createServiceClient()

    const { data: tokens } = await supabase
      .from('admin_fcm_tokens')
      .select('token')

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ message: 'FCM 토큰 없음' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { sent, total } = await sendFcmToTokens(
      tokens.map(t => t.token),
      { title, body, link: link || '/inquiries' },
      '관리자 푸시 발송'
    )

    return new Response(
      JSON.stringify({ sent, total }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (e) {
    console.error('오류:', e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
