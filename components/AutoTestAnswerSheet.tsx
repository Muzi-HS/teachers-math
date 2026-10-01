'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ExamAttempt, GradedQuestion, isAnswerCorrect } from '@/lib/auto-grading'

type QuestionRow = { number: number; points: number; kind: 'choice' | 'text'; correct_answer: number[] | string }
type Student = { id: number; name: string; school?: string }
type TestBatch = { id: number; round_number: number; name: string }
type Assignee = { student_id: number; batch_id: number | null }

const navy = 'var(--ui-primary)', gold = 'var(--ui-primary)', bd = 'var(--ui-border)', bg = 'var(--ui-bg)'
const tx = 'var(--ui-text)', tx2 = 'var(--ui-text-2)', tx3 = 'var(--ui-text-3)', gr = 'var(--ui-success)', gbg = 'var(--ui-success-bg)', re = 'var(--ui-danger)', rbg = 'var(--ui-danger-bg)'

function fmtAnswer(kind: 'choice' | 'text', value: string | number[] | undefined) {
  if (kind === 'choice') return Array.isArray(value) && value.length ? value.join(', ') : '(미입력)'
  return typeof value === 'string' && value.trim() ? value : '(미입력)'
}

export default function AutoTestAnswerSheet({ testId, students }: { testId: number; students: Student[] }) {
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [assignees, setAssignees] = useState<Assignee[]>([])
  const [batches, setBatches] = useState<TestBatch[]>([])
  const [batchId, setBatchId] = useState<number | null>(null)
  const [attempts, setAttempts] = useState<ExamAttempt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [editingBatchId, setEditingBatchId] = useState<number | null>(null)
  const [batchNameDraft, setBatchNameDraft] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load(showLoading: boolean) {
      if (showLoading) setLoading(true)
      const [q, s, a, b] = await Promise.all([
        supabase.from('test_questions').select('number,points,kind,correct_answer').eq('test_id', testId).order('number'),
        supabase.from('test_assignees').select('student_id,batch_id').eq('test_id', testId),
        supabase.from('test_attempts').select('*').eq('test_id', testId),
        supabase.from('test_batches').select('id,round_number,name').eq('test_id', testId).order('round_number'),
      ])
      if (cancelled) return
      if (q.error || s.error || a.error || b.error) { setError('회차별 정오표를 불러오지 못했습니다. test_batches_migration.sql 적용 여부를 확인해 주세요.'); setLoading(false); return }
      setError('')
      setQuestions(q.data ?? [])
      setAssignees(s.data ?? [])
      setBatches(b.data ?? [])
      setAttempts(a.data ?? [])
      setLoading(false)
    }
    void load(true)
    const timer = setInterval(() => { void load(false) }, 10000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [testId])

  const gradedQuestions: GradedQuestion[] = questions.map(q => ({ number: q.number, points: q.points, kind: q.kind, correctAnswer: q.correct_answer }))
  const batchByStudent = new Map(assignees.map(row => [row.student_id, row.batch_id]))
  function batchSummary(targetBatchId: number | null) {
    const rows = attempts.filter(a => a.submitted_at && (targetBatchId === null || batchByStudent.get(a.student_id) === targetBatchId))
    const correct = rows.reduce((sum, attempt) => sum + gradedQuestions.filter(q => isAnswerCorrect(q, attempt.answers[String(q.number)])).length, 0)
    const possible = rows.length * gradedQuestions.length
    return possible ? `${Math.round(correct / possible * 100)}%` : '제출 전'
  }
  const batchStudentIds = new Set(assignees.filter(row => batchId === null || row.batch_id === batchId).map(row => row.student_id))
  const submitted = attempts.filter(a => a.submitted_at && batchStudentIds.has(a.student_id))
  const cumulativeSubmitted = attempts.filter(a => a.submitted_at)
  const questionStats = gradedQuestions.map(q => {
    const correct = submitted.filter(a => isAnswerCorrect(q, a.answers[String(q.number)])).length
    return { ...q, total: submitted.length, correct, pct: submitted.length > 0 ? Math.round(correct / submitted.length * 100) : 0 }
  })

  const attemptByStudent = new Map(attempts.map(a => [a.student_id, a]))
  const roster = [...batchStudentIds]
    .map(id => students.find(s => s.id === id) ?? { id, name: `학생 ${id}` })
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const selectedStudent = selected != null ? roster.find(s => s.id === selected) : null
  const selectedAttempt = selected != null ? attemptByStudent.get(selected) : undefined
  const currentBatch = batches.find(batch => batch.id === batchId)

  async function renameBatch() {
    if (editingBatchId === null || !batchNameDraft.trim() || renaming) return
    setRenaming(true); setRenameError('')
    const { error: saveError } = await supabase.rpc('rename_auto_test_batch', {
      p_test_id: testId, p_batch_id: editingBatchId, p_name: batchNameDraft.trim(),
    })
    setRenaming(false)
    if (saveError) { setRenameError(saveError.message); return }
    setBatches(current => current.map(batch => batch.id === editingBatchId ? { ...batch, name: batchNameDraft.trim() } : batch))
    setEditingBatchId(null)
  }

  if (loading) return <section className="ans-card"><style>{css}</style><p style={{ color: tx3, fontSize: 13, margin: 0 }}>정오표를 불러오는 중...</p></section>
  if (error) return <section className="ans-card"><style>{css}</style><p role="alert" style={{ color: re, fontSize: 13, margin: 0 }}>{error}</p></section>

  return <section className="ans-card">
    <style>{css}</style>

    <div className="ans-head">
      <h3>회차별 결과</h3>
    </div>
    <div className="ans-summary" aria-label="전체 누적 결과">
      <div><span>전체 문항 정답률</span><strong>{batchSummary(null)}</strong></div>
      <div><span>누적 제출</span><strong>{cumulativeSubmitted.length}명</strong></div>
    </div>
    <div className="ans-rounds" role="group" aria-label="결과 회차 선택">
      <button type="button" className="ans-chip" data-active={batchId === null} aria-pressed={batchId === null} onClick={() => { setBatchId(null); setSelected(null); setEditingBatchId(null) }}>전체 누적</button>
      {batches.map(batch => <button type="button" key={batch.id} className="ans-chip" data-active={batchId === batch.id} aria-pressed={batchId === batch.id} onClick={() => { setBatchId(batch.id); setSelected(null); setEditingBatchId(null) }}>
        {batch.round_number}회차 · {batch.name}
      </button>)}
    </div>
    <div className="ans-selection">
      <span>{currentBatch ? `${currentBatch.round_number}회차 · ${currentBatch.name}` : '전체 누적'} <b>{batchSummary(batchId)}</b></span>
      {currentBatch && <button type="button" className="ans-rename-button" onClick={() => { setEditingBatchId(currentBatch.id); setBatchNameDraft(currentBatch.name); setRenameError('') }}>이름 수정</button>}
    </div>
    {editingBatchId !== null && <form className="ans-rename" onSubmit={event => { event.preventDefault(); void renameBatch() }}>
      <label htmlFor="ans-batch-name">회차 이름</label>
      <input id="ans-batch-name" value={batchNameDraft} maxLength={100} onChange={event => setBatchNameDraft(event.target.value)} autoFocus />
      <button type="submit" disabled={renaming || !batchNameDraft.trim()}>{renaming ? '저장 중...' : '저장'}</button>
      <button type="button" onClick={() => setEditingBatchId(null)}>취소</button>
      {renameError && <p role="alert">{renameError}</p>}
    </form>}

    <div className="ans-head ans-results-head">
      <h3>문항별 정답률</h3>
      <span className="ans-badge">{batchId === null ? '누적' : '선택 회차'} 제출 {submitted.length}명 기준</span>
    </div>
    {submitted.length === 0 ? (
      <p className="ans-empty">아직 채점된 제출이 없습니다.</p>
    ) : (
      <div className="ans-qstats">
        {questionStats.map(q => (
          <div className="ans-qrow" key={q.number}>
            <span className="ans-qnum">{q.number}번</span>
            <span className="ans-qkind">{q.kind === 'text' ? '주관식' : '객관식'} · {q.points}점</span>
            <div className="ans-bar"><div className="ans-bar-fill" style={{ width: `${q.pct}%`, background: q.pct >= 70 ? gr : q.pct >= 40 ? gold : re }} /></div>
            <span className="ans-qpct" style={{ color: q.pct >= 70 ? gr : q.pct >= 40 ? 'var(--ui-warning)' : re }}>{q.correct}/{q.total} · {q.pct}%</span>
          </div>
        ))}
      </div>
    )}

    <div className="ans-head" style={{ marginTop: 22 }}>
      <h3>학생 정오표</h3>
      <span className="ans-badge">{roster.length}명 대상</span>
    </div>
    {roster.length === 0 ? (
      <p className="ans-empty">응시 대상 학생이 없습니다.</p>
    ) : (
      <>
        <div className="ans-roster">
          {roster.map(s => {
            const a = attemptByStudent.get(s.id)
            const status = a?.submitted_at ? 'done' : a ? 'progress' : 'none'
            return <button key={s.id} type="button" className="ans-chip" data-status={status} data-active={selected === s.id} onClick={() => setSelected(s.id)}>
              {s.name}{a?.submitted_at ? ` · ${a.score}점` : status === 'progress' ? ' · 응시중' : ''}
            </button>
          })}
        </div>

        {selectedStudent && (
          <div className="ans-sheet">
            {!selectedAttempt ? (
              <p className="ans-empty">{selectedStudent.name}님은 아직 응시하지 않았습니다.</p>
            ) : !selectedAttempt.submitted_at ? (
              <p className="ans-empty">{selectedStudent.name}님은 아직 제출하지 않았습니다 (응시 중).</p>
            ) : (
              <>
                <div className="ans-sheet-head">
                  <strong>{selectedStudent.name}</strong>
                  <span>정답 {selectedAttempt.cor}/{gradedQuestions.length}개 · 획득 배점 {selectedAttempt.earned_points}/{selectedAttempt.total_points}점 · <b style={{ color: navy }}>{selectedAttempt.score}점</b></span>
                </div>
                <div className="ans-table">
                  <div className="ans-table-row ans-table-head">
                    <span>번호</span><span>내 답안</span><span>정답</span><span>결과</span><span>배점</span>
                  </div>
                  {gradedQuestions.map(q => {
                    const ok = isAnswerCorrect(q, selectedAttempt.answers[String(q.number)])
                    return <div className="ans-table-row" key={q.number} data-ok={ok}>
                      <span>{q.number}번</span>
                      <span>{fmtAnswer(q.kind, selectedAttempt.answers[String(q.number)])}</span>
                      <span>{fmtAnswer(q.kind, q.correctAnswer)}</span>
                      <span className="ans-result" data-ok={ok}>{ok ? '정답' : '오답'}</span>
                      <span>{q.points}점</span>
                    </div>
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </>
    )}
  </section>
}

const css = `
  .ans-card{background:#fff;border:1px solid ${bd};border-radius:14px;padding:18px 20px;margin-bottom:18px;box-shadow:0 1px 4px rgba(0,0,0,.06)}
  .ans-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
  .ans-head h3{font-size:14px;font-weight:700;margin:0;color:${tx}}
  .ans-summary{display:flex;gap:10px;margin-top:14px}
  .ans-summary>div{flex:1;min-width:0;padding:12px 15px;background:var(--ui-accent-bg);border:1px solid ${bd};border-radius:11px}
  .ans-summary span{display:block;font-size:11px;color:${tx2};margin-bottom:3px}
  .ans-summary strong{font-size:20px;color:${navy}}
  .ans-rounds{display:flex;flex-wrap:wrap;gap:8px;margin-top:17px}
  .ans-selection{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:13px;font-size:12px;color:${tx2}}
  .ans-selection b{color:${navy};margin-left:5px}
  .ans-rename-button{border:0;background:transparent;color:${navy};font:inherit;font-weight:700;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
  .ans-rename{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:12px;padding:12px;background:${bg};border-radius:9px;font-size:12px}
  .ans-rename input{flex:1;min-width:140px;padding:8px;border:1px solid ${bd};border-radius:7px;font:inherit;font-size:16px}
  .ans-rename button{padding:8px 10px;border:1px solid ${bd};border-radius:7px;background:#fff;color:${navy};font:inherit;cursor:pointer}
  .ans-rename button:disabled{opacity:.5;cursor:default}
  .ans-rename p{width:100%;margin:0;color:${re}}
  .ans-results-head{margin-top:28px;padding-top:22px;border-top:1px solid ${bd}}
  .ans-badge{font-size:12px;font-weight:700;color:${navy};background:var(--ui-accent-bg);padding:3px 10px;border-radius:20px}
  .ans-empty{font-size:13px;color:${tx3};margin:10px 0 0}
  .ans-qstats{display:flex;flex-direction:column;gap:8px;margin-top:12px}
  .ans-qrow{display:grid;grid-template-columns:52px 108px 1fr 108px;align-items:center;gap:10px}
  .ans-qnum{font-size:13px;font-weight:700;color:${tx}}
  .ans-qkind{font-size:11.5px;color:${tx3}}
  .ans-bar{height:8px;background:${bg};border-radius:99px;overflow:hidden}
  .ans-bar-fill{height:100%;border-radius:99px;transition:width .2s}
  .ans-qpct{font-size:12px;font-weight:700;text-align:right}
  .ans-roster{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}
  .ans-chip{padding:7px 13px;border-radius:20px;border:1.5px solid ${bd};background:#fff;font-size:12.5px;font-weight:600;color:${tx2};cursor:pointer;font-family:inherit;transition:all .15s}
  .ans-chip:hover{border-color:${navy}}
  .ans-chip[data-status=done]{background:${gbg};border-color:#BFE6D2;color:${gr}}
  .ans-chip[data-status=progress]{background:var(--ui-warning-bg);border-color:#F3D9A8;color:var(--ui-warning)}
  .ans-chip[data-active=true]{outline:2px solid ${navy};outline-offset:1px}
  .ans-sheet{margin-top:16px;border-top:1px solid ${bd};padding-top:16px}
  .ans-sheet-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;font-size:13px;color:${tx2}}
  .ans-sheet-head strong{font-size:14.5px;color:${tx}}
  .ans-table{border:1px solid ${bd};border-radius:10px;overflow:hidden}
  .ans-table-row{display:grid;grid-template-columns:56px 1fr 1fr 68px 64px;gap:8px;align-items:center;padding:9px 12px;font-size:13px;border-bottom:1px solid ${bg}}
  .ans-table-row:last-child{border-bottom:none}
  .ans-table-head{background:${bg};font-size:11px;font-weight:700;color:${tx3};padding:8px 12px}
  .ans-table-row[data-ok=false]:not(.ans-table-head){background:${rbg}}
  .ans-table-row[data-ok=true]:not(.ans-table-head){background:${gbg}}
  .ans-result{font-weight:700;font-size:12px}
  .ans-result[data-ok=true]{color:${gr}}
  .ans-result[data-ok=false]{color:${re}}
  @media(max-width:640px){.ans-qrow{grid-template-columns:44px 1fr;grid-template-rows:auto auto}.ans-bar{grid-column:1/-1}.ans-qpct{text-align:left}.ans-table-row{grid-template-columns:40px 1fr 1fr 52px 48px;font-size:12px}}
`
