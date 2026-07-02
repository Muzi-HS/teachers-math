import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json()

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: '발송할 메시지가 없습니다.' }, { status: 400 })
    }

    const apiKey    = process.env.SOLAPI_API_KEY!
    const apiSecret = process.env.SOLAPI_API_SECRET!
    const sender    = process.env.SOLAPI_SENDER!

    // 솔라피 HMAC 인증 헤더 생성
    const date      = new Date().toISOString()
    const salt      = Math.random().toString(36).substring(2, 12)
    const hmac      = crypto.createHmac('sha256', apiSecret)
    hmac.update(date + salt)
    const signature = hmac.digest('hex')

    const authHeader = `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`

    // 메시지 길이에 따라 SMS(90자 이하) / LMS(90자 초과) 자동 선택
    const payload = {
      messages: messages.map((m: { to: string; text: string }) => {
        const to   = m.to.replace(/-/g, '')   // 하이픈 제거
        const from = sender.replace(/-/g, '')  // 하이픈 제거
        const type = m.text.length > 90 ? 'LMS' : 'SMS'

        return {
          to,
          from,
          text: m.text,
          type,
          ...(type === 'LMS' ? { subject: '[티처스수학] 수업 알림' } : {}),
        }
      }),
    }

    console.log('솔라피 요청 payload:', JSON.stringify(payload, null, 2))

    const res = await fetch('https://api.solapi.com/messages/v4/send-many', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify(payload),
    })

    const result = await res.json()
    console.log('솔라피 응답:', JSON.stringify(result, null, 2))

    if (!res.ok) {
      return NextResponse.json(
        { error: result.errorMessage || result.errorCode || '발송 실패' },
        { status: res.status }
      )
    }

    return NextResponse.json(result)

  } catch (e: any) {
    console.error('SMS API 오류:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}