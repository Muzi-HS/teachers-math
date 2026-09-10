import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import JSZip from 'jszip'

// today study.xlsx 원본 양식을 100% 그대로 복제해서(스타일/로고/머리말/인쇄설정 등 전부 유지),
// 시트 1개 안에 학생별 블록(원본과 동일한 46행 레이아웃)을 세로로 이어 붙이고,
// 블록 경계마다 강제 페이지 나누기를 넣어 인쇄 시 학생별로 페이지가 나뉘도록 만든다.
// sharedStrings.xml은 워크북 전체에서 공유되므로, 학생별로 필요한 5개 문구
// (날짜/학교명/이름/지난숙제/오늘의진도)를 각각 새 항목으로 추가하고
// 해당 블록의 셀이 그 새 인덱스를 참조하도록 patch한다.
const TEMPLATE_PATH = path.join(process.cwd(), 'lib', 'templates', 'today-study-template.xlsx')

// 원본 시트 1블록의 높이(행 수) — dimension ref="A1:J46" 기준
const ROWS_PER_BLOCK = 46

// 원본 시트에서 5개 문구가 들어가는 셀 좌표(A5=날짜, H5=학교명, H7=이름, A12=지난숙제, A17=오늘의 진도)
const CELL_REFS = { date: 'A5', school: 'H5', name: 'H7', prevHomework: 'A12', progress: 'A17' } as const

const ORIGINAL_UNIQUE_COUNT = 14 // 원본 sharedStrings.xml의 <si> 총 개수

function escapeXml(s: string) {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/\r\n/g, '\n')
}

function sanitizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '').trim() || '학생'
}

function sanitizeSheetName(name: string) {
  const cleaned = name.replace(/[\\/?*[\]:]/g, '').trim() || '학생'
  return cleaned.slice(0, 31)
}

// <row r="N" ...>...<c r="A5" .../>...</row> 형태의 행 번호(r 속성)를 offset만큼 밀어준다.
function shiftRowRefs(xml: string, offset: number): string {
  if (offset === 0) return xml
  return xml
    .replace(/(<row r=")(\d+)(")/g, (_, a, n, b) => a + (Number(n) + offset) + b)
    .replace(/(<c r="[A-Z]+)(\d+)(")/g, (_, a, n, b) => a + (Number(n) + offset) + b)
}

// <mergeCell ref="A1:J4"/> 형태의 좌표를 offset만큼 밀어준다.
function shiftMergeRefs(xml: string, offset: number): string {
  if (offset === 0) return xml
  return xml.replace(/([A-Z]+)(\d+):([A-Z]+)(\d+)/g, (_, c1, r1, c2, r2) =>
    `${c1}${Number(r1) + offset}:${c2}${Number(r2) + offset}`)
}

