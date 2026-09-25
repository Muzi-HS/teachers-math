import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PROJECT_ID = 'teachers-math'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function createServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
}

async function getFcmAccessToken(): Promise<string> {
  const CLIENT_EMAIL = Deno.env.get('FIREBASE_CLIENT_EMAIL')!
  const PRIVATE_KEY = Deno.env.get('FIREBASE_PRIVATE_KEY')!.replace(/\\n/g, '\n')

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

export interface FcmPushPayload {
  title: string
  body: string
  link: string
}

export async function sendFcmToTokens(
  tokens: string[],
  payload: FcmPushPayload,
  logLabel: string
): Promise<{ sent: number; total: number }> {
  if (tokens.length === 0) return { sent: 0, total: 0 }

  const accessToken = await getFcmAccessToken()

  const results = await Promise.allSettled(
    tokens.map(async (token) => {
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            // notification 페이로드 제거 — FCM 자동 표시 방지, onBackgroundMessage에서만 1번 표시
            data: payload,
            webpush: {
              headers: {
                Urgency: 'high',
              },
            },
          },
        }),
      })
      const json = await r.json()
      if (!r.ok) throw new Error(json?.error?.message || 'FCM 전송 실패')
      return json
    })
  )

  const sent = results.filter(r => r.status === 'fulfilled').length
  console.log(`${logLabel}: ${sent}/${tokens.length}`)
  return { sent, total: tokens.length }
}
