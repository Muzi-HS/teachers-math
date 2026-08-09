'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { can } from '@/lib/permissions'
import { kstDateStr, kstNow } from '@/lib/kst'

type Student = {
  id: number
  name: string
  birth_year: number
  school: string           // 현재 다니는 학교 이름
  school_type: string | null   // '초등' | '중학' | '고등' | 'none' | null
  school_elementary: string    // 이전 초등학교 이름 (중학/고등 학생용)
  school_middle: string        // 이전 중학교 이름 (고등 학생용)
  phone: string
  parent_phone: string
  reg_date: string
}

type Class = { id: number; name: string; active: boolean }

const BLANK: Omit<Student, 'id'> = {
  name: '', birth_year: kstNow().getFullYear() - 15,
  school: '', school_type: null,
  school_elementary: '', school_middle: '',
  phone: '', parent_phone: '',
  reg_date: kstDateStr(),
}

const navy = '#0D2A5E', navyDk = '#071A3E', navyM = '#E8EEF8'
const gold = '#D87E13', goldL = '#F09830'
const bg = '#F5F7FA', bd = '#DDE3EE'
const tx = '#0D1B36', tx2 = '#4B5C7E', tx3 = '#96A4BF'
const re = '#C0392B', rbg = '#FDECEA'
const gr = '#1A7F4E', gbg = '#E0F5EB'
const pu = '#7C3AED', pubg = '#F3E8FF'

const SCHOOL_TYPES = ['초등', '중학', '고등'] as const
type SchoolKey = typeof SCHOOL_TYPES[number]
const SCHOOL_RANGES: Record<SchoolKey, [number, number]> = {
  '초등': [8, 13],
  '중학': [14, 16],
  '고등': [17, 19],
}
const SCHOOL_COLORS: Record<SchoolKey | 'none', { bg: string; color: string }> = {
  '초등': { bg: gbg,   color: gr },
  '중학': { bg: navyM, color: navy },
  '고등': { bg: pubg,  color: pu },
  'none': { bg: bg,    color: tx3 },
}

