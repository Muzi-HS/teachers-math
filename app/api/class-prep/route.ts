import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import JSZip from 'jszip'

// today study.xlsx 원본 양식을 100% 그대로 복제해서(스타일/로고/머리말/인쇄설정 등 전부 유지),
// xl/sharedStrings.xml 안의 5개 안내 문구(날짜/학교명/이름/지난숙제/오늘의진도)만
// 실제 값으로 치환한다. 학생마다 원본 템플릿을 새로 복제하므로 서로 영향을 주지 않는다.
const TEMPLATE_PATH = path.join(process.cwd(), 'lib', 'templates', 'today-study-template.xlsx')

// sharedStrings.xml 안에서 치환할 <si> 순서(0-indexed) — 원본 양식 그대로 유지
const SI_DATE = 1     // "날짜(예시 : 2026.09.10(수))"
const SI_SCHOOL = 2   // "학교명(예시:아주중학교)"
const SI_NAME = 3     // "이름(예시:정현수)"
const SI_PREV_HW = 7  // "  (지난숙제)"
const SI_PROGRESS = 8 // "  (오늘의 진도)"

function escapeXml(s: string) {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/\r\n/g, '\n')
}

function patchSharedStrings(xml: string, replacements: Record<number, string>): string {
  let idx = -1
  return xml.replace(/<si>[\s\S]*?<\/si>/g, (block) => {
    idx++
    if (!(idx in replacements)) return block
    const text = escapeXml(replacements[idx] ?? '')
    return block.replace(/<t[^>]*>[\s\S]*?<\/t>/, `<t xml:space="preserve">${text}</t>`)
  })
}

function sanitizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '').trim() || '학생'
}

type StudentInput = { name: string; school: string; prevHomework: string; progress: string }

export async function POST(req: NextRequest) {
  try {
    const { className, dateLabel, students } = await req.json() as {
      className: string; dateLabel: string; students: StudentInput[]
    }
    if (!Array.isArray(students) || students.length === 0) {
      return NextResponse.json({ error: 'students가 필요합니다.' }, { status: 400 })
    }

    const templateBuf = await readFile(TEMPLATE_PATH)

    const outerZip = new JSZip()
    for (const s of students) {
      const zip = await JSZip.loadAsync(templateBuf)
      const sharedStringsPath = 'xl/sharedStrings.xml'
      const original = await zip.file(sharedStringsPath)?.async('string')
      if (!original) continue

      const patched = patchSharedStrings(original, {
        [SI_DATE]: dateLabel,
        [SI_SCHOOL]: s.school || '',
        [SI_NAME]: s.name,
        [SI_PREV_HW]: s.prevHomework || '(지난 숙제 없음)',
        [SI_PROGRESS]: s.progress || '',
      })
      zip.file(sharedStringsPath, patched)

      const studentBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
      outerZip.file(`${sanitizeFileName(s.name)}_오늘의공부.xlsx`, studentBuf)
    }

    const zipBuf = await outerZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
    const zipFileName = `오늘의공부_${sanitizeFileName(className)}.zip`

    return new NextResponse(new Uint8Array(zipBuf), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(zipFileName)}`,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 })
  }
}
