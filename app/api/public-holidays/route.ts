import { NextRequest } from 'next/server'

export const runtime = 'nodejs'

function xmlValue(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return match?.[1]?.trim() ?? null
}

function decodeXml(value: string): string {
  return value.replace(/&#(x[0-9a-f]+|\d+);|&(?:amp|lt|gt|quot|apos);/gi, entity => {
    if (entity.startsWith('&#')) {
      const hex = entity[2]?.toLowerCase() === 'x'
      const code = Number.parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10)
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : entity
    }
    return ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" } as Record<string, string>)[entity.toLowerCase()] ?? entity
  })
}

export async function GET(request: NextRequest) {
  const year = Number(request.nextUrl.searchParams.get('year'))
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    return Response.json({ error: '올바른 연도를 입력해 주세요.' }, { status: 400 })
  }

  const key = process.env.KASI_HOLIDAY_API_KEY
  if (!key) return Response.json({ error: '공휴일 API 인증키가 설정되지 않았습니다.' }, { status: 503 })

  const url = new URL('https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo')
  url.searchParams.set('ServiceKey', key)
  url.searchParams.set('solYear', String(year))
  url.searchParams.set('numOfRows', '100')
  url.searchParams.set('pageNo', '1')

  try {
    const response = await fetch(url, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new Error('HTTP response')
    const xml = await response.text()
    if (xmlValue(xml, 'resultCode') !== '00') throw new Error('API response')
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    const holidays = items.flatMap(([, item]) => {
      const date = xmlValue(item, 'locdate')
      const name = xmlValue(item, 'dateName')
      if (xmlValue(item, 'isHoliday') !== 'Y' || !date || !name || !/^\d{8}$/.test(date)) return []
      return [{ date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`, name: decodeXml(name) }]
    })
    return Response.json({ holidays }, { headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' } })
  } catch {
    return Response.json({ error: '공휴일 정보를 불러오지 못했습니다.' }, { status: 502 })
  }
}
