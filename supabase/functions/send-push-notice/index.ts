import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CLIENT_EMAIL = Deno.env.get('FIREBASE_CLIENT_EMAIL')!
const PRIVATE_KEY = Deno.env.get('FIREBASE_PRIVATE_KEY')!.replace(/\\n/g, '\n')
const PROJECT_ID = 'teachers-math'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }

  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const signingInput = `${encode(header)}.${encode(payload)}`

  const keyData = PRIVATE_KEY
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')

  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  )

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const jwt = `${signingInput}.${sigB64}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  const data = await res.json()
  return data.access_token
}

// 공지사항 등록 시 열람 가능한(대상) 학부모 전원에게 푸시 발송
// student_ids가 없거나 빈 배열이면 전체 학부모, 있으면 그 학생들의 학부모에게만 발송
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { title, body, link, student_ids } = await req.json()

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    let parentIds: number[] | null = null
    if (Array.isArray(student_ids) && student_ids.length > 0) {
      const { data: ps } = await supabase
        .from('parent_students')
        .select('parent_id')
        .in('student_id', student_ids)
      parentIds = [...new Set((ps ?? []).map((r: any) => r.parent_id))]
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

    const accessToken = await getAccessToken()

    const results = await Promise.allSettled(
      tokens.map(async ({ token }) => {
        const r = await fetch(`https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token,
              data: {
                title,
                body,
                link: link || '/parent/notices',
              },
              webpush: {
                headers: {
                  Urgency: 'high',
                },
              },
            },
          }),
        })
        const json = await r.json()
        console.log('FCM 응답:', JSON.stringify(json))
        if (!r.ok) throw new Error(json?.error?.message || 'FCM 전송 실패')
        return json
      })
    )

    const succeeded = results.filter(r => r.status === 'fulfilled').length
    console.log(`공지사항 푸시 발송: ${succeeded}/${tokens.length}`)

    return new Response(
      JSON.stringify({ sent: succeeded, total: tokens.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (e) {
    console.error('오류:', e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
