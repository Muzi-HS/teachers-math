import { NextRequest, NextResponse } from 'next/server'

// 네이버 블로그는 공개 API가 없고 RSS만 제공한다. 브라우저에서 바로 fetch하면 CORS로 막히므로
// 서버에서 대신 가져와 필요한 필드만 뽑아 내려준다. 새 패키지 설치 없이 정규식으로 파싱한다.
const BLOG_ID = 'teachers_edu'
const FEED_URL = `https://rss.blog.naver.com/${BLOG_ID}.xml`

function decodeEntities(s: string) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&')
}

function extractTag(block: string, tag: string): string {
  const cdata = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`).exec(block)
  if (cdata) return cdata[1].trim()
  const plain = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(block)
  return plain ? plain[1].trim() : ''
}

function stripHtmlAndExcerpt(description: string, maxLen = 88) {
  const thumbnail = /<img[^>]*src="([^"]+)"/.exec(description)?.[1] ?? null
  const text = decodeEntities(description.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().replace(/\.{3,}\s*$/, '')
  const excerpt = text.length > maxLen ? text.slice(0, maxLen).trim() + '…' : text
  return { excerpt, thumbnail }
}

export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(12, Math.max(1, Number(req.nextUrl.searchParams.get('limit')) || 4))
    const res = await fetch(FEED_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TeachersMathBot/1.0)' },
      next: { revalidate: 3600 }, // 1시간 캐시 — 매 요청마다 네이버에 부담 주지 않는다
    })
    if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`)
    const xml = await res.text()
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, limit).map(([, block]) => {
      const title = decodeEntities(extractTag(block, 'title'))
      const link = extractTag(block, 'link')
      const pubDate = extractTag(block, 'pubDate')
      const { excerpt, thumbnail } = stripHtmlAndExcerpt(extractTag(block, 'description'))
      return { title, link, pubDate, excerpt, thumbnail }
    })
    return NextResponse.json({ items, blogUrl: `https://blog.naver.com/${BLOG_ID}` }, { headers: { 'Cache-Control': 'public, max-age=1800' } })
  } catch (error) {
    console.error('[naver-blog]', error)
    return NextResponse.json({ items: [], blogUrl: `https://blog.naver.com/${BLOG_ID}` }, { status: 200 })
  }
}
