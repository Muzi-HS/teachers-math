import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readTestSession, signTestSession, TEST_SESSION_COOKIE } from '@/lib/student-test-session'

export const runtime = 'nodejs'
function serverClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('시험 서버 설정을 확인해 주세요.')
  return { key, db: createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } }) }
}
function response(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
}
function sameOrigin(req: NextRequest) {
  return req.headers.get('origin') === req.nextUrl.origin
}
function errorResponse(error: unknown) {
  console.error('[student-tests]', error)
  return response({ error: '시험을 처리하지 못했습니다. 잠시 후 다시 시도하세요.' }, 500)
}

export async function GET(req: NextRequest) {
  try {
    const { db, key } = serverClient()
    const studentId = readTestSession(req.cookies.get(TEST_SESSION_COOKIE)?.value, key)
    if (!studentId || studentId !== Number(req.nextUrl.searchParams.get('studentId'))) return response({ error: '시험 응시를 위해 PIN을 확인해 주세요.' }, 401)
    const { data, error } = await db.rpc('student_test_list', { p_student_id: studentId })
    if (error) return errorResponse(error)
    return response({ tests: data })
  } catch (error) { return errorResponse(error) }
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return response({ error: '허용되지 않은 요청입니다.' }, 403)
  try {
    const body = await req.text()
    if (body.length > 160000) return response({ error: '답안이 너무 큽니다.' }, 400)
    const { action, studentId, pin, testId, answers, revision } = JSON.parse(body)
    const { db, key } = serverClient()
    if (!Number.isSafeInteger(studentId) || studentId <= 0) return response({ error: '학생 정보를 확인하세요.' }, 400)
    if (action === 'verify') {
      if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) return response({ error: 'PIN 네 자리를 입력하세요.' }, 400)
      const { data, error } = await db.rpc('verify_test_student', { p_student_id: studentId, p_pin: pin })
      if (error) return errorResponse(error)
      if (!data) return response({ error: 'PIN이 일치하지 않거나 잠시 잠겼습니다. 5회 실패한 경우 5분 뒤 다시 시도하세요.' }, 401)
      const res = response({ ok: true })
      res.cookies.set(TEST_SESSION_COOKIE, signTestSession(studentId, key), {
        httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/api/student-tests', maxAge: 86400,
      })
      return res
    }
    if (readTestSession(req.cookies.get(TEST_SESSION_COOKIE)?.value, key) !== studentId) return response({ error: '시험 응시를 위해 PIN을 다시 확인해 주세요.' }, 401)
    if (!Number.isSafeInteger(testId) || testId <= 0 || !['start','save','submit','status'].includes(action)) return response({ error: '시험 요청을 확인하세요.' }, 400)
    const { data, error } = await db.rpc('student_test_action', {
      p_student_id: studentId, p_test_id: testId, p_action: action,
      p_answers: answers ?? null, p_revision: revision ?? null,
    })
    if (error) return response({ error: error.code === 'P0001' ? error.message : '시험 처리에 실패했습니다. 다시 시도하세요.' }, 409)
    return response(data)
  } catch (error) { return errorResponse(error) }
}

export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return response({ error: '허용되지 않은 요청입니다.' }, 403)
  const res = response({ ok: true })
  res.cookies.set(TEST_SESSION_COOKIE, '', { httpOnly: true, sameSite: 'strict', path: '/api/student-tests', maxAge: 0 })
  return res
}