export default function StudentsPage() {
  const { role } = useAuth()
  const [students, setStudents] = useState<Student[]>([])
  const [classes,  setClasses]  = useState<Class[]>([])
  const [csMap,    setCsMap]    = useState<Record<number, number[]>>({})
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState(false)
  const [form,     setForm]     = useState<Omit<Student, 'id'>>({ ...BLANK })
  const [editId,   setEditId]   = useState<number | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [search,   setSearch]   = useState('')
  const [ageFlt,   setAgeFlt]   = useState('')
  const [schoolFlt,setSchoolFlt]= useState('')
  const [notif,    setNotif]    = useState<{ msg: string; ok: boolean } | null>(null)
  const [noPhone,  setNoPhone]  = useState(false)
  const [detailStu,setDetailStu]= useState<Student | null>(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: s }, { data: c }, { data: cs }] = await Promise.all([
      supabase.from('students').select('*').order('name'),
      supabase.from('classes').select('id, name, active').order('name'),
      supabase.from('class_students').select('student_id, class_id'),
    ])
    setStudents(s ?? [])
    setClasses((c ?? []).map(x => ({ ...x, active: x.active ?? true })))
    const map: Record<number, number[]> = {}
    for (const row of (cs ?? [])) {
      if (!map[row.student_id]) map[row.student_id] = []
      map[row.student_id].push(row.class_id)
    }
    setCsMap(map)
    setLoading(false)
  }

  function toast(msg: string, ok = true) {
    setNotif({ msg, ok })
    setTimeout(() => setNotif(null), 3000)
  }

  function ageOf(birth: number) {
    return kstNow().getFullYear() - birth + 1
  }

  function fmtPhone(p: string) {
    if (!p) return '-'
    const n = p.replace(/-/g, '')
    return n.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3') || p
  }

  function openAdd() {
    setEditId(null)
    setForm({ ...BLANK })
    setNoPhone(false)
    setModal(true)
  }

  function openEdit(s: Student) {
    setEditId(s.id)
    setForm({
      name: s.name, birth_year: s.birth_year, school: s.school ?? '',
      school_type: s.school_type ?? null,
      school_elementary: s.school_elementary ?? '',
      school_middle: s.school_middle ?? '',
      phone: s.phone ?? '', parent_phone: s.parent_phone ?? '',
      reg_date: s.reg_date ?? kstDateStr(),
    })
    setNoPhone(!s.phone)
    setModal(true)
  }

  async function save() {
    if (!form.name.trim())   return toast('이름을 입력하세요.', false)
    if (!form.birth_year)    return toast('출생연도를 입력하세요.', false)
    setSaving(true)
    const row: Record<string, any> = {
      name: form.name.trim(),
      birth_year: Number(form.birth_year),
      school: form.school.trim(),
      school_type: form.school_type,
      phone: form.phone.trim(),
      parent_phone: form.parent_phone.trim(),
      reg_date: form.reg_date,
    }
    // 이전 학교 정보 포함 (DB에 컬럼이 없으면 upsert에서 무시됨)
    try {
      row.school_elementary = form.school_elementary.trim()
      row.school_middle = form.school_middle.trim()
    } catch {}

    if (editId) {
      const { error } = await supabase.from('students').update(row).eq('id', editId)
      if (error) { toast('수정 실패: ' + error.message, false); setSaving(false); return }
      toast(form.name + ' 수정됨')
    } else {
      const { error } = await supabase.from('students').insert(row)
      if (error) {
        // 새 컬럼 없을 경우 폴백
        const { school_elementary: _e, school_middle: _m, ...rowFallback } = row
        const { error: e2 } = await supabase.from('students').insert(rowFallback)
        if (e2) { toast('등록 실패: ' + e2.message, false); setSaving(false); return }
      }
      toast(form.name + ' 등록됨')
    }
    setSaving(false); setModal(false)
    await fetchAll()
  }

  async function resetParentPin(parentPhone: string, studentName: string) {
    if (!confirm(`${studentName} 학부모의 PIN을 0000으로 초기화하시겠습니까?`)) return
    const normalized = parentPhone.replace(/-/g, '')
    const { error } = await supabase
      .from('parents')
      .update({ pin: '0000' })
      .eq('phone', normalized)
    if (error) return toast('PIN 초기화 실패: ' + error.message, false)
    toast(`${studentName} 학부모 PIN이 초기화됐습니다`)
  }

  async function remove(id: number, name: string) {
    if (!confirm(`${name} 학생을 삭제하시겠습니까?`)) return

    const { data: ps } = await supabase
      .from('parent_students')
      .select('parent_id')
      .eq('student_id', id)

    const parentIds = [...new Set((ps ?? []).map((r: any) => r.parent_id))]

    const { error } = await supabase.from('students').delete().eq('id', id)
    if (error) return toast('삭제 실패: ' + error.message, false)

    for (const parentId of parentIds) {
      const { data: remaining } = await supabase
        .from('parent_students')
        .select('student_id')
        .eq('parent_id', parentId)
      if (!remaining || remaining.length === 0) {
        await supabase.from('parents').delete().eq('id', parentId)
      }
    }

    toast(name + ' 삭제됨', false)
    await fetchAll()
  }

  const isAdmin = role === 'admin'
  const canFull = can.viewFullStudent(role!)

  const filtered = students.filter(s => {
    const matchSearch = s.name.includes(search) || (s.school ?? '').includes(search)
    const matchAge    = ageFlt === '' || String(ageOf(s.birth_year)) === ageFlt
    const matchSchool = schoolFlt === '' || s.school === schoolFlt
    return matchSearch && matchAge && matchSchool
  })

  const ageOptions    = [...new Set(students.map(s => ageOf(s.birth_year)))].sort((a, b) => a - b)
  const schoolOptions = [...new Set(students.map(s => s.school).filter(Boolean))].sort()

  const formAge = ageOf(Number(form.birth_year) || 2000)
  const st = form.school_type  // shorthand

  function getStudentClasses(stuId: number) {
    return (csMap[stuId] ?? []).map(cid => classes.find(c => c.id === cid)).filter(Boolean) as Class[]
  }

  return (
    <div style={{ padding: '28px 32px', fontFamily: "'Noto Sans KR',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
        table{width:100%;border-collapse:collapse;}
        th{padding:9px 12px;text-align:left;font-size:11px;font-weight:600;color:${tx3};letter-spacing:.5px;background:${bg};border-bottom:1px solid ${bd};}
        td{padding:11px 12px;border-bottom:1px solid ${bd};font-size:13px;color:${tx};}
        tr:last-child td{border-bottom:none;}
        tr:hover td{background:${navyM};cursor:pointer;}
        .bgold{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:none;background:${gold};color:${navyDk};font-family:inherit;}
        .bgold:hover{background:${goldL};}
        .bout{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:500;cursor:pointer;border:1px solid ${bd};background:transparent;color:${tx2};font-family:inherit;}
        .bout:hover{border-color:${navy};color:${navy};}
        .bdng{display:inline-flex;align-items:center;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;border:none;background:${rbg};color:${re};font-family:inherit;}
        .sbox{display:flex;align-items:center;gap:7px;padding:7px 12px;background:#fff;border:1px solid ${bd};border-radius:8px;flex:1;min-width:160px;}
        .sbox input{border:none;outline:none;font-size:13px;font-family:inherit;color:${tx};background:transparent;width:100%;}
        .fsel{padding:7px 11px;border:1px solid ${bd};border-radius:8px;font-size:12px;font-family:inherit;color:${tx2};background:#fff;outline:none;cursor:pointer;}
        .fi{width:100%;padding:9px 11px;border:1.5px solid ${bd};border-radius:8px;font-size:13px;font-family:inherit;color:${tx};outline:none;background:#fff;transition:border-color .2s;box-sizing:border-box;}
        .fi:focus{border-color:${navy};}
        .lb{display:block;font-size:12px;font-weight:500;color:${tx2};margin-bottom:5px;}
        .badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:500;}
        .stype-btn{padding:6px 14px;border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit;font-weight:500;transition:border-color .15s,background .15s;}
        .stype-btn:disabled{cursor:default;opacity:0.35;}
        .school-row{display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid ${bd};}
        .school-row:last-child{border-bottom:none;}
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
          <h1 style={{ fontSize:21,fontWeight:700,color:tx }}>학생 관리</h1>
          <p style={{ fontSize:13,color:tx2,marginTop:4 }}>학원에 등록된 전체 학생</p>
        </div>
        {isAdmin && (
          <button className="bgold" onClick={openAdd}>
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M12 5v14M5 12h14"/></svg>
            학생 등록
          </button>
        )}
      </div>

      {/* 카드 */}
      <div style={{ background:'#fff',borderRadius:12,border:`1px solid ${bd}`,padding:22,boxShadow:'0 1px 4px rgba(0,0,0,.06)' }}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16 }}>
          <span style={{ fontSize:14,fontWeight:600,color:tx }}>
            전체 학생 <span style={{ fontSize:12,color:tx3,fontWeight:400 }}>{filtered.length}명</span>
          </span>
        </div>
        <div style={{ display:'flex',gap:9,alignItems:'center',marginBottom:18,flexWrap:'wrap' }}>
          <div className="sbox">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={tx3}><circle cx="11" cy="11" r="8" strokeWidth={2}/><path strokeWidth={2} d="M21 21l-4.35-4.35"/></svg>
            <input placeholder="이름 또는 학교 검색..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="fsel" value={ageFlt} onChange={e => setAgeFlt(e.target.value)}>
            <option value="">전체 나이</option>
            {ageOptions.map(age => <option key={age} value={String(age)}>{age}세</option>)}
          </select>
          <select className="fsel" value={schoolFlt} onChange={e => setSchoolFlt(e.target.value)}>
            <option value="">전체 학교</option>
            {schoolOptions.map(sc => <option key={sc} value={sc}>{sc}</option>)}
          </select>
        </div>

        {loading ? (
          <p style={{ color:tx3,fontSize:13 }}>불러오는 중...</p>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center',padding:'40px 0',color:tx3 }}>
            <p style={{ fontSize:32,marginBottom:8 }}>👨‍🎓</p>
            <p style={{ fontSize:14 }}>등록된 학생이 없습니다</p>
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>이름</th>
                  <th>나이</th>
                  <th>학교</th>
                  {canFull && <th>학생 연락처</th>}
                  {canFull && <th>학부모 연락처</th>}
                  <th>소속 반</th>
                  {isAdmin && <th>관리</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const activeClsIds = (csMap[s.id] ?? []).filter(cid => classes.find(c => c.id === cid)?.active !== false)
                  const stColor = s.school_type && s.school_type !== 'none' ? SCHOOL_COLORS[s.school_type as SchoolKey] : null
                  return (
                    <tr key={s.id} onClick={() => setDetailStu(s)}>
                      <td>
                        <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                          <span style={{ fontWeight:600 }}>{s.name}</span>
                          {stColor && (
                            <span className="badge" style={{ background:stColor.bg,color:stColor.color }}>{s.school_type}</span>
                          )}
                        </div>
                      </td>
                      <td style={{ color:tx2 }}>{ageOf(s.birth_year)}세</td>
                      <td style={{ color:tx2 }}>{s.school || '-'}</td>
                      {canFull && <td style={{ color:tx2 }}>{fmtPhone(s.phone)}</td>}
                      {canFull && (
                        <td>
                          <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                            <span style={{ color:tx2 }}>{fmtPhone(s.parent_phone)}</span>
                            {isAdmin && s.parent_phone && (
                              <button className="bdng" style={{ padding:'2px 7px',fontSize:10 }}
                                onClick={e => { e.stopPropagation(); resetParentPin(s.parent_phone, s.name) }}>
                                PIN초기화
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display:'flex',gap:4,flexWrap:'wrap' }}>
                          {activeClsIds.length > 0
                            ? activeClsIds.map(cid => {
                                const cls = classes.find(c => c.id === cid)
                                return cls ? <span key={cid} className="badge" style={{ background:navyM,color:navy }}>{cls.name}</span> : null
                              })
                            : <span style={{ color:tx3,fontSize:12 }}>미배정</span>
                          }
                        </div>
                      </td>
                      {isAdmin && (
                        <td onClick={e => e.stopPropagation()}>
                          <div style={{ display:'flex',gap:5 }}>
                            <button className="bout" onClick={() => openEdit(s)}>수정</button>
                            <button className="bdng" onClick={() => remove(s.id, s.name)}>삭제</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ══ 등록/수정 모달 ══ */}
      {modal && (
        <div onClick={() => setModal(false)} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.42)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#fff',borderRadius:12,width:540,maxWidth:'100%',maxHeight:'90vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,.15)' }}>
            <div style={{ padding:'18px 22px 0',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
              <span style={{ fontSize:15,fontWeight:600,color:tx }}>{editId ? '학생 정보 수정' : '학생 등록'}</span>
              <button onClick={() => setModal(false)} style={{ width:28,height:28,borderRadius:'50%',border:'none',background:bg,cursor:'pointer',fontSize:17,color:tx2 }}>×</button>
            </div>

            <div style={{ padding:'18px 22px' }}>
              {/* 이름 + 출생연도 */}
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14 }}>
                <div>
                  <label className="lb">이름</label>
                  <input className="fi" value={form.name} onChange={e => setForm(f => ({...f, name:e.target.value}))} placeholder="학생 이름"/>
                </div>
                <div>
                  <label className="lb">출생연도</label>
                  <input type="number" className="fi" value={form.birth_year}
                    onChange={e => setForm(f => ({...f, birth_year:Number(e.target.value), school_type:null, school:'', school_elementary:'', school_middle:''}))}
                    placeholder="예) 2011"/>
                </div>
              </div>

              {/* 학교 구분 선택 */}
              <div style={{ marginBottom:14 }}>
                <label className="lb">
                  학교 구분
                  <span style={{ color:tx3,fontSize:11,marginLeft:6 }}>(나이에 맞는 항목만 선택 가능)</span>
                </label>
                <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
                  {SCHOOL_TYPES.map(type => {
                    const [lo, hi] = SCHOOL_RANGES[type]
                    const disabled = formAge < lo || formAge > hi
                    const selected = form.school_type === type
                    const col = SCHOOL_COLORS[type]
                    return (
                      <button key={type} type="button" className="stype-btn" disabled={disabled}
                        onClick={() => setForm(f => ({ ...f, school_type: f.school_type === type ? null : type, school:'', school_elementary:'', school_middle:'' }))}
                        style={{ border:`1.5px solid ${selected ? col.color : bd}`, background:selected ? col.bg : '#fff', color:selected ? col.color : tx2 }}>
                        {type}학교
                      </button>
                    )
                  })}
                  <button type="button" className="stype-btn"
                    onClick={() => setForm(f => ({ ...f, school_type: f.school_type === 'none' ? null : 'none', school:'', school_elementary:'', school_middle:'' }))}
                    style={{ border:`1.5px solid ${form.school_type === 'none' ? re : bd}`, background:form.school_type === 'none' ? rbg : '#fff', color:form.school_type === 'none' ? re : tx2 }}>
                    정보 없음
                  </button>
                </div>
              </div>

              {/* ── 학교 이름 필드 (school_type에 따라 다르게 표시) ── */}
              {st === 'none' && (
                <div style={{ background:bg,borderRadius:8,padding:'10px 14px',marginBottom:14,fontSize:12,color:tx3 }}>
                  학교 정보를 알 수 없는 경우입니다.
                </div>
              )}

              {/* 초등학생: 초등학교명만 */}
              {st === '초등' && (
                <div style={{ marginBottom:14 }}>
                  <label className="lb">초등학교명 (현재)</label>
                  <input className="fi" value={form.school} onChange={e => setForm(f => ({...f, school:e.target.value}))} placeholder="예) 강남초등학교"/>
                </div>
              )}

              {/* 중학생: 초등학교 (이전) + 중학교 (현재) */}
              {st === '중학' && (
                <>
                  <div style={{ marginBottom:14 }}>
                    <label className="lb">
                      초등학교명 (이전)
                      <span style={{ fontSize:11,color:tx3,marginLeft:6 }}>선택</span>
                    </label>
                    <input className="fi" value={form.school_elementary} onChange={e => setForm(f => ({...f, school_elementary:e.target.value}))} placeholder="예) 강남초등학교"/>
                  </div>
                  <div style={{ marginBottom:14 }}>
                    <label className="lb">중학교명 (현재)</label>
                    <input className="fi" value={form.school} onChange={e => setForm(f => ({...f, school:e.target.value}))} placeholder="예) 강남중학교"/>
                  </div>
                </>
              )}

              {/* 고등학생: 초등학교 (이전) + 중학교 (이전) + 고등학교 (현재) */}
              {st === '고등' && (
                <>
                  <div style={{ marginBottom:14 }}>
                    <label className="lb">
                      초등학교명 (이전)
                      <span style={{ fontSize:11,color:tx3,marginLeft:6 }}>선택</span>
                    </label>
                    <input className="fi" value={form.school_elementary} onChange={e => setForm(f => ({...f, school_elementary:e.target.value}))} placeholder="예) 강남초등학교"/>
                  </div>
                  <div style={{ marginBottom:14 }}>
                    <label className="lb">
                      중학교명 (이전)
                      <span style={{ fontSize:11,color:tx3,marginLeft:6 }}>선택</span>
                    </label>
                    <input className="fi" value={form.school_middle} onChange={e => setForm(f => ({...f, school_middle:e.target.value}))} placeholder="예) 강남중학교"/>
                  </div>
                  <div style={{ marginBottom:14 }}>
                    <label className="lb">고등학교명 (현재)</label>
                    <input className="fi" value={form.school} onChange={e => setForm(f => ({...f, school:e.target.value}))} placeholder="예) 강남고등학교"/>
                  </div>
                </>
              )}

              {/* school_type 미선택 시 generic 학교명 */}
              {(st === null || st === undefined) && (
                <div style={{ marginBottom:14 }}>
                  <label className="lb">학교명</label>
                  <input className="fi" value={form.school} onChange={e => setForm(f => ({...f, school:e.target.value}))} placeholder="예) 강남중학교"/>
                </div>
              )}

              {/* 연락처 */}
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14 }}>
                <div>
                  <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:5 }}>
                    <label className="lb" style={{ margin:0 }}>학생 전화번호</label>
                    <label style={{ display:'flex',alignItems:'center',gap:5,fontSize:11,cursor:'pointer',color:noPhone?re:tx3 }}>
                      <input type="checkbox" checked={noPhone}
                        onChange={e => { setNoPhone(e.target.checked); if (e.target.checked) setForm(f => ({...f, phone:''})) }}
                        style={{ cursor:'pointer' }}
                      />
                      번호 없음
                    </label>
                  </div>
                  <input className="fi" value={noPhone ? '' : form.phone} disabled={noPhone}
                    onChange={e => setForm(f => ({...f, phone: e.target.value.replace(/-/g,'')}))}
                    placeholder="01000000000"
                    style={{ opacity:noPhone?0.4:1, background:noPhone?bg:'#fff' }}
                  />
                  {!noPhone && form.phone && !/^\d{10,11}$/.test(form.phone) && (
                    <p style={{ fontSize:11,color:re,marginTop:4 }}>하이픈(-) 없이 숫자만 입력하세요</p>
                  )}
                </div>
                <div>
                  <label className="lb">학부모 전화번호</label>
                  <input className="fi" value={form.parent_phone}
                    onChange={e => setForm(f => ({...f, parent_phone: e.target.value.replace(/-/g,'')}))}
                    placeholder="01000000000"
                  />
                  {form.parent_phone && !/^\d{10,11}$/.test(form.parent_phone) && (
                    <p style={{ fontSize:11,color:re,marginTop:4 }}>하이픈(-) 없이 숫자만 입력하세요</p>
                  )}
                </div>
              </div>

              {/* 등록일 */}
              <div style={{ marginBottom:14 }}>
                <label className="lb">학원 등록일</label>
                <input type="date" className="fi" value={form.reg_date} onChange={e => setForm(f => ({...f, reg_date:e.target.value}))}/>
              </div>

              {!editId && form.parent_phone && (
                <div style={{ background:gbg,border:`1px solid ${gr}`,borderRadius:8,padding:'10px 14px',fontSize:12,color:gr }}>
                  💡 학부모 전화번호 입력 시 학부모 계정이 자동으로 생성됩니다.
                </div>
              )}
            </div>

            <div style={{ padding:'0 22px 18px',display:'flex',gap:8,justifyContent:'flex-end' }}>
              <button onClick={() => setModal(false)} style={{ padding:'8px 16px',borderRadius:8,fontSize:13,border:`1px solid ${bd}`,background:'#fff',cursor:'pointer',color:tx2,fontFamily:'inherit' }}>취소</button>
              <button className="bgold" onClick={save} disabled={saving} style={{ opacity:saving?0.7:1 }}>
                {saving ? '저장 중...' : (editId ? '수정' : '등록')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ 학생 상세 모달 ══ */}
      {detailStu && (
        <div onClick={() => setDetailStu(null)} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.42)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#fff',borderRadius:12,width:480,maxWidth:'100%',maxHeight:'85vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,.15)' }}>
            <div style={{ padding:'18px 22px 0',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
              <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                <div style={{ width:40,height:40,borderRadius:'50%',background:navyM,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:700,color:navy }}>
                  {detailStu.name[0]}
                </div>
                <div>
                  <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                    <p style={{ fontSize:15,fontWeight:700,color:tx,margin:0 }}>{detailStu.name}</p>
                    {detailStu.school_type && detailStu.school_type !== 'none' && (
                      <span className="badge" style={{ background:SCHOOL_COLORS[detailStu.school_type as SchoolKey].bg, color:SCHOOL_COLORS[detailStu.school_type as SchoolKey].color }}>
                        {detailStu.school_type}학교
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize:12,color:tx3,margin:0 }}>{ageOf(detailStu.birth_year)}세 · {detailStu.birth_year}년생</p>
                </div>
              </div>
              <button onClick={() => setDetailStu(null)} style={{ width:28,height:28,borderRadius:'50%',border:'none',background:bg,cursor:'pointer',fontSize:17,color:tx2 }}>×</button>
            </div>

            <div style={{ padding:'18px 22px' }}>
              {/* 기본 정보 */}
              <div style={{ background:bg,borderRadius:10,padding:'14px 16px',marginBottom:14 }}>
                <p style={{ fontSize:11,fontWeight:700,color:tx3,letterSpacing:1,margin:'0 0 10px' }}>기본 정보</p>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
                  <div>
                    <p style={{ fontSize:11,color:tx3,margin:'0 0 2px' }}>출생연도</p>
                    <p style={{ fontSize:13,fontWeight:600,color:tx,margin:0 }}>{detailStu.birth_year}년생</p>
                  </div>
                  <div>
                    <p style={{ fontSize:11,color:tx3,margin:'0 0 2px' }}>등록일</p>
                    <p style={{ fontSize:13,fontWeight:600,color:tx,margin:0 }}>{detailStu.reg_date || '-'}</p>
                  </div>
                </div>
              </div>

              {/* 학교 정보 */}
              {detailStu.school_type !== 'none' && (
                <div style={{ background:bg,borderRadius:10,padding:'14px 16px',marginBottom:14 }}>
                  <p style={{ fontSize:11,fontWeight:700,color:tx3,letterSpacing:1,margin:'0 0 10px' }}>학교 정보</p>
                  {(() => {
                    const rows: { label: string; name: string; isCurrent: boolean; col: typeof SCHOOL_COLORS['초등'] }[] = []
                    if (detailStu.school_elementary)
                      rows.push({ label: '초등', name: detailStu.school_elementary, isCurrent: false, col: SCHOOL_COLORS['초등'] })
                    if (detailStu.school_middle)
                      rows.push({ label: '중학', name: detailStu.school_middle, isCurrent: false, col: SCHOOL_COLORS['중학'] })
                    if (detailStu.school) {
                      const curLabel = detailStu.school_type && detailStu.school_type !== 'none'
                        ? detailStu.school_type
                        : '학교'
                      const curCol = detailStu.school_type && detailStu.school_type !== 'none'
                        ? SCHOOL_COLORS[detailStu.school_type as SchoolKey]
                        : { bg: bg, color: tx2 }
                      rows.push({ label: curLabel, name: detailStu.school, isCurrent: true, col: curCol })
                    }
                    if (rows.length === 0) return <p style={{ fontSize:13,color:tx3,margin:0 }}>학교 정보 없음</p>
                    return (
                      <div>
                        {rows.map((r, i) => (
                          <div key={i} className="school-row">
                            <span className="badge" style={{ background:r.col.bg, color:r.col.color, flexShrink:0 }}>{r.label}</span>
                            <span style={{ fontSize:13,color:tx,fontWeight:r.isCurrent?600:400 }}>{r.name}</span>
                            {r.isCurrent && <span style={{ fontSize:11,color:gr,background:gbg,padding:'1px 6px',borderRadius:10 }}>현재</span>}
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* 소속 반 */}
              <div style={{ background:bg,borderRadius:10,padding:'14px 16px',marginBottom:14 }}>
                <p style={{ fontSize:11,fontWeight:700,color:tx3,letterSpacing:1,margin:'0 0 10px' }}>소속 반</p>
                {(() => {
                  const allCls = getStudentClasses(detailStu.id)
                  const activeCls   = allCls.filter(c => c.active !== false)
                  const inactiveCls = allCls.filter(c => c.active === false)
                  if (allCls.length === 0) return <p style={{ fontSize:13,color:tx3,margin:0 }}>소속 반 없음</p>
                  return (
                    <div>
                      {activeCls.length > 0 && (
                        <div style={{ marginBottom: inactiveCls.length > 0 ? 10 : 0 }}>
                          <p style={{ fontSize:11,color:gr,fontWeight:600,margin:'0 0 6px',display:'flex',alignItems:'center',gap:4 }}>
                            <span style={{ width:6,height:6,borderRadius:'50%',background:gr,display:'inline-block' }}/>
                            활성 반
                          </p>
                          <div style={{ display:'flex',gap:5,flexWrap:'wrap' }}>
                            {activeCls.map(cls => (
                              <span key={cls.id} className="badge" style={{ background:navyM,color:navy }}>{cls.name}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {inactiveCls.length > 0 && (
                        <div>
                          <p style={{ fontSize:11,color:tx3,fontWeight:600,margin:'0 0 6px',display:'flex',alignItems:'center',gap:4 }}>
                            <span style={{ width:6,height:6,borderRadius:'50%',background:tx3,display:'inline-block' }}/>
                            이전 반 (비활성)
                          </p>
                          <div style={{ display:'flex',gap:5,flexWrap:'wrap' }}>
                            {inactiveCls.map(cls => (
                              <span key={cls.id} className="badge" style={{ background:'#F0F0F0',color:tx3,border:`1px solid ${bd}` }}>{cls.name}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>

              {/* 연락처 (admin만) */}
              {canFull && (
                <div style={{ background:bg,borderRadius:10,padding:'14px 16px' }}>
                  <p style={{ fontSize:11,fontWeight:700,color:tx3,letterSpacing:1,margin:'0 0 10px' }}>연락처</p>
                  <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
                    <div>
                      <p style={{ fontSize:11,color:tx3,margin:'0 0 2px' }}>학생</p>
                      <p style={{ fontSize:13,fontWeight:600,color:tx,margin:0 }}>{fmtPhone(detailStu.phone)}</p>
                    </div>
                    <div>
                      <p style={{ fontSize:11,color:tx3,margin:'0 0 2px' }}>학부모</p>
                      <p style={{ fontSize:13,fontWeight:600,color:tx,margin:0 }}>{fmtPhone(detailStu.parent_phone)}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding:'0 22px 18px',display:'flex',gap:8,justifyContent:'flex-end' }}>
              {isAdmin && (
                <button className="bout" onClick={() => { setDetailStu(null); openEdit(detailStu) }}>수정</button>
              )}
              <button className="bgold" onClick={() => setDetailStu(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
