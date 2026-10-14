import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isStudentTheme, STUDENT_THEME_BUCKET, studentThemePath } from '@/lib/student-theme'

export const runtime = 'nodejs'
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
async function authenticate(req: NextRequest) {
  const token = req.headers.get('authorization')?.match(/^Bearer ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)?.[1]
  if (!token) return null
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('Missing server configuration')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await db.from('client_sessions').select('subject_id').eq('token', token).eq('subject_type', 'student').gt('expires_at', new Date().toISOString()).maybeSingle()
  if (error) throw error
  return data ? { db, studentId: data.subject_id as number } : null
}
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticate(req)
    if (!auth) return reply({ error: '학생 로그인이 필요합니다.' }, 401)
    const { data, error } = await auth.db.storage.from(STUDENT_THEME_BUCKET).download(studentThemePath(auth.studentId))
    if (error) {
      if (/not found|does not exist/i.test(error.message)) return reply({ theme: 'green' })
      throw error
    }
    const saved = JSON.parse(await data.text())
    return reply({ theme: isStudentTheme(saved.theme) ? saved.theme : 'green' })
  } catch { return reply({ error: '테마를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' }, 503) }
}
export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin) return reply({ error: '허용되지 않은 요청입니다.' }, 403)
  try {
    const auth = await authenticate(req)
    if (!auth) return reply({ error: '학생 로그인이 필요합니다.' }, 401)
    const input = await req.json().catch(() => null)
    if (!isStudentTheme(input?.theme)) return reply({ error: '테마를 다시 선택해주세요.' }, 400)
    // This private bucket has no client policies. Only this authenticated server route
    // can read/write the preference at the session owner's path.
    const { data: bucket, error: lookupError } = await auth.db.storage.getBucket(STUDENT_THEME_BUCKET)
    if (!bucket) {
      if (lookupError && !/not found|does not exist/i.test(lookupError.message)) throw lookupError
      const { error } = await auth.db.storage.createBucket(STUDENT_THEME_BUCKET, { public: false, allowedMimeTypes: ['application/json'], fileSizeLimit: 1024 })
      if (error && !/already exists|duplicate/i.test(error.message)) throw error
    } else if (bucket.public) throw new Error('Preference bucket must be private')
    const { error } = await auth.db.storage.from(STUDENT_THEME_BUCKET).upload(studentThemePath(auth.studentId), JSON.stringify({ theme: input.theme }), { contentType: 'application/json', upsert: true, cacheControl: '0' })
    if (error) throw error
    return reply({ theme: input.theme })
  } catch { return reply({ error: '저장하지 못했습니다. 다시 시도해주세요.' }, 503) }
}
