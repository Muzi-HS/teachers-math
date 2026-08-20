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
  school: string           // 현재(최상위) 학교 이름 - school_history 중 최상위 항목 캐시
  school_type: string | null   // 현재(최상위) 학교 구분 '초등' | '중등' | '고등' | null
  phone: string
  parent_phone: string
  reg_date: string
}

type Class = { id: number; name: string; active: boolean }

type SchoolEntry = { school_type: SchoolKey; school_name: string }

const BLANK: Omit<Student, 'id'> = {
  name: '', birth_year: kstNow().getFullYear() - 15,
  school: '', school_type: null,
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

const SCHOOL_TYPES = ['초등', '중등', '고등'] as const
type SchoolKey = typeof SCHOOL_TYPES[number]
const SCHOOL_RANK: Record<SchoolKey, number> = { '초등': 1, '중등': 2, '고등': 3 }
const SCHOOL_LABELS: Record<SchoolKey, string> = { '초등': '초등학교', '중등': '중학교', '고등': '고등학교' }
const SCHOOL_MIN_AGE: Record<SchoolKey, number> = { '초등': 8, '중등': 14, '고등': 17 }
const SCHOOL_COLORS: Record<SchoolKey | 'none', { bg: string; color: string }> = {
  '초등': { bg: gbg,   color: gr },
  '중등': { bg: navyM, color: navy },
  '고등': { bg: pubg,  color: pu },
  'none': { bg: bg,    color: tx3 },
}

function highestSchoolEntry(entries: SchoolEntry[]): SchoolEntry | null {
  if (entries.length === 0) return null
  return entries.reduce((a, b) => (SCHOOL_RANK[b.school_type] > SCHOOL_RANK[a.school_type] ? b : a))
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
  const [stageFlt, setStageFlt] = useState<SchoolKey | ''>('')
  const [clsFlt,   setClsFlt]   = useState('')
  const [notif,    setNotif]    = useState<{ msg: string; ok: boolean } | null>(null)
  const [noPhone,  setNoPhone]  = useState(false)
  const [detailStu,setDetailStu]= useState<Student | null>(null)
  const [ssMap,    setSsMap]    = useState<Record<number, SchoolEntry[]>>({})
  const [schoolElementary, setSchoolElementary] = useState('')
  const [schoolMiddle,     setSchoolMiddle]     = useState('')
  const [schoolHigh,       setSchoolHigh]       = useState('')
  const [noSchoolMap, setNoSchoolMap] = useState<Record<SchoolKey, boolean>>({ '초등': false, '중등': false, '고등': false })

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: s }, { data: c }, { data: cs }, { data: ss }] = await Promise.all([
      supabase.from('students').select('*').order('name'),
      supabase.from('classes').select('id, name, active').order('name'),
      supabase.from('class_students').select('student_id, class_id'),
      supabase.from('student_schools').select('student_id, school_type, school_name'),
    ])
    setStudents(s ?? [])
    setClasses((c ?? []).map(x => ({ ...x, active: x.active ?? true })))
    const map: Record<number, number[]> = {}
    for (const row of (cs ?? [])) {
      if (!map[row.student_id]) map[row.student_id] = []
      map[row.student_id].push(row.class_id)
    }
    setCsMap(map)
    const smap: Record<number, SchoolEntry[]> = {}
    for (const row of (ss ?? [])) {
      if (!smap[row.student_id]) smap[row.student_id] = []
      smap[row.student_id].push({ school_type: row.school_type, school_name: row.school_name })
    }
    setSsMap(smap)
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
    setSchoolElementary(''); setSchoolMiddle(''); setSchoolHigh('')
    setNoSchoolMap({ '초등': false, '중등': false, '고등': false })
    setNoPhone(false)
    setModal(true)
  }

  function openEdit(s: Student) {
    setEditId(s.id)
    setForm({
      name: s.name, birth_year: s.birth_year, school: s.school ?? '',
      school_type: s.school_type ?? null,
      phone: s.phone ?? '', parent_phone: s.parent_phone ?? '',
      reg_date: s.reg_date ?? kstDateStr(),
    })
    const entries = ssMap[s.id] ?? []
    setSchoolElementary(entries.find(e => e.school_type === '초등')?.school_name ?? '')
    setSchoolMiddle(entries.find(e => e.school_type === '중등')?.school_name ?? '')
    setSchoolHigh(entries.find(e => e.school_type === '고등')?.school_name ?? '')
    setNoSchoolMap({ '초등': false, '중등': false, '고등': false })
    setNoPhone(!s.phone)
    setModal(true)
  }

  async function save() {
    if (!form.name.trim())   return toast('이름을 입력하세요.', false)
    if (!form.birth_year)    return toast('출생연도를 입력하세요.', false)
    setSaving(true)

    const entries: SchoolEntry[] = ([
      (!noSchoolMap['초등'] && schoolElementary.trim()) ? { school_type: '초등' as SchoolKey, school_name: schoolElementary.trim() } : null,
      (!noSchoolMap['중등'] && schoolMiddle.trim())     ? { school_type: '중등' as SchoolKey, school_name: schoolMiddle.trim() } : null,
      (!noSchoolMap['고등'] && schoolHigh.trim())       ? { school_type: '고등' as SchoolKey, school_name: schoolHigh.trim() } : null,
    ].filter(Boolean) as SchoolEntry[])

    const current = highestSchoolEntry(entries)
    const row: Record<string, any> = {
      name: form.name.trim(),
      birth_year: Number(form.birth_year),
      school: current?.school_name ?? '',
      school_type: current?.school_type ?? null,
      phone: form.phone.trim(),
      parent_phone: form.parent_phone.trim(),
      reg_date: form.reg_date,
    }

    const isNew = !editId
    let studentId = editId
    if (editId) {
      const { error } = await supabase.from('students').update(row).eq('id', editId)
      if (error) { toast('수정 실패: ' + error.message, false); setSaving(false); return }
    } else {
      const { data, error } = await supabase.from('students').insert(row).select('id').single()
      if (error) { toast('등록 실패: ' + error.message, false); setSaving(false); return }
      studentId = data.id
    }

    await supabase.from('student_schools').delete().eq('student_id', studentId)
    if (entries.length > 0) {
      const { error: seErr } = await supabase.from('student_schools').insert(
        entries.map(e => ({ student_id: studentId, school_type: e.school_type, school_name: e.school_name }))
      )
      if (seErr) {
        // 새로 등록한 학생인데 학교 이력 저장에 실패하면 반쪽짜리(고아) 학생 레코드가 남지 않도록 롤백
        if (isNew) await supabase.from('students').delete().eq('id', studentId!)
        toast('학교 이력 저장 실패: ' + seErr.message, false); setSaving(false); return
      }
    }

    toast(form.name + (editId ? ' 수정됨' : ' 등록됨'))
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
  const formAge = form.birth_year ? ageOf(form.birth_year) : 0

  const filtered = students.filter(s => {
    const matchSearch = s.name.includes(search) || (s.school ?? '').includes(search)
    const matchAge    = ageFlt === '' || String(ageOf(s.birth_year)) === ageFlt
    const matchSchool = schoolFlt === '' || s.school === schoolFlt
    const matchStage  = stageFlt === '' || s.school_type === stageFlt
    const matchClass  = clsFlt === '' || (clsFlt === 'none' ? (csMap[s.id] ?? []).length === 0 : (csMap[s.id] ?? []).includes(Number(clsFlt)))
    return matchSearch && matchAge && matchSchool && matchStage && matchClass
  })

  const ageOptions    = [...new Set(students.map(s => ageOf(s.birth_year)))].sort((a, b) => a - b)
  const schoolOptions = [...new Set(students.map(s => s.school).filter(Boolean))].sort()
  const activeClasses = classes.filter(c => c.active !== false)
  const hasActiveFilter = search !== '' || ageFlt !== '' || schoolFlt !== '' || stageFlt !== '' || clsFlt !== ''

  function resetFilters() {
    setSearch(''); setAgeFlt(''); setSchoolFlt(''); setStageFlt(''); setClsFlt('')
  }

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
        .school-row{display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid ${bd};}
        .school-row:last-child{border-bottom:none;}
        .fgrp{display:flex;flex-direction:column;gap:6px;}
        .fgrp-lb{font-size:11px;font-weight:600;color:${tx3};letter-spacing:.3px;margin:0;}
        .pill{padding:6px 13px;border-radius:20px;font-size:12px;font-weight:500;cursor:pointer;border:1.5px solid ${bd};background:#fff;color:${tx2};font-family:inherit;transition:all .15s;white-space:nowrap;}
        .pill:hover{border-color:${navy};color:${navy};}
        .pill.active{border-color:transparent;font-weight:700;}
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
        {/* 검색 + 학교 드롭다운 */}
        <div style={{ display:'flex',gap:20,alignItems:'flex-end',marginBottom:12,flexWrap:'wrap' }}>
          <div className="sbox" style={{ maxWidth:320 }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={tx3}><circle cx="11" cy="11" r="8" strokeWidth={2}/><path strokeWidth={2} d="M21 21l-4.35-4.35"/></svg>
            <input placeholder="이름 또는 학교 검색..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="fgrp">
            <p className="fgrp-lb">학교</p>
            <select className="fsel" value={schoolFlt} onChange={e => setSchoolFlt(e.target.value)}>
              <option value="">전체 학교</option>
              {schoolOptions.map(sc => <option key={sc} value={sc}>{sc}</option>)}
            </select>
          </div>
          {hasActiveFilter && (
            <button type="button" className="pill" onClick={resetFilters} style={{ color:re, borderColor:'transparent', background:rbg }}>필터 초기화</button>
          )}
        </div>

        {/* 학교급 */}
        <div className="fgrp" style={{ marginBottom:14 }}>
          <p className="fgrp-lb">학교급</p>
          <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
            <button type="button" className={`pill${stageFlt === '' ? ' active' : ''}`}
              style={stageFlt === '' ? { background:navy, color:'#fff' } : undefined}
              onClick={() => setStageFlt('')}>전체</button>
            {SCHOOL_TYPES.map(type => {
              const active = stageFlt === type
              const col = SCHOOL_COLORS[type]
              return (
                <button key={type} type="button" className={`pill${active ? ' active' : ''}`}
                  style={active ? { background:col.bg, color:col.color, borderColor:col.color } : undefined}
                  onClick={() => setStageFlt(f => f === type ? '' : type)}>
                  {SCHOOL_LABELS[type]}
                </button>
              )
            })}
          </div>
        </div>

        {/* 나이 */}
        <div className="fgrp" style={{ marginBottom:14 }}>
          <p className="fgrp-lb">나이</p>
          <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
            <button type="button" className={`pill${ageFlt === '' ? ' active' : ''}`}
              style={ageFlt === '' ? { background:navy, color:'#fff' } : undefined}
              onClick={() => setAgeFlt('')}>전체</button>
            {ageOptions.map(age => {
              const active = ageFlt === String(age)
              return (
                <button key={age} type="button" className={`pill${active ? ' active' : ''}`}
                  style={active ? { background:navy, color:'#fff' } : undefined}
                  onClick={() => setAgeFlt(f => f === String(age) ? '' : String(age))}>
                  {age}세
                </button>
              )
            })}
          </div>
        </div>

        {/* 소속 반 (활성화된 반만) */}
        <div className="fgrp" style={{ marginBottom:18 }}>
          <p className="fgrp-lb">소속 반</p>
          <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
            <button type="button" className={`pill${clsFlt === '' ? ' active' : ''}`}
              style={clsFlt === '' ? { background:navy, color:'#fff' } : undefined}
              onClick={() => setClsFlt('')}>전체</button>
            <button type="button" className={`pill${clsFlt === 'none' ? ' active' : ''}`}
              style={clsFlt === 'none' ? { background:tx3, color:'#fff' } : undefined}
              onClick={() => setClsFlt(f => f === 'none' ? '' : 'none')}>미배정</button>
            {activeClasses.map(c => {
              const active = clsFlt === String(c.id)
              return (
                <button key={c.id} type="button" className={`pill${active ? ' active' : ''}`}
                  style={active ? { background:gbg, color:gr, borderColor:gr } : undefined}
                  onClick={() => setClsFlt(f => f === String(c.id) ? '' : String(c.id))}>
                  {c.name}
                </button>
              )
            })}
          </div>
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
                  const stColor = s.school_type ? (SCHOOL_COLORS[s.school_type as SchoolKey] ?? SCHOOL_COLORS['none']) : null
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
                                return cls ? <span key={cid} className="badge" style={{ background:gbg,color:gr }}>{cls.name}</span> : null
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
                    onChange={e => setForm(f => ({...f, birth_year:Number(e.target.value)}))}
                    placeholder="예) 2011"/>
                </div>
              </div>

              {/* 학교 정보 */}
              <div style={{ marginBottom:14 }}>
                <label className="lb">학교 정보 <span style={{ fontWeight:400,color:tx3 }}>(나이에 맞는 항목만 입력 가능)</span></label>
                <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                  {SCHOOL_TYPES.map(type => {
                    const ageOk = formAge >= SCHOOL_MIN_AGE[type]
                    const noInfo = noSchoolMap[type]
                    const enabled = ageOk && !noInfo
                    const val    = type === '초등' ? schoolElementary : type === '중등' ? schoolMiddle : schoolHigh
                    const setVal = type === '초등' ? setSchoolElementary : type === '중등' ? setSchoolMiddle : setSchoolHigh
                    const col = SCHOOL_COLORS[type]
                    return (
                      <div key={type} style={{ display:'flex',alignItems:'center',gap:8 }}>
                        <span className="badge" style={{ background:enabled?col.bg:bg, color:enabled?col.color:tx3, flexShrink:0, width:52, justifyContent:'center' }}>
                          {SCHOOL_LABELS[type]}
                        </span>
                        <input className="fi" value={val} disabled={!enabled}
                          onChange={e => setVal(e.target.value)}
                          placeholder={!ageOk ? '나이에 맞지 않아 입력할 수 없습니다' : noInfo ? '정보 없음으로 표시됨' : `${SCHOOL_LABELS[type]} 이름 (예: 강남${SCHOOL_LABELS[type]})`}
                          style={{ flex:1, opacity:enabled?1:0.5, background:enabled?'#fff':bg }}
                        />
                        <label style={{ display:'flex',alignItems:'center',gap:4,fontSize:11,flexShrink:0,cursor:ageOk?'pointer':'default',color:noInfo?re:tx3,opacity:ageOk?1:0.4 }}>
                          <input type="checkbox" checked={noInfo} disabled={!ageOk}
                            onChange={e => {
                              const checked = e.target.checked
                              setNoSchoolMap(m => ({ ...m, [type]: checked }))
                              if (checked) setVal('')
                            }}
                            style={{ cursor:'pointer' }}
                          />
                          정보없음
                        </label>
                      </div>
                    )
                  })}
                </div>
              </div>

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
                      <span className="badge" style={{ background: (SCHOOL_COLORS[detailStu.school_type as SchoolKey] ?? SCHOOL_COLORS['none']).bg, color: (SCHOOL_COLORS[detailStu.school_type as SchoolKey] ?? SCHOOL_COLORS['none']).color }}>
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
              <div style={{ background:bg,borderRadius:10,padding:'14px 16px',marginBottom:14 }}>
                <p style={{ fontSize:11,fontWeight:700,color:tx3,letterSpacing:1,margin:'0 0 10px' }}>학교 정보</p>
                {(() => {
                  const entries = ssMap[detailStu.id] ?? []
                  if (entries.length === 0) return <p style={{ fontSize:13,color:tx3,margin:0 }}>학교 정보 없음</p>
                  const current = highestSchoolEntry(entries)
                  const sorted = [...entries].sort((a, b) => SCHOOL_RANK[b.school_type] - SCHOOL_RANK[a.school_type])
                  return (
                    <div>
                      {sorted.map((e, i) => {
                        const col = SCHOOL_COLORS[e.school_type] ?? SCHOOL_COLORS['none']
                        const isCurrent = e === current
                        return (
                          <div key={i} className="school-row">
                            <span className="badge" style={{ background:col.bg, color:col.color, flexShrink:0 }}>{e.school_type}</span>
                            <span style={{ fontSize:13,color:tx,fontWeight:isCurrent?600:400 }}>{e.school_name}</span>
                            {isCurrent && <span style={{ fontSize:11,color:gr,background:gbg,padding:'1px 6px',borderRadius:10 }}>현재</span>}
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>

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
                              <span key={cls.id} className="badge" style={{ background:gbg,color:gr }}>{cls.name}</span>
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
