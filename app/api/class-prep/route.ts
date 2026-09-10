import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import JSZip from 'jszip'

// today study.xlsx 원본 양식을 100% 그대로 복제해서(스타일/로고/머리말/인쇄설정 등 전부 유지),
// 학생마다 시트를 하나씩 추가한 "한 개의 워크북(여러 시트)"을 생성한다.
// sharedStrings.xml은 워크북 전체에서 공유되므로, 학생별로 필요한 5개 문구
// (날짜/학교명/이름/지난숙제/오늘의진도)를 각각 새 항목으로 추가하고,
// 원본 시트(xl/worksheets/sheet1.xml)를 복제한 시트에서 해당 셀이 그 새 인덱스를
// 참조하도록 바꿔치기한다.
const TEMPLATE_PATH = path.join(process.cwd(), 'lib', 'templates', 'today-study-template.xlsx')

// 원본 시트에서 5개 문구가 들어가는 셀 좌표(A5=날짜, H5=학교명, H7=이름, A12=지난숙제, A17=오늘의 진도)
const CELL_REFS = { date: 'A5', school: 'H5', name: 'H7', prevHomework: 'A12', progress: 'A17' } as const

// 원본 sharedStrings.xml에서 위 셀들이 가리키는 최초 인덱스(0-indexed) — 1번째(첫) 학생 시트는 그대로 재사용
const SI_DATE = 1
const SI_SCHOOL = 2
const SI_NAME = 3
const SI_PREV_HW = 7
const SI_PROGRESS = 8
const ORIGINAL_UNIQUE_COUNT = 14 // 원본 sharedStrings.xml의 <si> 총 개수

function escapeXml(s: string) {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/\r\n/g, '\n')
}

