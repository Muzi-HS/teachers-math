/** Escape text and fold UTF-8 lines as required by the vCard 3.0 format. */
export function createContactVCard(name: string, phone: string): string {
  const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
  const number = phone.replace(/[^\d+]/g, '')
  if (!/\+?\d{7,15}$/.test(number)) throw new Error('유효한 전화번호가 없습니다.')
  const fold = (line: string) => {
    const lines: string[] = []
    let current = ''
    let bytes = 0
    for (const char of line) {
      const size = new TextEncoder().encode(char).length
      if (bytes + size > 75) {
        lines.push(current)
        current = ' '
        bytes = 1
      }
      current += char
      bytes += size
    }
    lines.push(current)
    return lines.join('\r\n')
  }
  return ['BEGIN:VCARD', 'VERSION:3.0', `N:${escape(name)};;;;`, `FN:${escape(name)}`, `TEL;TYPE=CELL:${number}`, 'END:VCARD'].map(fold).join('\r\n') + '\r\n'
}

export function downloadContact(name: string, phone: string) {
  const blob = new Blob([createContactVCard(name, phone)], { type: 'text/vcard;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const filename = Array.from(name, char => char.charCodeAt(0) < 32 ? '_' : char).join('')
  link.download = `${filename.replace(/[<>:"/\\|?*]/g, '_')}.vcf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Allow mobile browsers time to open or download the file before releasing it.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
