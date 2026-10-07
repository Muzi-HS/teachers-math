'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ExamAttempt, isAnswerCorrect, toggleChoice } from '@/lib/auto-grading'

type Question = { number: number; points: number; kind: 'choice' | 'text'; correct_answer: number[] | string; award_all: boolean }
type History = { id: number; reason: string; created_at: string; reverted_at: string | null }
type Snapshot = { version: string; questions: Question[]; attempts: ExamAttempt[]; history: History[] }

export default function TestGradingCorrectionModal({ test, students, onClose, onSaved }: {
  test: { id: number; name: string }; students: { id: number; name: string }[]; onClose: () => void; onSaved: () => void
}) {
  const [data, setData] = useState<Snapshot | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    supabase.rpc('get_test_correction_data', { p_test_id: test.id }).then(({ data: result, error: loadError }) => {
      if (!active) return
      if (loadError) { setError(loadError.code === 'PGRST202' ? 'test_grading_correction_migration.sql을 먼저 실행해주세요.' : loadError.message); return }
      const snapshot = result as Snapshot
      setData(snapshot); setQuestions(snapshot.questions); setPreview(false); setReason(''); setError('')
    })
    return () => { active = false }
  }, [test.id, reload])
  function update(number: number, change: Partial<Question>) {
    setQuestions(rows => rows.map(q => q.number === number ? { ...q, ...change } : q)); setPreview(false)
  }
  function validate() {
    for (const q of questions) {
      if (!Number.isFinite(q.points) || q.points < 1 || q.points > 1000 || Math.abs(q.points * 100 - Math.round(q.points * 100)) > 0.000001) return `${q.number}번 배점을 확인하세요. (1~1000, 소수 둘째 자리)`
      if (q.kind === 'choice' ? !Array.isArray(q.correct_answer) || !q.correct_answer.length : typeof q.correct_answer !== 'string' || !q.correct_answer.trim()) return `${q.number}번 정답을 입력하세요.`
    }
    if (!reason.trim()) return '정정 사유를 입력하세요.'
    if (JSON.stringify(questions) === JSON.stringify(data?.questions)) return '변경된 채점 기준이 없습니다.'
    return ''
  }
  const results = data?.attempts.map(attempt => {
    let earned = 0, correct = 0
    const total = questions.reduce((sum, q) => sum + Math.round(q.points * 100), 0)
    for (const q of questions) if (isAnswerCorrect({ ...q, correctAnswer: typeof q.correct_answer === 'string' ? q.correct_answer.trim() : q.correct_answer, awardAll: q.award_all }, attempt.answers[String(q.number)])) { earned += Math.round(q.points * 100); correct++ }
    return { attempt, correct, score: total > 0 ? Math.round(earned / total * 100) : 0 }
  }) ?? []
  async function apply() {
    if (!data || busy || !preview) return
    const invalid = validate(); if (invalid) return setError(invalid)
    setBusy(true)
    const { error: saveError } = await supabase.rpc('apply_test_correction', { p_test_id: test.id, p_questions: questions, p_reason: reason.trim(), p_version: data.version })
    setBusy(false)
    if (saveError) { setError(saveError.message); return }
    onSaved(); onClose()
  }
  async function undo(id: number) {
    if (busy || !window.confirm('이 정정을 되돌리고 전체 성적을 다시 계산할까요?')) return
    setBusy(true)
    const { error: undoError } = await supabase.rpc('undo_test_correction', { p_id: id })
    setBusy(false)
    if (undoError) { setError(undoError.message); return }
    onSaved(); setReload(value => value + 1)
  }
  const latest = data?.history.find(h => !h.reverted_at)?.id
  return <div className="grading-overlay" onClick={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="grading-modal" role="dialog" aria-modal="true" aria-labelledby="grading-title">
      <style>{`
        .grading-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1200;display:flex;align-items:center;justify-content:center;padding:16px}.grading-modal{width:860px;max-width:100%;max-height:90dvh;overflow:auto;background:var(--ui-surface);color:var(--ui-text);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.18)}.grading-modal header,.grading-modal footer{padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--ui-surface);position:sticky;z-index:1}.grading-modal header{top:0;border-bottom:1px solid var(--ui-border)}.grading-modal footer{bottom:0;border-top:1px solid var(--ui-border);justify-content:flex-end}.grading-body{padding:20px}.grading-modal h2{font-size:17px;font-weight:700;margin:0}.grading-modal p{font-size:12px;color:var(--ui-text-2);line-height:1.7}.grading-scroll{overflow:auto;margin:14px 0}.grading-modal table{border-collapse:collapse;width:100%;font-size:12px}.grading-modal th,.grading-modal td{padding:10px;border-bottom:1px solid var(--ui-border);text-align:left;white-space:nowrap}.grading-modal th{background:var(--ui-surface-2);font-size:11px;color:var(--ui-text-3)}.grading-modal input[type=number]{width:80px}.grading-modal input[type=text],.grading-modal textarea{width:100%;min-width:140px}.grading-modal input:not([type=checkbox]),.grading-modal textarea{padding:8px;border:1px solid var(--ui-border);border-radius:6px;font:inherit;background:var(--ui-surface);color:var(--ui-text);box-sizing:border-box}.grading-modal button{padding:5px 10px;border:1px solid var(--ui-border);border-radius:6px;font-size:12px;font-family:inherit;cursor:pointer;background:var(--ui-surface);color:var(--ui-text-2)}.grading-modal button[aria-pressed=true],.grading-modal .grading-primary{background:var(--ui-primary);border-color:var(--ui-primary);color:#fff}.grading-modal button:disabled{opacity:.5;cursor:default}.grading-modal button:focus-visible{outline:2px solid var(--ui-primary);outline-offset:2px}.grading-choices{display:flex;gap:4px}.grading-history{list-style:none;padding:0;margin-top:12px}.grading-history li{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--ui-border);font-size:12px}.grading-history small{display:block;color:var(--ui-text-3);margin-top:4px}
      `}</style>
      <header><div><h2 id="grading-title">채점 정정</h2><p style={{ margin: '4px 0 0' }}>{test.name}</p></div><button disabled={busy} onClick={onClose} aria-label="닫기">닫기</button></header>
      <div className="grading-body">
        <p>정답·배점 또는 모두 정답 처리를 수정하면 전체 회차의 제출 성적과 수업기록을 다시 계산합니다. 학생이 입력한 답안과 제출 시간은 보존하며 이후 제출에도 적용됩니다.</p>
        {error && <p role="alert" style={{ color: 'var(--ui-danger)' }}>{error} <button disabled={busy} onClick={() => setReload(value => value + 1)}>다시 불러오기</button></p>}
        {!data ? <p>채점 기준을 불러오는 중…</p> : <>
          <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
            <div className="grading-scroll"><table><thead><tr><th>문항</th><th>배점</th><th>정답</th><th>모두 정답 처리</th></tr></thead><tbody>{questions.map(q => <tr key={q.number}>
              <td>{q.number}번</td><td><input aria-label={`${q.number}번 배점`} type="number" min={1} max={1000} step="0.01" value={Number.isNaN(q.points) ? '' : q.points} onChange={event => update(q.number, { points: event.target.value === '' ? NaN : Number(event.target.value) })} /></td>
              <td>{q.kind === 'choice' ? <div className="grading-choices">{[1,2,3,4,5].map(choice => <button type="button" key={choice} aria-label={`${q.number}번 정답 ${choice}`} aria-pressed={Array.isArray(q.correct_answer) && q.correct_answer.includes(choice)} onClick={() => update(q.number, { correct_answer: toggleChoice(Array.isArray(q.correct_answer) ? q.correct_answer : [], choice) })}>{choice}</button>)}</div> : <input type="text" maxLength={500} aria-label={`${q.number}번 정답`} value={String(q.correct_answer)} onChange={event => update(q.number, { correct_answer: event.target.value })} />}</td>
              <td><label><input type="checkbox" checked={q.award_all} onChange={event => update(q.number, { award_all: event.target.checked })} /> 모두 정답</label></td>
            </tr>)}</tbody></table></div>
            <label style={{ fontSize: 12 }}>정정 사유<textarea rows={2} maxLength={500} value={reason} onChange={event => { setReason(event.target.value); setPreview(false) }} placeholder="예: 3번·6번 출제 오류로 모두 정답 처리" /></label>
          </fieldset>
          {preview && <div className="grading-scroll"><h3 style={{ fontSize: 14 }}>변경 전·후 미리보기 · {results.length}명</h3><table><thead><tr><th>이름</th><th>점수</th><th>정답 수</th></tr></thead><tbody>{results.map(({ attempt, score, correct }) => <tr key={attempt.id}><td>{students.find(student => student.id === attempt.student_id)?.name ?? `학생 ${attempt.student_id}`}</td><td>{attempt.score ?? '—'} → <strong>{score}</strong></td><td>{attempt.cor ?? '—'} → {correct}</td></tr>)}</tbody></table><p>적용 시점까지 새로 제출된 학생도 함께 재채점됩니다.</p></div>}
          {!!data.history.length && <><h3 style={{ fontSize: 14, marginTop: 20 }}>정정 이력</h3><ul className="grading-history">{data.history.map(h => <li key={h.id}><div>{h.reason}<small>{new Date(h.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}{h.reverted_at ? ' · 되돌림 완료' : ''}</small></div>{h.id === latest && <button disabled={busy} onClick={() => void undo(h.id)}>되돌리기</button>}</li>)}</ul></>}
        </>}
      </div>
      <footer><button disabled={busy || !data} onClick={() => { const invalid = validate(); setError(invalid); setPreview(!invalid) }}>변경 미리보기</button><button className="grading-primary" disabled={busy || !preview} onClick={() => void apply()}>{busy ? '처리 중…' : '정정 적용'}</button></footer>
    </section>
  </div>
}
