'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { kstDateStr } from '@/lib/kst'

type Student = {
  id: number
  name: string
  parent_phone: string
}

type RecordForm = {
  student_id: number
  date: string
  content: string
  homework: string
  hw_rate: number
  hw_cor: number
  attitude: number
  late: boolean
  has_test: boolean
  feedback: string
  is_draft: boolean
  db_id: number | null   // 이미 저장된 경우 id
}

const navy = '#0D2A5E', navyDk = '#071A3E', navyM = '#E8EEF8'
const gold = '#D87E13', goldL = '#F09830'
const bg = '#F5F7FA', bd = '#DDE3EE'
const tx = '#0D1B36', tx2 = '#4B5C7E', tx3 = '#96A4BF'
const re = '#C0392B', rbg = '#FDECEA'
const gr = '#1A7F4E', gbg = '#E0F5EB'

function todayStr() { return kstDateStr() }

export default function RecordWritePage() {
  const router      = useRouter()
  const params      = useSearchParams()
  const classId     = params.get('classId')
  const { teacher } = useAuth()

  const [className, setClassName] = useState('')
  const [students,  setStudents]  = useState<Student[]>([])
  const [forms,     setForms]     = useState<RecordForm[]>([])
  const [date,      setDate]      = useState(todayStr())
  const [selIdx,    setSelIdx]    = useState(0)   // 현재 선택된 학생 인덱스
  const [saving,    setSaving]    = useState(false)
  const [savingAll, setSavingAll] = useState(false)
  const [notif,     setNotif]     = useState<{ msg: string; ok: boolean } | null>(null)
  const autoRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => { if (classId) fetchClass() }, [classId, date])

  async function fetchClass() {
    // 반 정보
    const { data: cls } = await supabase
      .from('classes').select('name').eq('id', classId).single()
    setClassName(cls?.name ?? '')

    // 반 소속 학생
    const { data: cs } = await supabase
      .from('class_students')
      .select('student_id, students(id, name, parent_phone)')
      .eq('class_id', classId)

    const stus: Student[] = (cs ?? [])
      .map((r: any) => r.students)
      .filter(Boolean)
      .sort((a: Student, b: Student) => a.name.localeCompare(b.name))
    setStudents(stus)

    // 오늘 날짜 기존 기록 불러오기 (임시저장 포함)
    const ids = stus.map(s => s.id)
    const { data: existing } = await supabase
      .from('records')
      .select('*')
      .in('student_id', ids)
      .eq('date', date)

    const exMap = new Map((existing ?? []).map((r: any) => [r.student_id, r]))

    setForms(stus.map(s => {
      const ex = exMap.get(s.id)
      return ex ? {
        student_id: s.id, date,
        content:  ex.content  ?? '',
        homework: ex.homework ?? '',
        hw_rate:  ex.hw_rate  ?? 0,
        hw_cor:   ex.hw_cor   ?? 0,
        attitude: ex.attitude ?? 5,
        late:     ex.late     ?? false,
        has_test: ex.has_test ?? false,
        feedback: ex.feedback ?? '',
        is_draft: ex.is_draft ?? false,
        db_id:    ex.id,
      } : {
        student_id: s.id, date,
        content: '', homework: '',
        hw_rate: 0, hw_cor: 0, attitude: 5,
        late: false, has_test: false, feedback: '',
        is_draft: true, db_id: null,
      }
    }))
  }

  function toast(msg: string, ok = true) {
    setNotif({ msg, ok })
    setTimeout(() => setNotif(null), 3000)
  }

  function setField<K extends keyof RecordForm>(idx: number, key: K, val: RecordForm[K]) {
    setForms(prev => prev.map((f, i) => i === idx ? { ...f, [key]: val } : f))
  }

  // 개별 임시저장
  async function saveDraft(idx: number) {
    const f = forms[idx]
    setSaving(true)
    const row = {
      student_id: f.student_id, date: f.date,
      content: f.content, homework: f.homework,
      hw_rate: f.hw_rate, hw_cor: f.hw_cor,
      attitude: f.attitude, late: f.late,
      has_test: f.has_test, feedback: f.feedback,
      is_draft: true, created_by: teacher?.userId,
    }
    if (f.db_id) {
      await supabase.from('records').update(row).eq('id', f.db_id)
    } else {
      const { data } = await supabase.from('records').insert(row).select('id').single()
      if (data) setForms(prev => prev.map((form, i) => i === idx ? { ...form, db_id: data.id } : form))
    }
    setSaving(false)
    toast(students[idx]?.name + ' 임시저장됨')
  }

  // 전체 최종 저장
  async function saveAll(isDraft: boolean) {
    setSavingAll(true)
    let ok = 0
    for (let i = 0; i < forms.length; i++) {
      const f = forms[i]
      // 내용이 아무것도 없는 학생은 건너뜀
      if (!isDraft && !f.content && !f.homework && !f.feedback) continue
      const row = {
        student_id: f.student_id, date: f.date,
        content: f.content, homework: f.homework,
        hw_rate: f.hw_rate, hw_cor: f.hw_cor,
        attitude: f.attitude, late: f.late,
        has_test: f.has_test, feedback: f.feedback,
        is_draft: isDraft, created_by: teacher?.userId,
      }
      if (f.db_id) {
        await supabase.from('records').update(row).eq('id', f.db_id)
      } else {
        const { data } = await supabase.from('records').insert(row).select('id').single()
        if (data) setForms(prev => prev.map((form, idx) => idx === i ? { ...form, db_id: data.id } : form))
      }
      ok++
    }
    setSavingAll(false)
    if (isDraft) {
      toast(`${ok}명 임시저장 완료`)
    } else {
      toast(`${ok}명 수업기록 저장 완료`)
      setTimeout(() => router.push('/records'), 1200)
    }
  }

  const cur = forms[selIdx]
  const stu = students[selIdx]

  const statusOf = (f: RecordForm) => {
    if (!f.db_id && !f.content && !f.homework) return 'empty'
    if (f.is_draft) return 'draft'
    return 'done'
  }

  return (
    <div style={{ padding: '28px 32px', fontFamily: "'Noto Sans KR',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
        .stu-tab{padding:9px 12px;border-radius:8px;cursor:pointer;transition:all .15s;border:1px solid ${bd};margin-bottom:5px;background:#fff;display:flex;align-items:center;gap:8px;}
        .stu-tab:hover{border-color:${navy};background:${navyM};}
        .stu-tab.active{border-color:${gold};background:rgba(216,126,19,.1);}
        .stu-tab.draft{border-left:3px solid ${tx3};}
        .stu-tab.done{border-left:3px solid ${gr};}
        .bgold{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:none;background:${gold};color:${navyDk};font-family:inherit;}
        .bgold:hover{background:${goldL};}
        .bprim{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:${navy};color:#fff;font-family:inherit;}
        .bprim:hover{background:#1A4080;}
        .bout{display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border-radius:8px;font-size:12px;cursor:pointer;border:1px solid ${bd};background:transparent;color:${tx2};font-family:inherit;}
        .bout:hover{border-color:${navy};color:${navy};}
        .fi{width:100%;padding:9px 11px;border:1.5px solid ${bd};border-radius:8px;font-size:13px;font-family:inherit;color:${tx};outline:none;background:#fff;transition:border-color .2s;box-sizing:border-box;}
        .fi:focus{border-color:${navy};}
        .lb{display:block;font-size:12px;font-weight:500;color:${tx2};margin-bottom:5px;}
        .range-wrap{display:flex;align-items:center;gap:8px;}
        .range-wrap input[type=range]{flex:1;accent-color:${navy};}
        .att-btn{width:34px;height:34px;border-radius:8px;border:1.5px solid ${bd};background:#fff;cursor:pointer;font-size:13px;font-weight:600;color:${tx2};font-family:inherit;transition:all .15s;}
        .att-btn.sel{border-color:${navy};background:${navyM};color:${navy};}
        .att-btn:hover{border-color:${navy};}
      `}</style>

      {notif && (
        <div style={{ position:'fixed',top:18,right:18,zIndex:9999,background:'#fff',borderRadius:8,padding:'11px 14px',borderLeft:`4px solid ${notif.ok?gr:re}`,boxShadow:'0 4px 18px rgba(0,0,0,.1)',minWidth:200 }}>
          <div style={{ fontWeight:600,marginBottom:2,color:tx,fontSize:13 }}>{notif.ok?'완료':'알림'}</div>
          <div style={{ fontSize:12,color:tx2 }}>{notif.msg}</div>
        </div>
      )}

      {/* 헤더 */}
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20 }}>
        <div>
          <div style={{ display:'flex',alignItems:'center',gap:6,fontSize:12,color:tx3,marginBottom:6 }}>
            <span style={{ cursor:'pointer',color:tx2 }} onClick={() => router.push('/classes')}>반 관리</span>
            <span>›</span>
            <span style={{ color:tx,fontWeight:500 }}>{className}</span>
            <span>›</span>
            <span>수업기록 작성</span>
          </div>
          <h1 style={{ fontSize:21,fontWeight:700,color:tx }}>{className} 수업기록</h1>
          <p style={{ fontSize:13,color:tx2,marginTop:4 }}>학생을 선택해서 기록을 작성하고 임시저장 후 최종 저장하세요</p>
        </div>
        <div style={{ display:'flex',gap:8,alignItems:'center' }}>
          <input type="date" value={date}
            onChange={e => setDate(e.target.value)}
            style={{ padding:'7px 11px',border:`1px solid ${bd}`,borderRadius:8,fontSize:13,fontFamily:'inherit',color:tx,outline:'none' }}/>
          <button className="bout" onClick={() => saveAll(true)} disabled={savingAll}>
            💾 전체 임시저장
          </button>
          <button className="bprim" onClick={() => saveAll(false)} disabled={savingAll}>
            ✅ 전체 최종저장
          </button>
        </div>
      </div>

      {students.length === 0 ? (
        <div style={{ textAlign:'center',padding:'60px 0',color:tx3 }}>
          <p style={{ fontSize:14 }}>이 반에 소속된 학생이 없습니다</p>
        </div>
      ) : (
        <div style={{ display:'grid',gridTemplateColumns:'220px 1fr',gap:16 }}>

          {/* 왼쪽: 학생 탭 */}
          <div>
            <p style={{ fontSize:11,color:tx3,letterSpacing:'1px',marginBottom:8 }}>학생 선택</p>
            {students.map((s, i) => {
              const st = forms[i] ? statusOf(forms[i]) : 'empty'
              return (
                <div
                  key={s.id}
                  className={`stu-tab ${st} ${selIdx === i ? 'active' : ''}`}
                  onClick={() => setSelIdx(i)}
                >
                  <div style={{ width:28,height:28,borderRadius:'50%',background:navyM,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:navy,flexShrink:0 }}>
                    {s.name[0]}
                  </div>
                  <div style={{ flex:1 }}>
                    <p style={{ fontSize:13,fontWeight:600,color:tx }}>{s.name}</p>
                  </div>
                  <span style={{ fontSize:10,padding:'2px 6px',borderRadius:10,
                    background: st==='done'?gbg : st==='draft'?navyM : bg,
                    color: st==='done'?gr : st==='draft'?navy : tx3,
                  }}>
                    {st==='done'?'완료' : st==='draft'?'임시' : '미작성'}
                  </span>
                </div>
              )
            })}
          </div>

          {/* 오른쪽: 작성 폼 */}
          {cur && stu && (
            <div style={{ background:'#fff',borderRadius:12,border:`1px solid ${bd}`,padding:24,boxShadow:'0 1px 4px rgba(0,0,0,.06)' }}>
              {/* 학생명 + 저장 버튼 */}
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18,paddingBottom:14,borderBottom:`1px solid ${bd}` }}>
                <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                  <div style={{ width:38,height:38,borderRadius:'50%',background:navyM,display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,fontWeight:700,color:navy }}>
                    {stu.name[0]}
                  </div>
                  <div>
                    <p style={{ fontSize:16,fontWeight:700,color:tx }}>{stu.name}</p>
                    <p style={{ fontSize:12,color:tx3 }}>{cur.date}</p>
                  </div>
                </div>
                <div style={{ display:'flex',gap:8 }}>
                  <button className="bout" onClick={() => saveDraft(selIdx)} disabled={saving}>
                    {saving ? '저장 중...' : '💾 임시저장'}
                  </button>
                  <button
                    style={{ display:'inline-flex',alignItems:'center',gap:5,padding:'6px 14px',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer',border:'none',background:gr,color:'#fff',fontFamily:'inherit' }}
                    onClick={async () => {
                      setField(selIdx, 'is_draft', false)
                      await saveDraft(selIdx)
                      setForms(prev => prev.map((f, i) => i === selIdx ? { ...f, is_draft: false } : f))
                      toast(stu.name + ' 최종저장됨')
                    }}
                    disabled={saving}
                  >
                    ✅ 저장
                  </button>
                </div>
              </div>

              {/* 출석 + 시험 */}
              <div style={{ display:'flex',gap:20,marginBottom:16 }}>
                <label style={{ display:'flex',alignItems:'center',gap:7,fontSize:13,cursor:'pointer' }}>
                  <input type="checkbox" checked={cur.late} onChange={e => setField(selIdx, 'late', e.target.checked)}/>
                  <span style={{ color:re,fontWeight:500 }}>지각</span>
                </label>
                <label style={{ display:'flex',alignItems:'center',gap:7,fontSize:13,cursor:'pointer' }}>
                  <input type="checkbox" checked={cur.has_test} onChange={e => setField(selIdx, 'has_test', e.target.checked)}/>
                  <span style={{ color:navy,fontWeight:500 }}>시험 있음</span>
                </label>
              </div>

              {/* 수업 태도 (1~10) */}
              <div style={{ marginBottom:16 }}>
                <label className="lb">수업 태도 ({cur.attitude}점)</label>
                <div style={{ display:'flex',gap:5,flexWrap:'wrap' }}>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                    <button
                      key={n}
                      className={`att-btn${cur.attitude === n ? ' sel' : ''}`}
                      onClick={() => setField(selIdx, 'attitude', n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize:11,color:tx3,marginTop:5 }}>
                  {cur.attitude <= 3 ? '😟 노력 필요' : cur.attitude <= 6 ? '😐 보통' : cur.attitude <= 8 ? '🙂 좋음' : '😄 매우 좋음'}
                </p>
              </div>

              {/* 수업 내용 */}
              <div style={{ marginBottom:14 }}>
                <label className="lb">수업 내용 (진도)</label>
                <textarea className="fi" rows={3} style={{ resize:'vertical' }}
                  value={cur.content}
                  onChange={e => setField(selIdx, 'content', e.target.value)}
                  placeholder="오늘 수업한 내용을 입력하세요"/>
              </div>

              {/* 숙제 */}
              <div style={{ marginBottom:14 }}>
                <label className="lb">숙제</label>
                <textarea className="fi" rows={2} style={{ resize:'vertical' }}
                  value={cur.homework}
                  onChange={e => setField(selIdx, 'homework', e.target.value)}
                  placeholder="숙제 내용을 입력하세요"/>
              </div>

              {/* 숙제 이행률 / 정답률 */}
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14 }}>
                <div>
                  <label className="lb">숙제 이행률</label>
                  <div className="range-wrap">
                    <input type="range" min={0} max={100} step={5}
                      value={cur.hw_rate}
                      onChange={e => setField(selIdx, 'hw_rate', Number(e.target.value))}/>
                    <span style={{ fontSize:14,fontWeight:700,color:navy,minWidth:38,textAlign:'right' }}>{cur.hw_rate}%</span>
                  </div>
                </div>
                <div>
                  <label className="lb">숙제 정답률</label>
                  <div className="range-wrap">
                    <input type="range" min={0} max={100} step={5}
                      value={cur.hw_cor}
                      onChange={e => setField(selIdx, 'hw_cor', Number(e.target.value))}/>
                    <span style={{ fontSize:14,fontWeight:700,color:navy,minWidth:38,textAlign:'right' }}>{cur.hw_cor}%</span>
                  </div>
                </div>
              </div>

              {/* 선생님 메모 */}
              <div>
                <label className="lb">선생님 메모 (학부모 문자에 포함)</label>
                <textarea className="fi" rows={2} style={{ resize:'vertical' }}
                  value={cur.feedback}
                  onChange={e => setField(selIdx, 'feedback', e.target.value)}
                  placeholder="학부모님께 전달할 내용을 입력하세요"/>
              </div>

              {/* 이전/다음 학생 이동 */}
              <div style={{ display:'flex',justifyContent:'space-between',marginTop:18,paddingTop:14,borderTop:`1px solid ${bd}` }}>
                <button className="bout"
                  disabled={selIdx === 0}
                  onClick={() => setSelIdx(i => i - 1)}
                  style={{ opacity: selIdx === 0 ? 0.4 : 1 }}>
                  ◀ 이전 학생
                </button>
                <span style={{ fontSize:12,color:tx3,alignSelf:'center' }}>
                  {selIdx + 1} / {students.length}
                </span>
                <button className="bout"
                  disabled={selIdx === students.length - 1}
                  onClick={() => setSelIdx(i => i + 1)}
                  style={{ opacity: selIdx === students.length - 1 ? 0.4 : 1 }}>
                  다음 학생 ▶
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}