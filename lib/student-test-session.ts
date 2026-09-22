import { createHmac, timingSafeEqual } from 'node:crypto'

export const TEST_SESSION_COOKIE = 'student_test_session'
export function signTestSession(studentId: number, secret: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ studentId, expires: now + 24 * 60 * 60 * 1000 })).toString('base64url')
  return `${payload}.${createHmac('sha256', secret).update(`student-test:${payload}`).digest('base64url')}`
}
export function readTestSession(token: string | undefined, secret: string, now = Date.now()): number | null {
  if (!token) return null
  try {
    const [payload, signature, extra] = token.split('.')
    if (!payload || !signature || extra) return null
    const expected = createHmac('sha256', secret).update(`student-test:${payload}`).digest()
    const actual = Buffer.from(signature, 'base64url')
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return Number.isSafeInteger(value.studentId) && value.studentId > 0 && Number.isFinite(value.expires) && value.expires > now ? value.studentId : null
  } catch { return null }
}
