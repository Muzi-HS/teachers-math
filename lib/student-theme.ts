export const STUDENT_THEMES = ['green', 'giants-light', 'giants-uniform', 'university-snu', 'university-yonsei', 'university-korea'] as const
export type StudentTheme = typeof STUDENT_THEMES[number]
export type UniversityTheme = Extract<StudentTheme, `university-${string}`>
export const UNIVERSITY_THEMES: Record<UniversityTheme, { name: string; short: string; english: string; motto: string; motif: string }> = {
  'university-snu': { name: '서울대학교', short: 'SNU', english: 'SEOUL NATIONAL UNIVERSITY', motto: '진리는 나의 빛', motif: '월계관과 횃불 · 딥 블루' },
  'university-yonsei': { name: '연세대학교', short: 'YONSEI', english: 'YONSEI UNIVERSITY', motto: '진리가 너희를 자유케 하리라', motif: '독수리의 비상 · 로열 블루' },
  'university-korea': { name: '고려대학교', short: 'KOREA', english: 'KOREA UNIVERSITY', motto: '너의 젊음을 고대에 걸어라, 고대는 너에게 세계를 걸겠다', motif: '호랑이의 기상 · 크림슨' },
}
export function isUniversityTheme(theme: StudentTheme): theme is UniversityTheme { return theme.startsWith('university-') }
export function isGiantsTheme(theme: StudentTheme) { return theme.startsWith('giants-') }
export function isStudentTheme(value: unknown): value is StudentTheme {
  return typeof value === 'string' && STUDENT_THEMES.includes(value as StudentTheme)
}
export const STUDENT_THEME_BUCKET = 'student-preferences'
export function studentThemePath(studentId: number) { return `${studentId}/theme.json` }
