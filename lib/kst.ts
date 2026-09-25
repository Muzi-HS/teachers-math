// 목록·차트에서 반복 호출해도 포매터는 재사용한다.
const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })
const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false })

function timestampWithZone(value: string): string {
  // 날짜만 있는 값과 명시된 양수/음수 시차는 보존한다.
  return value.length > 10 && !/[Z+-]/i.test(value.slice(10)) ? value + 'Z' : value
}

/** 현재 시각을 KST(UTC+9) 기준 Date 객체로 반환 */
export function kstNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
}

/** 현재 날짜를 KST 기준 'YYYY-MM-DD' 문자열로 반환 */
export function kstDateStr(): string {
  return dateFormatter.format(new Date())
}

/** UTC 타임스탬프/날짜 문자열을 KST 기준 'YYYY-MM-DD'로 변환 */
export function kstDateOf(utcStr: string): string {
  return dateFormatter.format(new Date(timestampWithZone(utcStr)))
}

/** UTC 타임스탬프를 KST 기준 'HH:mm'으로 변환 */
export function kstTimeOf(utcStr: string): string {
  return timeFormatter.format(new Date(timestampWithZone(utcStr)))
}

/** UTC 타임스탬프를 KST 기준 'YYYY-MM-DD HH:mm'으로 변환 */
export function kstDateTimeOf(utcStr: string): string {
  return `${kstDateOf(utcStr)} ${kstTimeOf(utcStr)}`
}

