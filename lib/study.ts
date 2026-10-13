export type StudySession = { id: string; student_id: number; mode: 'timer' | 'stopwatch'; elapsed_seconds: number; goal: string; focus_minutes: number; break_minutes: number; rounds: number; round: number; phase: 'focus' | 'break' | 'ready' | 'done'; paused: boolean; remaining_seconds: number; running_since: string | null; created_at: string; ended_at: string | null; focus_seconds: number; today_seconds: number; week_seconds: number; month_seconds: number }
export type StudyTotal = { student_id: number; today: number; week: number; month: number }
export type StudyReport = { totals: StudyTotal[]; history: StudySession[] }
export type StudyPeriod = 'today' | 'week' | 'month'
export const studyPeriods: { id: StudyPeriod; label: string }[] = [{ id: 'today', label: '오늘' }, { id: 'week', label: '이번 주' }, { id: 'month', label: '이번 달' }]
export function studyDuration(seconds: number) { const m = Math.floor(seconds / 60); return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : m ? `${m}분` : `${Math.floor(seconds)}초` }

export function studyClock(seconds: number) { const s = Math.max(0, Math.floor(seconds)); return `${String(Math.floor(s / 3600)).padStart(2,'0')}:${String(Math.floor(s / 60) % 60).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}` }
export function studyRemaining(session: StudySession, now: number) { return session.running_since ? Math.max(0, Math.ceil(session.remaining_seconds - (now - Date.parse(session.running_since)) / 1000)) : session.remaining_seconds }
export function studyDisplaySeconds(session: StudySession, now: number) { const remaining = studyRemaining(session, now); return session.mode === 'stopwatch' ? session.elapsed_seconds + session.remaining_seconds - remaining : remaining }
