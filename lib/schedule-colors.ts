export const scheduleColors = [
  { name: '파랑', color: '#2563eb', bg: '#eff6ff' },
  { name: '초록', color: '#15803d', bg: '#f0fdf4' },
  { name: '주황', color: '#c2410c', bg: '#fff7ed' },
  { name: '빨강', color: '#dc2626', bg: '#fef2f2' },
  { name: '보라', color: '#7c3aed', bg: '#f5f3ff' },
  { name: '분홍', color: '#be185d', bg: '#fdf2f8' },
  { name: '청록', color: '#0e7490', bg: '#ecfeff' },
]
export function scheduleColor(category: string) {
  const legacy: Record<string, string> = { '업무': '파랑', '회의': '보라', '상담': '초록', '준비': '주황', '기타': '청록' }
  return scheduleColors.find(item => item.name === (legacy[category] ?? category)) ?? scheduleColors[0]
}
