export const STUDENT_THEMES = ['green', 'giants-light', 'giants-uniform'] as const
export type StudentTheme = typeof STUDENT_THEMES[number]
export function isStudentTheme(value: unknown): value is StudentTheme {
  return typeof value === 'string' && STUDENT_THEMES.includes(value as StudentTheme)
}
export const STUDENT_THEME_BUCKET = 'student-preferences'
export function studentThemePath(studentId: number) { return `${studentId}/theme.json` }
