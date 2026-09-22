'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { kstDateStr } from '@/lib/kst'
import { ExamQuestionDraft, toggleChoice } from '@/lib/auto-grading'

export type EditableTest = { id: number; name: string; date: string; total: number; auto_grading?: boolean; is_published?: boolean }
type Student = { id: number; name: string; school: string }
type ClassRow = { id: number; name: string }
const blank = (): ExamQuestionDraft => ({ points: null, choices: [], text: '' })
const navy = '#0D2A5E', gold = '#D87E13', bd = '#DDE3EE', bg = '#F5F7FA'
const tx = '#0D1B36', tx2 = '#4B5C7E', tx3 = '#96A4BF', gr = '#1A7F4E', re = '#C0392B'

// 숫자와 소수점(둘째 자리까지)만 남기고, 키보드로 직접 타이핑할 때 "12." 같은 중간 상태도 허용한다.
function filterPointsInput(raw: string) {
  let cleaned = raw.replace(/[^0-9.]/g, '')
  const firstDot = cleaned.indexOf('.')
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '').slice(0, 2)
  }
  return cleaned
}

export default function TestEditorModal({ test, students, onClose, onSaved }: {
  test: EditableTest | null; students: Student[]; onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState(test?.name ?? '')
  const [date, setDate] = useState(test?.date ?? kstDateStr())
  const [total, setTotal] = useState(test?.total ?? 20)
  const [auto, setAuto] = useState(test?.auto_grading ?? false)
  const [questions, setQuestions] = useState<ExamQuestionDraft[]>(Array.from({ length: test?.total ?? 20 }, blank))
  const [pointsDraft, setPointsDraft] = useState<Record<number, string>>({})
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
    if (auto) {
      const badPoints = questions.findIndex(q => q.points === null || !Number.isFinite(q.points) || q.points < 1 || q.points > 1000)
      if (badPoints !== -1) return setError(`${badPoints + 1}번 문항의 배점을 확인하세요. 1~1000 사이 값을 입력할 수 있습니다(소수점 둘째 자리까지).`)
      const badAnswer = questions.findIndex(q => !q.choices.length && !q.text.trim())
      if (badAnswer !== -1) return setError(`${badAnswer + 1}번 문항의 정답을 입력하세요.`)
    }
    const keepPublished = test?.is_published ?? false
    if (auto && keepPublished && !selected.length) return setError('공개된 시험은 응시 학생이 1명 이상 있어야 합니다.')
    setSaving(true)
    try {
      if (auto || test?.auto_grading) {
        const { error } = await supabase.rpc('save_auto_test', {
          p_id: test?.id ?? null, p_name: name.trim(), p_date: date, p_total: total, p_auto: auto,
          p_published: keepPublished, p_questions: questions, p_students: selected,
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

  const totalPoints = Math.round(questions.reduce((sum, q) => sum + (q.points ?? 0), 0) * 100) / 100

  return <div className="exam-editor-overlay">
    <style>{`
      .exam-editor-overlay{position:fixed;inset:0;background:rgba(13,27,54,.5);z-index:1100;display:flex;align-items:center;justify-content:center;padding:16px}
      .exam-editor{width:800px;max-width:100%;max-height:92dvh;overflow:auto;background:#fff;border-radius:16px;color:${tx};font-family:inherit;box-shadow:0 24px 60px rgba(13,27,54,.25)}
      .exam-editor header,.exam-editor footer{padding:18px 24px;display:flex;align-items:center;justify-content:space-between;gap:10px;background:#fff;position:sticky;z-index:1}
      .exam-editor header{top:0;border-bottom:1px solid ${bd}}.exam-editor footer{bottom:0;border-top:1px solid ${bd};border-radius:0 0 16px 16px}
      .exam-editor header strong{font-size:17px}
      .exam-editor .exam-close{width:30px;height:30px;border-radius:50%;border:none;background:${bg};color:${tx2};font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}
      .exam-editor fieldset{margin:0;border:0;padding:22px 24px;min-width:0}
      .exam-editor input:not([type=checkbox]){width:100%;padding:10px 12px;border:1.5px solid ${bd};border-radius:9px;font:inherit;font-size:15px;box-sizing:border-box;color:${tx};transition:border-color .15s}
      .exam-editor input:not([type=checkbox]):focus{outline:none;border-color:${navy}}
      .exam-editor .exam-save{padding:10px 22px;border:none;border-radius:9px;background:${gold};color:#3A2205;font-weight:700;font-size:14.5px;cursor:pointer}
      .exam-editor .exam-save:disabled{opacity:.55;cursor:default}
      .exam-editor .exam-cancel{padding:10px 16px;border:1.5px solid ${bd};border-radius:9px;background:#fff;color:${tx2};font-weight:600;font-size:14.5px;cursor:pointer}
      .exam-editor .exam-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      .exam-editor label.exam-field{font-size:12.5px;font-weight:600;color:${tx2};display:block}
      .exam-editor label.exam-field input{margin-top:6px}
      .exam-editor .exam-section{margin-top:26px;padding-top:22px;border-top:1px solid ${bd}}
      .exam-editor .exam-section-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:10px;flex-wrap:wrap}
      .exam-editor h3{font-size:15px;font-weight:700;margin:0;color:${tx}}
      .exam-editor .exam-help{font-size:12.5px;color:${tx3};line-height:1.75;margin:0 0 14px}
      .exam-editor .exam-auto-toggle{display:flex;align-items:center;gap:10px;padding:14px 16px;border:1.5px solid ${bd};border-radius:10px;cursor:pointer;background:${bg}}
      .exam-editor .exam-auto-toggle[data-on=true]{border-color:${navy};background:#EAF0FB}
      .exam-editor .exam-switch{width:38px;height:22px;border-radius:99px;background:${bd};position:relative;flex-shrink:0;transition:background .15s}
      .exam-editor .exam-switch[data-on=true]{background:${navy}}
      .exam-editor .exam-switch::after{content:'';position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .15s;box-shadow:0 1px 3px rgba(0,0,0,.25)}
      .exam-editor .exam-switch[data-on=true]::after{transform:translateX(16px)}
      .exam-editor .exam-question{display:grid;grid-template-columns:108px 1fr;gap:16px;padding:14px 16px;border:1.5px solid ${bd};border-radius:12px;margin-bottom:10px;align-items:start}
      .exam-editor .exam-qmeta{display:flex;flex-direction:column;gap:10px;min-width:0}
      .exam-editor .exam-qlabel{font-size:15px;font-weight:700;color:${tx}}
      .exam-editor .exam-qpts-label{font-size:11px;font-weight:700;color:${tx3};letter-spacing:.3px;display:block;margin-bottom:4px}
      .exam-editor .exam-qpts-row{display:flex;align-items:center;gap:5px}
      .exam-editor .exam-qpts-row input{width:62px;padding:6px 4px;text-align:center;font-weight:700;font-size:15px}
      .exam-editor .exam-qpts-row span{font-size:12.5px;color:${tx3};white-space:nowrap;flex-shrink:0}
      .exam-editor .exam-choices{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
      .exam-editor .exam-choice{width:44px;height:44px;border-radius:50%;border:1.5px solid ${bd};background:#fff;color:${tx};font-size:17px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:all .15s;flex-shrink:0}
      .exam-editor .exam-choice:hover:not(:disabled){border-color:${navy};color:${navy}}
      .exam-editor .exam-choice:disabled{opacity:.5;cursor:default}
      .exam-editor .exam-choice[aria-pressed=true]{background:${navy};border-color:${navy};color:#fff;box-shadow:0 0 0 3px rgba(13,42,94,.18)}
      .exam-editor .exam-qstatus{font-size:11.5px;font-weight:600;margin-top:7px;display:inline-flex;align-items:center;gap:4px}
      .exam-editor .exam-qstatus[data-ok=true]{color:${gr}}.exam-editor .exam-qstatus[data-ok=false]{color:${tx3}}
      .exam-editor .exam-count-badge{font-size:12.5px;font-weight:700;color:${navy};background:#EAF0FB;padding:3px 10px;border-radius:20px;flex-shrink:0}
      .exam-editor .exam-class-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(126px,1fr));gap:8px;margin-bottom:16px}
      .exam-editor .exam-class-chip{display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:10px 12px;border-radius:10px;border:1.5px solid ${bd};background:#fff;cursor:pointer;text-align:left;transition:all .15s;font-family:inherit}
      .exam-editor .exam-class-chip:disabled{opacity:.4;cursor:default}
      .exam-editor .exam-class-chip:hover:not(:disabled){border-color:${navy}}
      .exam-editor .exam-class-name{font-size:12.5px;font-weight:700;color:${tx};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
      .exam-editor .exam-class-count{font-size:11px;font-weight:600;color:${tx3}}
      .exam-editor .exam-class-chip[data-state=partial]{border-color:${gold};background:#FFF7EA}
      .exam-editor .exam-class-chip[data-state=partial] .exam-class-count{color:#B36A00}
      .exam-editor .exam-class-chip[data-state=all]{border-color:${navy};background:${navy}}
      .exam-editor .exam-class-chip[data-state=all] .exam-class-name,.exam-editor .exam-class-chip[data-state=all] .exam-class-count{color:#fff}
      .exam-editor .exam-roster-head{display:flex;gap:8px;align-items:center;margin-bottom:8px}
      .exam-editor .exam-search-box{flex:1;display:flex;align-items:center;gap:7px;padding:9px 12px;border:1.5px solid ${bd};border-radius:9px;background:#fff}
      .exam-editor .exam-search-box input{border:none;padding:0;font-size:14px}
      .exam-editor .exam-search-box input:focus{outline:none;border:none}
      .exam-editor .exam-clear-link{border:none;background:none;color:${tx3};font-size:12.5px;font-weight:700;cursor:pointer;padding:4px 2px;white-space:nowrap;font-family:inherit}
      .exam-editor .exam-clear-link:hover{color:${re}}
      .exam-editor .exam-roster{max-height:230px;overflow:auto;border:1px solid ${bd};border-radius:10px;background:#fff}
      .exam-editor .exam-roster-row{display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid ${bg};cursor:pointer;font-size:13.5px}
      .exam-editor .exam-roster-row:last-child{border-bottom:none}
      .exam-editor .exam-roster-row:hover{background:${bg}}
      .exam-editor .exam-roster-row[data-checked=true]{background:#EAF0FB}
      .exam-editor .exam-roster-row input[type=checkbox]{width:17px;height:17px;accent-color:${navy};flex-shrink:0;cursor:pointer}
      .exam-editor .exam-roster-name{font-weight:600;color:${tx}}
      .exam-editor .exam-roster-school{font-size:11.5px;color:${tx3};margin-left:auto}
      .exam-editor .exam-roster-empty{padding:20px;text-align:center;color:${tx3};font-size:13px;margin:0}
      .exam-editor .exam-publish-note{display:flex;gap:10px;align-items:flex-start;padding:14px 16px;border-radius:10px;background:#FFF7EA;border:1px solid #F3DDB0;color:#6B4A0E;font-size:12.5px;line-height:1.7;margin-top:20px}
      .exam-editor .exam-locked{display:flex;gap:10px;align-items:flex-start;padding:14px 16px;border-radius:10px;background:#FDF3ED;border:1px solid #F5CBA7;color:#8A4B14;font-size:12.5px;line-height:1.7;margin:16px 24px 0}
      .exam-editor .exam-error{color:${re};background:#FDECEA;border-radius:8px;padding:10px 14px;margin:16px 24px 0;font-size:13px}
      @media(max-width:560px){.exam-editor-overlay{padding:0}.exam-editor{border-radius:0;max-height:100dvh}.exam-editor fieldset{padding:16px}.exam-editor .exam-grid{grid-template-columns:1fr}.exam-editor .exam-question{grid-template-columns:1fr}.exam-editor .exam-qmeta{flex-direction:row;align-items:center;justify-content:space-between}.exam-editor .exam-class-grid{grid-template-columns:repeat(auto-fill,minmax(108px,1fr))}}
    `}</style>
    <section className="exam-editor" role="dialog" aria-modal="true" aria-label={test ? '테스트 편집' : '테스트 추가'}>
      <header>
        <strong>{test ? '테스트 편집' : '테스트 추가'}</strong>
        <button className="exam-close" onClick={onClose} disabled={saving} aria-label="닫기">×</button>
      </header>
      {error && <p role="alert" className="exam-error">{error}</p>}
      {locked && <p className="exam-locked">응시가 시작된 시험은 내용을 변경할 수 없습니다. 재시험이나 문항 변경이 필요하면 새 시험을 만들어 주세요. 공개 여부는 시험 상세 화면에서 바꿀 수 있습니다.</p>}
      <fieldset disabled={loading || saving || locked || loadError}>
        {loading ? <p style={{ color: tx3, fontSize: 13 }}>시험 설정을 불러오는 중...</p> : <>
          <label className="exam-field">시험명<input value={name} onChange={e => setName(e.target.value)} placeholder="예) 2학년 1학기 중간 단원평가" /></label>
          <div className="exam-grid" style={{ marginTop: 14 }}>
            <label className="exam-field">날짜<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
            <label className="exam-field">총 문항 수<input type="text" inputMode="numeric" value={total} onChange={e => changeTotal(Number(e.target.value.replace(/[^0-9]/g, '') || 0))} /></label>
          </div>

          <div className="exam-section">
            <button type="button" className="exam-auto-toggle" data-on={auto} disabled={locked} onClick={() => setAuto(v => !v)} style={{ width: '100%', font: 'inherit', textAlign: 'left' }}>
              <span className="exam-switch" data-on={auto} />
              <span>
                <strong style={{ display: 'block', fontSize: 13.5, color: tx }}>자동채점 사용</strong>
                <span style={{ display: 'block', fontSize: 12, color: tx3, marginTop: 2 }}>{auto ? '학생이 직접 답안을 입력하면 서버가 즉시 채점합니다.' : '기존처럼 수업기록에서 정답 수와 점수를 직접 입력합니다.'}</span>
              </span>
            </button>
          </div>

          {auto && <>
            <section className="exam-section">
              <div className="exam-section-head">
                <h3>문항별 배점 · 정답</h3>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: navy, background: '#EAF0FB', padding: '3px 10px', borderRadius: 20 }}>배점 합계 {totalPoints}점</span>
              </div>
              <p className="exam-help">1~5 중에서 누르면 객관식(복수 선택 가능), 빈칸에 입력하면 주관식입니다. 객관식은 정답 조합이 정확히 일치해야 하고 부분 점수는 없습니다. 주관식은 앞뒤 공백을 제외하고 완전히 일치해야 합니다. 성적은 배점 합계를 기준으로 100점 만점으로 환산됩니다.</p>
              {questions.map((q, i) => {
                const filled = q.choices.length > 0 || q.text.trim().length > 0
                return <div className="exam-question" key={i}>
                  <div className="exam-qmeta">
                    <span className="exam-qlabel">{i + 1}번</span>
                    <div>
                      <span className="exam-qpts-label">배점</span>
                      <div className="exam-qpts-row">
                        <input aria-label={`${i + 1}번 배점`} type="text" inputMode="decimal" disabled={locked}
                          value={pointsDraft[i] ?? (q.points ?? '')}
                          onChange={e => {
                            const filtered = filterPointsInput(e.target.value)
                            setPointsDraft(d => ({ ...d, [i]: filtered }))
                            if (filtered === '' || filtered === '.') return updateQuestion(i, { points: null })
                            const num = Number(filtered)
                            if (!Number.isNaN(num)) updateQuestion(i, { points: num })
                          }}
                          onBlur={() => setPointsDraft(d => { if (!(i in d)) return d; const next = { ...d }; delete next[i]; return next })}
                        />
                        <span>점</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="exam-choices">{[1, 2, 3, 4, 5].map(choice => (
                      <button type="button" className="exam-choice" key={choice} disabled={locked} aria-label={`${i + 1}번 정답 ${choice}`} aria-pressed={q.choices.includes(choice)} onClick={() => updateQuestion(i, { choices: toggleChoice(q.choices, choice), text: '' })}>{choice}</button>
                    ))}</div>
                    <input aria-label={`${i + 1}번 주관식 정답`} maxLength={500} disabled={locked} value={q.text} onChange={e => updateQuestion(i, { text: e.target.value, choices: [] })} placeholder="주관식 정답 입력" />
                    <span className="exam-qstatus" data-ok={filled}>
                      {q.choices.length ? `● 객관식${q.choices.length > 1 ? ' · 복수 정답' : ''} 선택됨` : q.text.trim() ? '● 주관식 입력됨' : '○ 정답 미입력'}
                    </span>
                  </div>
                </div>
              })}
            </section>

            <section className="exam-section">
              <div className="exam-section-head">
                <h3>응시 대상</h3>
                <span className="exam-count-badge">{selected.length}명 선택</span>
              </div>
              <p className="exam-help">반을 누르면 소속 학생이 한 번에 추가·제외됩니다. 개별 학생은 아래 목록에서 추가·제외할 수 있습니다.</p>

              <div className="exam-class-grid">{classes.map(c => {
                const ids = members.filter(m => m.class_id === c.id).map(m => m.student_id)
                const count = ids.filter(id => selected.includes(id)).length
                const state = ids.length === 0 ? 'empty' : count === 0 ? 'none' : count === ids.length ? 'all' : 'partial'
                return <button key={c.id} type="button" className="exam-class-chip" data-state={state} disabled={!ids.length || locked}
                  onClick={() => setSelected(s => state === 'all' ? s.filter(id => !ids.includes(id)) : [...new Set([...s, ...ids])])}>
                  <span className="exam-class-name">{c.name}</span>
                  <span className="exam-class-count">{count}/{ids.length}명</span>
                </button>
              })}</div>

              <div className="exam-roster-head">
                <div className="exam-search-box">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={tx3}><circle cx="11" cy="11" r="8" strokeWidth={2} /><path strokeWidth={2} d="M21 21l-4.35-4.35" /></svg>
                  <input aria-label="학생 검색" placeholder="학생 이름 검색" disabled={locked} value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                {selected.length > 0 && <button type="button" className="exam-clear-link" disabled={locked} onClick={() => setSelected([])}>전체 해제</button>}
              </div>
              <div className="exam-roster">
                {students.filter(s => s.name.includes(search)).length === 0 && <p className="exam-roster-empty">검색 결과가 없습니다.</p>}
                {students.filter(s => s.name.includes(search)).map(s => {
                  const checked = selected.includes(s.id)
                  return <label className="exam-roster-row" data-checked={checked} key={s.id}>
                    <input type="checkbox" disabled={locked} checked={checked} onChange={e => setSelected(ids => e.target.checked ? [...ids, s.id] : ids.filter(id => id !== s.id))} />
                    <span className="exam-roster-name">{s.name}</span>
                    <span className="exam-roster-school">{s.school}</span>
                  </label>
                })}
              </div>
            </section>

            <div className="exam-publish-note">
              <span>🔒</span>
              <span>학생 공개는 여기서 하지 않습니다. 저장 후 <strong>테스트 상세 화면의 &lsquo;학생에게 공개&rsquo; 버튼</strong>을 눌러야 대상 학생이 답안을 입력할 수 있습니다.</span>
            </div>
          </>}
        </>}
      </fieldset>
      <footer>
        <button className="exam-cancel" onClick={onClose} disabled={saving}>취소</button>
        <button className="exam-save" onClick={save} disabled={saving || loading || locked || loadError}>{saving ? '저장 중...' : '저장'}</button>
      </footer>
    </section>
  </div>
}
