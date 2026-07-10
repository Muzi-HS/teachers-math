import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FCM_SERVER_KEY = Deno.env.get('FCM_SERVER_KEY')! // Firebase 서비스 계정 키

serve(async (req) => {
  try {
    const { parent_phone, title, body } = await req.json()

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // 전화번호로 parent_id 조회
    const { data: parent } = await supabase
      .from('parents')
      .select('id')
      .eq('phone', parent_phone)
      .single()

    if (!parent) {
      return new Response(JSON.stringify({ error: '학부모를 찾을 수 없습니다.' }), { status: 404 })
    }

    // FCM 토큰 조회
    const { data: tokens } = await supabase
      .from('fcm_tokens')
      .select('token')
      .eq('parent_id', parent.id)

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ message: '등록된 FCM 토큰 없음' }), { status: 200 })
    }

    // FCM 발송
    const results = await Promise.allSettled(
      tokens.map(({ token }) =>
        fetch('https://fcm.googleapis.com/v1/projects/teachers-math/messages:send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${FCM_SERVER_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title, body },
              webpush: {
                notification: {
                  title,
                  body,
                  icon: '/logo.png',
                  badge: '/logo.png',
                  click_action: '/parent/records',
                },
              },
            },
          }),
        })
      )
    )

    const succeeded = results.filter(r => r.status === 'fulfilled').length
    return new Response(JSON.stringify({ sent: succeeded, total: tokens.length }), { status: 200 })

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})
