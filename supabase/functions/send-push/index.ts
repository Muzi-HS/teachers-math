import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, createServiceClient, sendFcmToTokens } from '../_shared/fcm.ts'

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { parent_phone, student_id, title, body, link } = await req.json()

    const supabase = createServiceClient()

    // student_id가 오면 학생 본인에게, 아니면 기존처럼 parent_phone으로 학부모에게 보낸다.
    let tokens: { token: string }[] | null = null
    if (student_id) {
      const { data } = await supabase.from('fcm_tokens').select('token').eq('student_id', student_id)
      tokens = data
    } else {
      const normalized = parent_phone.replace(/-/g, '')
      const { data: parent } = await supabase
        .from('parents')
        .select('id')
        .eq('phone', normalized)
        .single()

      if (!parent) {
        return new Response(JSON.stringify({ message: '학부모 없음' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data } = await supabase
        .from('fcm_tokens')
        .select('token')
        .eq('parent_id', parent.id)
      tokens = data
    }

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ message: 'FCM 토큰 없음' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { sent, total } = await sendFcmToTokens(
      tokens.map(t => t.token),
      { title, body, link: link || (student_id ? '/student/records' : '/parent/records') },
      '푸시 발송'
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
