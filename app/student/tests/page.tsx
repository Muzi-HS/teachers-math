'use client'
/* eslint-disable react-hooks/purity -- Clock reads only run in event/response handlers and timer callbacks, never during render. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { ExamAnswers, ExamState, StudentExam, remainingSeconds, toggleChoice } from '@/lib/auto-grading'

export default function StudentTestsPage() {
  const { student } = useAuth()
  const studentId = student?.studentId
  const [tests, setTests] = useState<StudentExam[]>([])
  const [active, setActive] = useState<ExamState | null>(null)
  const [answers, setAnswers] = useState<ExamAnswers>({})
  const [seconds, setSeconds] = useState(120)
  const [needsPin, setNeedsPin] = useState(false)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [pendingSaves, setPendingSaves] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const activeRef = useRef<ExamState | null>(null)
  const answersRef = useRef<ExamAnswers>({})
  const revision = useRef(0)
  const deadline = useRef(0)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const submittingRef = useRef(false)
  const retryAt = useRef(0)
  const submitHandler = useRef<(automatic: boolean) => void>(() => {})
  const retrySaveHandler = useRef<() => void>(() => {})
  const pendingCount = useRef(0)
  const saveFailed = useRef(false)
  const retryWrite = useRef<{ answers: ExamAnswers; revision: number } | null>(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const request = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const started = performance.now()
    const res = await fetch('/api/student-tests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, studentId, ...extra }),
    })
    const data = await res.json()
    if (res.status === 401) setNeedsPin(true)
    if (!res.ok) throw Object.assign(new Error(data.error || '요청에 실패했습니다.'), { status: res.status })
    return { data, elapsed: performance.now() - started }
  }, [studentId])

  const load = useCallback(async () => {
    if (!studentId) return
    try {
      const res = await fetch(`/api/student-tests?studentId=${studentId}`, { cache: 'no-store' })
      const data = await res.json()
      if (res.status === 401) { setNeedsPin(true); return }
      if (!res.ok) throw new Error(data.error || '시험 목록을 불러오지 못했습니다.')
      setTests(data.tests); setError(''); setNeedsPin(false)
    } catch (e) { setError(e instanceof Error ? e.message : '연결을 확인해 주세요.') }
    finally { setBusy(false) }
  }, [studentId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial remote data load; state updates follow the awaited response.
  useEffect(() => { void load() }, [load])

  function applyState(data: ExamState, elapsed: number, restoreAnswers = false) {
    if (!mounted.current) return
    activeRef.current = data
    revision.current = data.attempt.revision
    deadline.current = performance.now() + Math.max(0, Date.parse(data.attempt.deadline_at) - Date.parse(data.server_now) - elapsed)
    setActive(data)
    setSeconds(remainingSeconds(deadline.current, performance.now()))
    if (restoreAnswers || data.attempt.submitted_at) {
      answersRef.current = data.attempt.answers; setAnswers(data.attempt.answers)
      retryWrite.current = null; saveFailed.current = false; retryAt.current = 0
    }
  }
  async function verify() {
    setBusy(true); setError('')
    try {
      await request('verify', { pin })
      setPin(''); setNeedsPin(false)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'PIN 확인 실패') }
    finally { setBusy(false) }
  }
  async function open(test: StudentExam) {
    if (!test.attempt && !window.confirm('답안 입력을 시작하면 2분 후 자동 제출됩니다. 시험당 한 번만 응시할 수 있습니다. 시작할까요?')) return
    setBusy(true); setError('')
    try {
      const { data, elapsed } = await request(test.attempt ? 'status' : 'start', { testId: test.id })
      applyState(data, elapsed, true)
    } catch (e) { setError(e instanceof Error ? e.message : '시험을 열지 못했습니다.') }
    finally { setBusy(false) }
  }

  // 답안 저장과 제출을 직렬화해 느린 요청이 최신 답안을 덮어쓰지 못하게 한다.
  function enqueue(action: 'save' | 'submit', snapshot: ExamAnswers) {
    const exam = activeRef.current
    if (!exam || exam.attempt.submitted_at) return Promise.resolve()
    pendingCount.current++
    setPendingSaves(n => n + 1)
    const task = queue.current.then(async () => {
      if (activeRef.current?.attempt.id !== exam.attempt.id || activeRef.current.attempt.submitted_at) return
      // 응답을 받지 못한 저장은 동일한 revision/답안으로 먼저 재전송한다.
      // 서버가 이미 저장했더라도 같은 요청은 중복 반영되지 않는다.
      if (retryWrite.current) {
        const { data, elapsed } = await request('save', { testId: exam.attempt.test_id, ...retryWrite.current })
        retryWrite.current = null
        applyState(data, elapsed)
        if (data.attempt.submitted_at) return
      }
      // 오래된 저장 요청은 최신 입력으로 합친다.
      const latest = action === 'save' ? answersRef.current : snapshot
      const write = { answers: latest, revision: revision.current + 1 }
      try {
        const { data, elapsed } = await request(action, { testId: exam.attempt.test_id, ...write })
        applyState(data, elapsed)
      } catch (e) {
        // 서버에서 거절한 요청은 재시도하지 않는다. 네트워크/서버 장애만 복구한다.
        const status = (e as { status?: number }).status
        if (!status || status >= 500) retryWrite.current = write
        throw e
      }
      saveFailed.current = false
      setError('')
    })
    queue.current = task.catch(e => {
      const status = (e as { status?: number }).status
      if (status && status < 500) retryWrite.current = null
      saveFailed.current = !!retryWrite.current
      retryAt.current = performance.now() + 3000
      if (mounted.current) setError(e instanceof Error ? e.message : '답안 저장에 실패했습니다. 연결을 확인하세요.')
    }).finally(() => { pendingCount.current--; if (mounted.current) setPendingSaves(n => n - 1) })
    return task
  }
  function changeAnswer(number: number, value: string | number[]) {
    if (submittingRef.current || !activeRef.current || activeRef.current.attempt.submitted_at || performance.now() >= deadline.current) return
    const next = { ...answersRef.current, [number]: value }
    answersRef.current = next; setAnswers(next)
    void enqueue('save', next).catch(() => {})
  }
  async function submit(automatic: boolean) {
    if (submittingRef.current || !activeRef.current || activeRef.current.attempt.submitted_at) return
    if (!automatic && !window.confirm('답안을 제출할까요? 제출 후에는 수정할 수 없습니다.')) return
    submittingRef.current = true; setSubmitting(true)
    try { await enqueue('submit', answersRef.current) }
    catch { retryAt.current = performance.now() + 3000 }
    finally { submittingRef.current = false; if (mounted.current) setSubmitting(false) }
  }
  useEffect(() => { submitHandler.current = automatic => { void submit(automatic) } })
  useEffect(() => {
    retrySaveHandler.current = () => {
      if (saveFailed.current && pendingCount.current === 0 && performance.now() >= retryAt.current) void enqueue('save', answersRef.current).catch(() => {})
    }
  })
  useEffect(() => {
    if (!active || active.attempt.submitted_at) return
    const tick = () => {
      const left = remainingSeconds(deadline.current, performance.now())
      setSeconds(left)
      if (left === 0 && performance.now() >= retryAt.current) submitHandler.current(true)
      else if (left > 0) retrySaveHandler.current()
    }
    const timer = setInterval(tick, 200)
    const resume = () => {
      tick()
      if (document.visibilityState === 'visible' && remainingSeconds(deadline.current, performance.now()) > 0 && !submittingRef.current) {
        void enqueue('save', answersRef.current).catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('online', resume)
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      clearInterval(timer); document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('online', resume); window.removeEventListener('beforeunload', beforeUnload)
    }
  }, [active?.attempt.id, active?.attempt.submitted_at]) // eslint-disable-line react-hooks/exhaustive-deps

  const finished = !!active?.attempt.submitted_at
  const answeredCount = active ? active.questions.filter(q => {
    const v = answers[q.number]
    return Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim().length > 0
  }).length : 0

  return <div className="student-exams">
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800&display=swap');
      .student-exams{max-width:640px;margin:0 auto;padding:20px 16px 110px;color:#0D1B36}
      .student-exams h1{font-size:19px;font-weight:800;margin:0 0 14px}
      .student-exams p{font-size:13px;line-height:1.6}
      .student-exams button{border:1.5px solid #DDE3EE;border-radius:10px;padding:10px 16px;font:inherit;font-size:13px;font-weight:600;background:#fff;color:#0D2A5E;cursor:pointer;transition:all .15s}
      .student-exams button:disabled{opacity:.5;cursor:default}
      .student-exams .exam-primary,.student-exams button[aria-pressed=true]{background:#0D2A5E;color:#fff;border-color:#0D2A5E}
      .student-exams input{border:1.5px solid #DDE3EE;border-radius:10px;padding:13px;font:inherit;font-size:16px;width:100%;box-sizing:border-box}
      .student-exams input:focus{outline:none;border-color:#0D2A5E}
      .student-exams .exam-card{background:#fff;border:1px solid #DDE3EE;border-radius:14px;padding:18px;margin:12px 0;box-shadow:0 1px 3px rgba(13,27,54,.05)}
      .student-exams .exam-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
      .student-exams .exam-list-card{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff;border:1px solid #DDE3EE;border-radius:14px;padding:16px 18px;margin:12px 0;box-shadow:0 1px 3px rgba(13,27,54,.05)}
      .student-exams .exam-badge{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:20px;margin-top:6px}
      .student-exams .exam-clock{position:sticky;top:8px;z-index:10;background:linear-gradient(135deg,#0D2A5E,#153a7d);color:#fff;padding:14px 16px;border-radius:14px;display:flex;justify-content:space-between;align-items:center;gap:10px;box-shadow:0 6px 18px rgba(13,42,94,.25)}
      .student-exams .exam-clock strong{font-variant-numeric:tabular-nums;font-size:26px;letter-spacing:.5px}
      .student-exams .exam-clock span{font-size:11.5px;opacity:.75}
      .student-exams .exam-clock .exam-primary{background:#D87E13;border-color:#D87E13;color:#3A2205;font-weight:700}
      .student-exams .exam-progress{height:6px;background:#DDE3EE;border-radius:99px;overflow:hidden;margin:12px 0 4px}
      .student-exams .exam-progress-fill{height:100%;background:#D87E13;border-radius:99px;transition:width .2s}
      .student-exams .exam-status-line{font-size:12.5px;color:#4B5C7E;display:flex;align-items:center;gap:6px;margin:6px 0 14px}
      .student-exams .exam-answers{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap}
      .student-exams .exam-choice{width:50px;height:50px;border-radius:50%;font-size:19px;font-weight:700;padding:0;flex-shrink:0;display:flex;align-items:center;justify-content:center}
      .student-exams .exam-choice[aria-pressed=true]{box-shadow:0 0 0 3px rgba(13,42,94,.18)}
      .student-exams .exam-error{background:#FDECEA;color:#C0392B;padding:12px 14px;border-radius:10px;font-size:13px}
      .student-exams .exam-result{text-align:center;padding:30px 20px}
      .student-exams .exam-result-score{font-size:52px;font-weight:800;color:#0D2A5E;margin:4px 0}
      .student-exams .exam-result-badge{display:inline-block;background:#E0F5EB;color:#1A7F4E;font-size:13px;font-weight:700;padding:5px 14px;border-radius:20px;margin-bottom:10px}
    `}</style>
    <h1>{active ? active.name : '시험 답안 입력'}</h1>
    {error && <p className="exam-error" role="alert">{error}</p>}
    {needsPin ? <section className="exam-card">
      <p style={{ marginTop: 0 }}>시험 답안을 안전하게 제출하기 위해 학생 계정의 PIN을 한 번 확인해 주세요.</p>
      <label style={{ fontSize: 12.5, fontWeight: 700, color: '#4B5C7E' }}>학생 PIN
        <input type="password" inputMode="numeric" maxLength={4} autoComplete="off" style={{ marginTop: 6, letterSpacing: 6, textAlign: 'center', fontSize: 20 }} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} />
      </label>
      <button className="exam-primary" disabled={busy || pin.length !== 4} onClick={verify} style={{ marginTop: 14, width: '100%' }}>PIN 확인</button>
    </section> : !active ? <>
      <div className="exam-row"><p style={{ margin: 0 }}>공개된 시험의 답안을 입력하세요. 시작 후 2분이 지나면 자동 제출됩니다.</p><button disabled={busy} onClick={load}>새로고침</button></div>
      {busy && <p>불러오는 중...</p>}
      {!busy && !tests.length && !error && <section className="exam-card" style={{ textAlign: 'center', color: '#96A4BF' }}>공개된 시험이 없습니다.</section>}
      {tests.map(test => {
        const done = test.attempt?.submitted_at
        const started = !!test.attempt && !done
        return <div className="exam-list-card" key={test.id}>
          <div>
            <strong style={{ fontSize: 14.5 }}>{test.name}</strong>
            <p style={{ margin: '3px 0 0', color: '#4B5C7E', fontSize: 12.5 }}>{test.date} · {test.total}문항</p>
            <span className="exam-badge" style={done ? { background: '#E0F5EB', color: '#1A7F4E' } : started ? { background: '#FFF3E0', color: '#B36A00' } : { background: '#F5F7FA', color: '#96A4BF' }}>
              {done ? `제출 완료 · ${test.attempt!.score}점` : started ? '응시 시작됨' : '미응시'}
            </span>
          </div>
          <button className="exam-primary" disabled={busy} onClick={() => open(test)}>{done ? '결과 보기' : started ? '이어서 입력' : '답안 입력'}</button>
        </div>
      })}
    </> : finished ? <section className="exam-card exam-result">
      <span className="exam-result-badge">제출 완료</span>
      <p className="exam-result-score">{active.attempt.score}점</p>
      <p style={{ color: '#4B5C7E' }}>정답 {active.attempt.cor}/{active.questions.length}개 · 획득 배점 {active.attempt.earned_points}/{active.attempt.total_points}점</p>
      <p style={{ color: '#96A4BF', fontSize: 12 }}>점수는 100점 만점으로 환산되어 저장되었습니다.</p>
      <button className="exam-primary" style={{ marginTop: 10 }} onClick={() => { setActive(null); activeRef.current = null; void load() }}>시험 목록으로</button>
    </section> : <>
      <div className="exam-clock">
        <div><span>남은 시간</span><br /><strong style={{ color: seconds <= 20 ? '#F5B7B1' : '#fff' }}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</strong></div>
        <button className="exam-primary" disabled={submitting || seconds === 0} onClick={() => submit(false)}>{submitting ? '제출 중...' : '제출'}</button>
      </div>
      <div className="exam-progress"><div className="exam-progress-fill" style={{ width: `${active.questions.length ? Math.round(answeredCount / active.questions.length * 100) : 0}%` }} /></div>
      <p className="exam-status-line" role="status">
        <span>{answeredCount}/{active.questions.length}문항 입력됨</span>
        <span aria-hidden style={{ color: '#DDE3EE' }}>·</span>
        <span>{seconds === 0 ? '입력이 마감되었습니다. 저장된 답안을 제출하고 있습니다.' : error ? '저장 상태를 확인해 주세요.' : pendingSaves > 0 ? '저장 중...' : '저장됨'}</span>
      </p>
      {active.questions.map(q => <section className="exam-card" key={q.number}>
        <div className="exam-row">
          <strong style={{ fontSize: 14.5 }}>{q.number}번</strong>
          <span style={{ fontSize: 11.5, color: '#4B5C7E', fontWeight: 600 }}>{q.points}점 · {q.kind === 'text' ? '주관식' : q.multiple ? '객관식 · 복수 선택' : '객관식'}</span>
        </div>
        {q.kind === 'choice' ? <div className="exam-answers">{[1, 2, 3, 4, 5].map(choice => {
          const value = Array.isArray(answers[q.number]) ? answers[q.number] as number[] : []
          return <button className="exam-choice" key={choice} disabled={seconds === 0 || submitting} aria-label={`${q.number}번 답안 ${choice}`} aria-pressed={value.includes(choice)} onClick={() => changeAnswer(q.number, toggleChoice(value, choice, q.multiple))}>{choice}</button>
        })}</div> : <input style={{ marginTop: 12 }} aria-label={`${q.number}번 주관식 답안`} maxLength={500} autoComplete="off" disabled={seconds === 0 || submitting} value={typeof answers[q.number] === 'string' ? answers[q.number] as string : ''} onChange={e => changeAnswer(q.number, e.target.value)} placeholder="답안을 입력하세요" />}
      </section>)}
      <button disabled={submitting || seconds === 0} className="exam-primary" style={{ width: '100%', padding: 14, fontSize: 14.5 }} onClick={() => submit(false)}>답안 제출</button>
    </>}
  </div>
}
