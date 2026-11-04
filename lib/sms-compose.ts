export function parentPhone(value: string | null | undefined): string | null {
  const phone = (value ?? '').replace(/[\s()-]/g, '').replace(/^\+82/, '0')
  return /^01[016789]\d{7,8}$/.test(phone) ? phone : null
}

export function unreadStudentIds(studentIds: number[], targets: number[], reads: number[]): number[] {
  const targetSet = new Set(targets)
  const readSet = new Set(reads)
  return studentIds.filter(id => (!targets.length || targetSet.has(id)) && !readSet.has(id))
}

export function smsComposeUrl(phones: string[], body: string, ios: boolean): string {
  const recipients = [...new Set(phones.map(parentPhone).filter((p): p is string => p !== null))]
  if (!recipients.length || !body.trim()) throw new Error('수신번호와 내용을 확인해주세요.')
  return `sms:${recipients.join(ios ? ',' : ';')}${ios ? '&' : '?'}body=${encodeURIComponent(body)}`
}
