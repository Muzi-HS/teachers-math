/** 현재 시각을 KST(UTC+9) 기준 Date 객체로 반환 */
export function kstNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
}

/** 현재 날짜를 KST 기준 'YYYY-MM-DD' 문자열로 반환 */
export function kstDateStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
}

/** UTC 타임스탬프 문자열을 KST 기준 'YYYY-MM-DD'로 변환 */
export function kstDateOf(utcStr: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(utcStr))
}
