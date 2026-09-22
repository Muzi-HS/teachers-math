export type ExamQuestionDraft = { points: number | null; choices: number[]; text: string }
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

export type GradedQuestion = { number: number; points: number; kind: 'choice' | 'text'; correctAnswer: number[] | string }
// finalize_test_attempt()의 채점 로직과 동일한 기준(정확한 조합 일치 / 공백 제외 완전 일치)을 클라이언트에서 재현한다.
export function isAnswerCorrect(q: GradedQuestion, submitted: string | number[] | undefined) {
  if (q.kind === 'choice') {
    if (!Array.isArray(submitted) || !Array.isArray(q.correctAnswer)) return false
    const a = [...submitted].sort((x, y) => x - y)
    const b = [...q.correctAnswer].sort((x, y) => x - y)
    return a.length === b.length && a.every((v, i) => v === b[i])
  }
  if (typeof submitted !== 'string' || typeof q.correctAnswer !== 'string') return false
  return submitted.trim() === q.correctAnswer
}
