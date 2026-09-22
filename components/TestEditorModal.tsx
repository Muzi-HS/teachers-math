'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { kstDateStr } from '@/lib/kst'
import { ExamQuestionDraft, toggleChoice } from '@/lib/auto-grading'

export type EditableTest = { id: number; name: string; date: string; total: number; auto_grading?: boolean; is_published?: boolean }
type Student = { id: number; name: string; school: string }
type ClassRow = { id: number; name: string }
const blank = (): ExamQuestionDraft => ({ points: 5, choices: [], text: '' })

export default function TestEditorModal({ test, students, onClose, onSaved }: {
  test: EditableTest | null; students: Student[]; onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState(test?.name ?? '')
  const [date, setDate] = useState(test?.date ?? kstDateStr())
  const [total, setTotal] = useState(test?.total ?? 20)
  const [auto, setAuto] = useState(test?.auto_grading ?? false)
  const [published, setPublished] = useState(test?.is_published ?? false)
  const [questions, setQuestions] = useState<ExamQuestionDraft[]>(Array.from({ length: test?.total ?? 20 }, blank))
  const [selected, setSelected] = useState<number[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [members, setMembers] = useState<{ class_id: number; student_id: number }[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [locked, setLocked] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState(false)
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [c, m] = await Promise.all([
          supabase.from('classes').select('id,name').order('name'),
          supabase.from('class_students').select('class_id,student_id'),
        ])
        if (c.error || m.error) throw new Error('응시 대상 목록을 불러오지 못했습니다.')
        if (cancelled) return
        setClasses(c.data ?? []); setMembers(m.data ?? [])
        if (test?.auto_grading) {
          const [q, s, a] = await Promise.all([
            supabase.from('test_questions').select('*').eq('test_id', test.id).order('number'),
            supabase.from('test_assignees').select('student_id').eq('test_id', test.id),
            supabase.from('test_attempts').select('id', { count: 'exact', head: true }).eq('test_id', test.id),
          ])
          if (q.error || s.error || a.error) throw new Error('시험 설정을 불러오지 못했습니다. 다시 열어 주세요.')
          if (cancelled) return
          setQuestions((q.data ?? []).map(row => ({ points: row.points, choices: row.kind === 'choice' ? row.correct_answer : [], text: row.kind === 'text' ? row.correct_answer : '' })))
          setSelected((s.data ?? []).map(row => row.student_id)); setLocked((a.count ?? 0) > 0)
        }
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : '불러오기 실패'); setLoadError(true) }
      } finally { if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [test])

  function changeTotal(value: number) {
    const count = Math.max(1, Math.min(200, value || 1))
    setTotal(count)
    setQuestions(q => Array.from({ length: count }, (_, i) => q[i] ?? blank()))
  }
  function updateQuestion(index: number, update: Partial<ExamQuestionDraft>) {
    setQuestions(rows => rows.map((q, i) => i === index ? { ...q, ...update } : q))
  }
  async function save() {
    if (saving || loading || locked || loadError) return
    setError('')
    if (!name.trim() || !date || !Number.isInteger(total) || total < 1) return setError('시험명, 날짜, 문항 수를 입력하세요.')
    if (auto && questions.some(q => !Number.isInteger(q.points) || q.points < 1 || q.points > 1000 || (!q.choices.length && !q.text.trim()))) return setError('모든 문항에 배점(1~1000)과 정답을 입력하세요.')
    if (auto && published && !selected.length) return setError('시험을 공개하려면 응시 학생을 추가하세요.')
    setSaving(true)
    try {
      if (auto || test?.auto_grading) {
        const { error } = await supabase.rpc('save_auto_test', {
          p_id: test?.id ?? null, p_name: name.trim(), p_date: date, p_total: total, p_auto: auto,
          p_published: published, p_questions: questions, p_students: selected,
        })
        if (error) throw new Error(error.code === 'PGRST202' ? '자동채점 DB 설정이 필요합니다. 마이그레이션을 적용해 주세요.' : error.message)
      } else {
        const row = { name: name.trim(), date, total }
        const result = test ? await supabase.from('tests').update(row).eq('id', test.id) : await supabase.from('tests').insert(row)
        if (result.error) throw result.error
      }
      onSaved()
    } catch (e) { setError(e instanceof Error ? e.message : String((e as { message?: string }).message ?? '저장 실패')) }
    finally { setSaving(false) }
  }

  return <div className="exam-editor-overlay">
    <style>{`
      .exam-editor-overlay{position:fixed;inset:0;background:#0006;z-index:1100;display:flex;align-items:center;justify-content:center;padding:16px}
      .exam-editor{width:760px;max-width:100%;max-height:92dvh;overflow:auto;background:#fff;border-radius:12px;color:#0D1B36;font-family:inherit}
      .exam-editor header,.exam-editor footer{padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:10px;background:#fff;position:sticky;z-index:1}
      .exam-editor header{top:0;border-bottom:1px solid #DDE3EE}.exam-editor footer{bottom:0;border-top:1px solid #DDE3EE}
      .exam-editor fieldset{margin:0;border:0;padding:20px;min-width:0}.exam-editor input:not([type=checkbox]){width:100%;padding:9px;border:1px solid #DDE3EE;border-radius:7px;font:inherit;font-size:14px;box-sizing:border-box}
      .exam-editor button{padding:8px 12px;border:1px solid #DDE3EE;border-radius:7px;background:#fff;font:inherit;font-size:13px;cursor:pointer}.exam-editor button:disabled{opacity:.5;cursor:default}
      .exam-editor button[aria-pressed=true],.exam-editor .exam-save{background:#0D2A5E;color:#fff;border-color:#0D2A5E}
      .exam-editor .exam-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.exam-editor label{font-size:13px}.exam-editor .exam-section{margin-top:22px}.exam-editor h3{font-size:15px;margin:0 0 10px}
      .exam-editor .exam-help{font-size:12px;color:#4B5C7E;line-height:1.7;margin:8px 0}.exam-editor .exam-question{padding:12px 0;border-top:1px solid #DDE3EE;display:grid;grid-template-columns:95px 1fr;gap:12px}
      .exam-editor .exam-choices{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:7px}.exam-editor .exam-choices button{min-width:38px;font-size:17px}
      .exam-editor .exam-roster{max-height:190px;overflow:auto;display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px 0}.exam-editor .exam-check{display:flex;gap:7px;align-items:center}
      @media(max-width:500px){.exam-editor-overlay{padding:8px}.exam-editor fieldset{padding:14px}.exam-editor .exam-question{grid-template-columns:65px 1fr}.exam-editor .exam-roster{grid-template-columns:1fr}}
    `}</style>
    <section className="exam-editor" role="dialog" aria-modal="true" aria-label={test ? '테스트 편집' : '테스트 추가'}>
      <header><strong>{test ? '테스트 편집' : '테스트 추가'}</strong><button onClick={onClose} disabled={saving} aria-label="닫기">×</button></header>
      {error && <p role="alert" style={{ color: '#C0392B', padding: '0 20px' }}>{error}</p>}
      {loading && <p style={{ padding: 20 }}>시험 설정을 불러오는 중...</p>}
      {locked && <p className="exam-help" style={{ padding: '0 20px' }}>응시가 시작되어 문항·배점·대상은 변경할 수 없습니다. 공개 여부는 시험 상세에서 변경할 수 있습니다.</p>}
      <fieldset disabled={loading || saving || locked || loadError}>
        <label>시험명<input value={name} onChange={e => setName(e.target.value)} placeholder="시험명" /></label>
        <div className="exam-grid" style={{ marginTop: 12 }}>
          <label>날짜<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
          <label>총 문항 수<input type="number" min={1} max={200} value={total} onChange={e => changeTotal(Number(e.target.value))} /></label>
        </div>
        <label className="exam-check exam-section"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} />자동채점 사용 (선택)</label>
        {!auto && <p className="exam-help">기존처럼 수업기록에서 정답 수와 점수를 직접 입력합니다.</p>}
        {auto && <>
          <section className="exam-section">
            <h3>문항별 배점과 정답 · 배점 합계 {questions.reduce((sum, q) => sum + q.points, 0)}점</h3>
            <p className="exam-help">①~⑤를 선택하면 객관식, 아래 빈칸에 입력하면 주관식입니다. 복수 선택은 모두 일치해야 정답이며 부분 점수는 없습니다. 주관식은 앞뒤 공백을 제외하고 일치해야 합니다. 성적은 배점 합계를 기준으로 100점 만점 환산합니다.</p>
            {questions.map((q, i) => <div className="exam-question" key={i}>
              <label><strong>{i + 1}번</strong><input aria-label={`${i + 1}번 배점`} type="number" min={1} max={1000} value={q.points || ''} onChange={e => updateQuestion(i, { points: Number(e.target.value) })} />점</label>
              <div>
                <div className="exam-choices">{['①','②','③','④','⑤'].map((label, index) => <button type="button" key={label} aria-label={`${i + 1}번 정답 ${label}`} aria-pressed={q.choices.includes(index + 1)} onClick={() => updateQuestion(i, { choices: toggleChoice(q.choices, index + 1), text: '' })}>{label}</button>)}</div>
                <input aria-label={`${i + 1}번 주관식 정답`} maxLength={500} value={q.text} onChange={e => updateQuestion(i, { text: e.target.value, choices: [] })} placeholder="주관식 정답 입력" />
                <span className="exam-help">{q.choices.length ? `객관식${q.choices.length > 1 ? ' · 복수 정답' : ''}` : q.text.trim() ? '주관식' : '정답 미입력'}</span>
              </div>
            </div>)}
          </section>
          <section className="exam-section">
            <h3>응시 대상 · {selected.length}명</h3>
            <div className="exam-choices">{classes.map(c => {
              const ids = members.filter(m => m.class_id === c.id).map(m => m.student_id)
              const all = ids.length > 0 && ids.every(id => selected.includes(id))
              return <button key={c.id} type="button" aria-pressed={all} disabled={!ids.length} onClick={() => setSelected(s => all ? s.filter(id => !ids.includes(id)) : [...new Set([...s, ...ids])])}>{c.name} ({ids.filter(id => selected.includes(id)).length}/{ids.length})</button>
            })}</div>
            <input aria-label="학생 검색" placeholder="학생 이름 검색" value={search} onChange={e => setSearch(e.target.value)} />
            <div className="exam-roster">{students.filter(s => s.name.includes(search)).map(s => <label className="exam-check" key={s.id}><input type="checkbox" checked={selected.includes(s.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, s.id] : ids.filter(id => id !== s.id))} />{s.name} <span style={{ color: '#96A4BF' }}>{s.school}</span></label>)}</div>
            <p className="exam-help">반을 선택하면 현재 소속 학생이 추가됩니다. 학생은 ‘답안 입력’을 누른 시점부터 2분 동안 한 번 응시할 수 있습니다.</p>
          </section>
          <label className="exam-check exam-section"><input type="checkbox" checked={published} onChange={e => setPublished(e.target.checked)} />학생에게 시험 공개</label>
        </>}
      </fieldset>
      <footer><button onClick={onClose} disabled={saving}>닫기</button><button className="exam-save" onClick={save} disabled={saving || loading || locked || loadError}>{saving ? '저장 중...' : '저장'}</button></footer>
    </section>
  </div>
}
