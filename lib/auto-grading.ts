export type ExamQuestionDraft = { points: number; choices: number[]; text: string }
export type ExamQuestion = { number: number; points: number; kind: 'choice' | 'text'; multiple: boolean }
export type ExamAnswers = Record<string, string | number[]>
export type ExamAttempt = {
  id: number; test_id: number; student_id: number; started_at: string; deadline_at: string
  submitted_at: string | null; answers: ExamAnswers; revision: number
  cor: number | null; score: number | null; earned_points: number | null; total_points: number | null
}
export type ExamState = { server_now: string; name: string; attempt: ExamAttempt; questions: ExamQuestion[] }
export type StudentExam = { id: number; name: string; date: string; total: number; is_published: boolean; attempt: ExamAttempt | null }
export function toggleChoice(current: number[], value: number, multiple = true) {
  return current.includes(value) ? current.filter(x => x !== value) : (multiple ? [...current, value].sort((a,b) => a-b) : [value])
}
export function remainingSeconds(deadline: number, now: number) {
  return Math.max(0, Math.ceil((deadline - now) / 1000))
}
