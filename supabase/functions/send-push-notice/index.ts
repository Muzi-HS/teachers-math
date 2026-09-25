import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, createServiceClient, sendFcmToTokens } from '../_shared/fcm.ts'

// 공지사항 등록 시 열람 가능한(대상) 학부모 전원에게 푸시 발송
// student_ids가 없거나 빈 배열이면 전체 학부모, 있으면 그 학생들의 학부모에게만 발송
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { title, body, link, student_ids } = await req.json()

    const supabase = createServiceClient()

    let parentIds: number[] | null = null
    if (Array.isArray(student_ids) && student_ids.length > 0) {
      const { data: ps } = await supabase
        .from('parent_students')
        .select('parent_id')
        .in('student_id', student_ids)
      parentIds = [...new Set((ps ?? []).map((r: { parent_id: number }) => r.parent_id))]
      if (parentIds.length === 0) {
        return new Response(JSON.stringify({ message: '대상 학부모 없음' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    let tokenQuery = supabase.from('fcm_tokens').select('token')
    if (parentIds) tokenQuery = tokenQuery.in('parent_id', parentIds)
    const { data: tokens } = await tokenQuery

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ message: 'FCM 토큰 없음' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { sent, total } = await sendFcmToTokens(
      tokens.map(t => t.token),
      { title, body, link: link || '/parent/notices' },
      '공지사항 푸시 발송'
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