function patchSharedStringsInPlace(xml: string, replacements: Record<number, string>): string {
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

// 엑셀 시트명 규칙: \ / ? * [ ] : 사용 불가, 31자 이하, 공백만으로는 불가
function sanitizeSheetName(name: string) {
  const cleaned = name.replace(/[\\/?*[\]:]/g, '').trim() || '학생'
  return cleaned.slice(0, 31)
}

function dedupeSheetNames(names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map(n => {
    const count = seen.get(n) ?? 0
    seen.set(n, count + 1)
    if (count === 0) return n
    const suffix = `_${count + 1}`
    return n.slice(0, 31 - suffix.length) + suffix
  })
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
    const zip = await JSZip.loadAsync(templateBuf)

    const sheet1XmlOriginal = await zip.file('xl/worksheets/sheet1.xml')?.async('string')
    const sheet1RelsOriginal = await zip.file('xl/worksheets/_rels/sheet1.xml.rels')?.async('string')
    let sharedStringsXml = await zip.file('xl/sharedStrings.xml')?.async('string')
    let workbookXml = await zip.file('xl/workbook.xml')?.async('string')
    let workbookRelsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string')
    let contentTypesXml = await zip.file('[Content_Types].xml')?.async('string')
    if (!sheet1XmlOriginal || !sheet1RelsOriginal || !sharedStringsXml || !workbookXml || !workbookRelsXml || !contentTypesXml) {
      return NextResponse.json({ error: '템플릿 파일을 읽을 수 없습니다.' }, { status: 500 })
    }

    const sheetNames = dedupeSheetNames(students.map(s => sanitizeSheetName(s.name)))

    // 1) 첫 번째 학생 — 기존 sheet1.xml/시트1 그대로 사용, sharedStrings의 원래 인덱스만 치환
    const first = students[0]
    sharedStringsXml = patchSharedStringsInPlace(sharedStringsXml, {
      [SI_DATE]: dateLabel,
      [SI_SCHOOL]: first.school || '',
      [SI_NAME]: first.name,
      [SI_PREV_HW]: first.prevHomework || '(지난 숙제 없음)',
      [SI_PROGRESS]: first.progress || '',
    })
    // workbook.xml의 첫 시트 이름을 학생 이름으로 변경
    workbookXml = workbookXml.replace(/<sheet name="Sheet1"/, `<sheet name="${escapeXml(sheetNames[0])}"`)

    let nextSiIndex = ORIGINAL_UNIQUE_COUNT
    const newSiBlocks: string[] = []
    const newSheetEntries: string[] = []
    const newRelEntries: string[] = []
    const newContentTypeEntries: string[] = []
    let nextRelId = 5 // rId1~4는 워크북 레벨에서 이미 사용 중(sheet1/theme/styles/sharedStrings)
    let nextSheetId = 2

    // 2) 두 번째 학생부터 — 시트를 복제하고 필요한 5개 문구를 새 shared string으로 추가
    for (let i = 1; i < students.length; i++) {
      const s = students[i]
      const sheetNum = i + 1
      const idxDate = nextSiIndex++
      const idxSchool = nextSiIndex++
      const idxName = nextSiIndex++
      const idxPrevHw = nextSiIndex++
      const idxProgress = nextSiIndex++

      newSiBlocks.push(
        `<si><t xml:space="preserve">${escapeXml(dateLabel)}</t></si>`,
        `<si><t xml:space="preserve">${escapeXml(s.school || '')}</t></si>`,
        `<si><t xml:space="preserve">${escapeXml(s.name)}</t></si>`,
        `<si><t xml:space="preserve">${escapeXml(s.prevHomework || '(지난 숙제 없음)')}</t></si>`,
        `<si><t xml:space="preserve">${escapeXml(s.progress || '')}</t></si>`,
      )

      let sheetXml = sheet1XmlOriginal
      const cellPatches: Array<[string, number]> = [
        [CELL_REFS.date, idxDate],
        [CELL_REFS.school, idxSchool],
        [CELL_REFS.name, idxName],
        [CELL_REFS.prevHomework, idxPrevHw],
        [CELL_REFS.progress, idxProgress],
      ]
      for (const [ref, idx] of cellPatches) {
        sheetXml = sheetXml.replace(
          new RegExp(`(<c r="${ref}"[^>]*><v>)\\d+(</v></c>)`),
          `$1${idx}$2`,
        )
      }

      zip.file(`xl/worksheets/sheet${sheetNum}.xml`, sheetXml)
      zip.file(`xl/worksheets/_rels/sheet${sheetNum}.xml.rels`, sheet1RelsOriginal)

      const relId = `rId${nextRelId++}`
      const sheetId = nextSheetId++
      newSheetEntries.push(`<sheet name="${escapeXml(sheetNames[i])}" sheetId="${sheetId}" r:id="${relId}"/>`)
      newRelEntries.push(`<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${sheetNum}.xml"/>`)
      newContentTypeEntries.push(`<Override PartName="/xl/worksheets/sheet${sheetNum}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    }

    if (newSiBlocks.length > 0) {
      const newCount = ORIGINAL_UNIQUE_COUNT + newSiBlocks.length
      sharedStringsXml = sharedStringsXml
        .replace(/count="\d+" uniqueCount="\d+"/, `count="${newCount}" uniqueCount="${newCount}"`)
        .replace('</sst>', newSiBlocks.join('') + '</sst>')
      workbookXml = workbookXml.replace('</sheets>', newSheetEntries.join('') + '</sheets>')
      workbookRelsXml = workbookRelsXml.replace('</Relationships>', newRelEntries.join('') + '</Relationships>')
      contentTypesXml = contentTypesXml.replace('</Types>', newContentTypeEntries.join('') + '</Types>')
    }

    zip.file('xl/sharedStrings.xml', sharedStringsXml)
    zip.file('xl/workbook.xml', workbookXml)
    zip.file('xl/_rels/workbook.xml.rels', workbookRelsXml)
    zip.file('[Content_Types].xml', contentTypesXml)

    const xlsxBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
    const fileName = `오늘의공부_${sanitizeFileName(className)}.xlsx`

    return new NextResponse(new Uint8Array(xlsxBuf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 })
  }
}