// 지정한 셀(A5 등, offset 적용 전 원본 좌표 기준)의 <v> 값을 새 shared string 인덱스로 바꾼다.
function patchCellValue(blockXml: string, ref: string, offset: number, newIndex: number): string {
  const shiftedRow = Number(ref.match(/\d+/)![0]) + offset
  const col = ref.match(/[A-Z]+/)![0]
  const shiftedRef = `${col}${shiftedRow}`
  return blockXml.replace(
    new RegExp(`(<c r="${shiftedRef}"[^>]*><v>)\\d+(</v></c>)`),
    `$1${newIndex}$2`,
  )
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

    const sheetXmlOriginal = await zip.file('xl/worksheets/sheet1.xml')?.async('string')
    let sharedStringsXml = await zip.file('xl/sharedStrings.xml')?.async('string')
    let workbookXml = await zip.file('xl/workbook.xml')?.async('string')
    if (!sheetXmlOriginal || !sharedStringsXml || !workbookXml) {
      return NextResponse.json({ error: '템플릿 파일을 읽을 수 없습니다.' }, { status: 500 })
    }

    const sheetDataMatch = sheetXmlOriginal.match(/<sheetData>([\s\S]*?)<\/sheetData>/)
    const mergeCellsMatch = sheetXmlOriginal.match(/<mergeCells count="(\d+)">([\s\S]*?)<\/mergeCells>/)
    if (!sheetDataMatch || !mergeCellsMatch) {
      return NextResponse.json({ error: '원본 시트 구조를 해석할 수 없습니다.' }, { status: 500 })
    }
    const sheetDataTemplate = sheetDataMatch[1]
    const mergeCellsTemplate = mergeCellsMatch[2]
    const mergesPerBlock = Number(mergeCellsMatch[1])

    let nextSiIndex = ORIGINAL_UNIQUE_COUNT
    const newSiBlocks: string[] = []
    const blocks: string[] = []
    const mergeBlocks: string[] = []

    students.forEach((s, i) => {
      const offset = i * ROWS_PER_BLOCK
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

      let block = shiftRowRefs(sheetDataTemplate, offset)
      block = patchCellValue(block, CELL_REFS.date, offset, idxDate)
      block = patchCellValue(block, CELL_REFS.school, offset, idxSchool)
      block = patchCellValue(block, CELL_REFS.name, offset, idxName)
      block = patchCellValue(block, CELL_REFS.prevHomework, offset, idxPrevHw)
      block = patchCellValue(block, CELL_REFS.progress, offset, idxProgress)
      blocks.push(block)

      mergeBlocks.push(shiftMergeRefs(mergeCellsTemplate, offset))
    })

    const totalRows = students.length * ROWS_PER_BLOCK
    const newCount = ORIGINAL_UNIQUE_COUNT + newSiBlocks.length
    sharedStringsXml = sharedStringsXml
      .replace(/count="\d+" uniqueCount="\d+"/, `count="${newCount}" uniqueCount="${newCount}"`)
      .replace('</sst>', newSiBlocks.join('') + '</sst>')

    let sheetXml = sheetXmlOriginal
      .replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${blocks.join('')}</sheetData>`)
      .replace(
        /<mergeCells count="\d+">[\s\S]*?<\/mergeCells>/,
        `<mergeCells count="${mergesPerBlock * students.length}">${mergeBlocks.join('')}</mergeCells>`,
      )
      .replace(/<dimension ref="A1:J\d+"\/>/, `<dimension ref="A1:J${totalRows}"/>`)
      // fitToPage(전체를 1페이지로 압축) 상태에서 fitToHeight를 명시적으로 0으로 두어
      // 세로로는 압축하지 않고(가로만 1페이지 폭에 맞춤) 페이지 나누기가 그대로 반영되게 한다.
      .replace(/<pageSetup ([^/]*)\/>/, (_, attrs) => `<pageSetup ${attrs} fitToWidth="1" fitToHeight="0"/>`)

    // 학생 블록 경계마다 강제 페이지 나누기 삽입 (마지막 블록 뒤는 제외)
    if (students.length > 1) {
      const breaks = Array.from({ length: students.length - 1 }, (_, i) =>
        `<brk id="${(i + 1) * ROWS_PER_BLOCK}" max="16383" man="1"/>`).join('')
      const rowBreaksXml = `<rowBreaks count="${students.length - 1}" manualBreakCount="${students.length - 1}">${breaks}</rowBreaks>`
      sheetXml = sheetXml.includes('</headerFooter>')
        ? sheetXml.replace('</headerFooter>', '</headerFooter>' + rowBreaksXml)
        : sheetXml.replace('<legacyDrawingHF', rowBreaksXml + '<legacyDrawingHF')
    }

    workbookXml = workbookXml.replace(/<sheet name="[^"]*"/, `<sheet name="${escapeXml(sanitizeSheetName(className))}"`)

    zip.file('xl/worksheets/sheet1.xml', sheetXml)
    zip.file('xl/sharedStrings.xml', sharedStringsXml)
    zip.file('xl/workbook.xml', workbookXml)

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
