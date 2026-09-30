'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Student = { id: number; name: string }
type ClassRow = { id: number; name: string }

export default function AddTestAssigneesModal({ testId, students, assignedIds, onClose, onSaved }: {
  testId: number; students: Student[]; assignedIds: number[]
  onClose: () => void; onSaved: (ids: number[]) => void
}) {
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [members, setMembers] = useState<{ class_id: number; student_id: number }[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [search, setSearch] = useState('')
  const [batchName, setBatchName] = useState('')
  const [classId, setClassId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const assigned = new Set(assignedIds)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [c, m] = await Promise.all([
        supabase.from('classes').select('id,name').order('name'),
        supabase.from('class_students').select('class_id,student_id'),
      ])
      if (cancelled) return
      if (c.error || m.error) setError('반과 학생 목록을 불러오지 못했습니다.')
      else { setClasses(c.data ?? []); setMembers(m.data ?? []) }
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [])

  function toggleClass(classId: number) {
    const ids = members.filter(row => row.class_id === classId && !assigned.has(row.student_id)).map(row => row.student_id)
    setClassId(classId)
    setSelected(ids)
    const cls = classes.find(row => row.id === classId)
    if (cls) setBatchName(cls.name)
  }

  async function save() {
    if (!selected.length || !batchName.trim() || saving) return
    setSaving(true); setError('')
    const { error: saveError } = await supabase.rpc('add_auto_test_batch', {
      p_test_id: testId, p_name: batchName.trim(), p_class_id: classId, p_student_ids: selected,
    })
    setSaving(false)
    if (saveError) { setError(saveError.message); return }
    onSaved(selected)
  }

  return <div className="add-exam-overlay" onClick={onClose}>
    <style>{`
      .add-exam-overlay{position:fixed;inset:0;z-index:1200;background:rgba(13,27,54,.48);display:flex;align-items:center;justify-content:center;padding:16px}
      .add-exam-modal{width:560px;max-width:100%;max-height:90dvh;background:#fff;border-radius:14px;display:flex;flex-direction:column;color:var(--ui-text);box-shadow:0 20px 50px rgba(0,0,0,.2)}
      .add-exam-modal header,.add-exam-modal footer{padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:10px}
      .add-exam-modal header{border-bottom:1px solid var(--ui-border)}
      .add-exam-modal footer{border-top:1px solid var(--ui-border);justify-content:flex-end}
      .add-exam-body{padding:18px 20px;overflow-y:auto;min-height:0}
      .add-exam-classes{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0 18px}
      .add-exam-modal button{font:inherit;font-size:13px;border-radius:8px;padding:8px 12px;border:1px solid var(--ui-border);background:#fff;color:var(--ui-text);cursor:pointer}
      .add-exam-modal button:disabled{opacity:.5;cursor:default}
      .add-exam-modal .add-exam-save{background:var(--ui-primary);color:#fff;border-color:var(--ui-primary)}
      .add-exam-roster{border:1px solid var(--ui-border);border-radius:9px;max-height:270px;overflow-y:auto}
      .add-exam-roster label{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--ui-border);font-size:13px;cursor:pointer}
      .add-exam-roster label:last-child{border-bottom:0}
      .add-exam-roster input{accent-color:var(--ui-primary)}
    `}</style>
    <section className="add-exam-modal" role="dialog" aria-modal="true" aria-label="새 회차 만들기" onClick={event => event.stopPropagation()}>
      <header><strong>새 회차 만들기</strong><button type="button" onClick={onClose} aria-label="닫기">×</button></header>
      <div className="add-exam-body">
        <p style={{ fontSize: 12, color: 'var(--ui-text-2)', lineHeight: 1.6, margin: 0 }}>새 회차의 대상 학생을 선택하세요. 기존 응시 결과는 유지되고, 공개 중인 시험은 새 학생에게 바로 보입니다.</p>
        {loading ? <p>불러오는 중...</p> : <>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginTop: 14 }}>회차 이름
            <input value={batchName} maxLength={100} onChange={event => setBatchName(event.target.value)} placeholder="예: 2회차 · 월금A-2" style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: 10, marginTop: 5, border: '1px solid var(--ui-border)', borderRadius: 8, fontSize: 16 }} />
          </label>
          <div className="add-exam-classes">{classes.map(cls => {
            const ids = members.filter(row => row.class_id === cls.id && !assigned.has(row.student_id)).map(row => row.student_id)
            const count = ids.filter(id => selected.includes(id)).length
            return <button type="button" key={cls.id} disabled={!ids.length} onClick={() => toggleClass(cls.id)}
              style={classId === cls.id ? { borderColor: 'var(--ui-primary)', background: 'var(--ui-accent-bg)' } : undefined}>
              {cls.name} {count}/{ids.length}명
            </button>
          })}</div>
          <input aria-label="학생 검색" placeholder="학생 이름 검색" value={search} onChange={event => setSearch(event.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: 10, border: '1px solid var(--ui-border)', borderRadius: 8, marginBottom: 10, fontSize: 16 }} />
          <div className="add-exam-roster">{students.filter(student => !assigned.has(student.id) && student.name.includes(search) && (classId === null || members.some(row => row.class_id === classId && row.student_id === student.id))).map(student =>
            <label key={student.id}><input type="checkbox" checked={selected.includes(student.id)} onChange={event => setSelected(ids => event.target.checked ? [...ids, student.id] : ids.filter(id => id !== student.id))} />{student.name}</label>
          )}</div>
          {classId !== null && <button type="button" onClick={() => { setClassId(null); setSelected([]) }}>반 선택 해제 · 학생 직접 선택</button>}
          <p style={{ fontSize: 12, color: 'var(--ui-text-2)' }}>추가할 학생 {selected.length}명</p>
        </>}
        {error && <p role="alert" style={{ fontSize: 12, color: 'var(--ui-danger)' }}>{error}</p>}
      </div>
      <footer><button type="button" onClick={onClose}>취소</button><button type="button" className="add-exam-save" disabled={loading || saving || !selected.length || !batchName.trim()} onClick={save}>{saving ? '저장 중...' : '회차 추가'}</button></footer>
    </section>
  </div>
}
