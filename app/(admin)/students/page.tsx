'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { can } from '@/lib/permissions'

type Student = {
  id: number
  name: string
  birth_year: number
  school: string
  phone: string
  parent_phone: string
  reg_date: string
}

type Class = { id: number; name: string }

const BLANK: Omit<Student, 'id'> = {
  name: '', birth_year: new Date().getFullYear() - 15,
  school: '', phone: '', parent_phone: '',
  reg_date: new Date().toISOString().split('T')[0],
}

const navy = '#0D2A5E', navyDk = '#071A3E', navyM = '#E8EEF8'
const gold = '#D87E13', goldL = '#F09830'
const bg = '#F5F7FA', bd = '#DDE3EE'
const tx = '#0D1B36', tx2 = '#4B5C7E', tx3 = '#96A4BF'
const re = '#C0392B', rbg = '#FDECEA'
const gr = '#1A7F4E', gbg = '#E0F5EB'

export default function StudentsPage() {
  const { teacher, role } = useAuth()
  const [students, setStudents] = useState<Student[]>([])
  const [classes,  setClasses]  = useState<Class[]>([])
  const [csMap,    setCsMap]    = useState<Record<number, number>>({}) // student_id → class_id
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState(false)
  const [form,     setForm]     = useState({ ...BLANK })
  const [editId,   setEditId]   = useState<number | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [search,   setSearch]   = useState('')
  const [ageFlt,   setAgeFlt]   = useState('')
  const [schoolFlt,setSchoolFlt]= useState('')
  const [notif,    setNotif]    = useState<{ msg: string; ok: boolean } | null>(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: s }, { data: c }, { data: cs }] = await Promise.all([
      supabase.from('students').select('*').order('name'),
      supabase.from('classes').select('id, name').order('name'),
      supabase.from('class_students').select('student_id, class_id'),
    ])
    setStudents(s ?? [])
    setClasses(c ?? [])
    // student_id → class_id 맵
    const map: Record<number, number> = {}
    for (const row of (cs ?? [])) map[row.student_id] = row.class_id
    setCsMap(map)
    setLoading(false)
  }

  function toast(msg: string, ok = true) {
    setNotif({ msg, ok })
    setTimeout(() => setNotif(null), 3000)
  }

  function ageOf(birth: number) {
    return new Date().getFullYear() - birth + 1
  }

  // 전화번호 표시용 포맷 (01012341234 → 010-1234-1234)
  function fmtPhone(p: string) {
    if (!p) return '-'
    const n = p.replace(/-/g, '')
    return n.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3') || p
  }

  const [noPhone, setNoPhone] = useState(false)

  function openAdd() {
    setEditId(null)
    setForm({ ...BLANK })
    setNoPhone(false)
    setModal(true)
  }

  function openEdit(s: Student) {
    setEditId(s.id)
    setForm({
      name: s.name, birth_year: s.birth_year, school: s.school,
      phone: s.phone ?? '', parent_phone: s.parent_phone ?? '',
      reg_date: s.reg_date ?? new Date().toISOString().split('T')[0],
    })
    setNoPhone(!s.phone)
    setModal(true)
  }

  async function save() {
    if (!form.name.trim())   return toast('이름을 입력하세요.', false)
    if (!form.birth_year)    return toast('출생연도를 입력하세요.', false)
    setSaving(true)
    const row = {
      name: form.name.trim(),
      birth_year: Number(form.birth_year),
      school: form.school.trim(),
      phone: form.phone.trim(),
      parent_phone: form.parent_phone.trim(),
      reg_date: form.reg_date,
    }
    if (editId) {
      const { error } = await supabase.from('students').update(row).eq('id', editId)
      if (error) { toast('수정 실패: ' + error.message, false); setSaving(false); return }
      toast(form.name + ' 수정됨')
    } else {
      const { error } = await supabase.from('students').insert(row)
      if (error) { toast('등록 실패: ' + error.message, false); setSaving(false); return }
      toast(form.name + ' 등록됨')
    }
    setSaving(false); setModal(false)
    await fetchAll()
  }

  async function remove(id: number, name: string) {
    if (!confirm(`${name} 학생을 삭제하시겠습니까?`)) return

    // 삭제 전에 이 학생과 연결된 학부모 확인
    const { data: ps } = await supabase
      .from('parent_students')
      .select('parent_id')
      .eq('student_id', id)

    const parentIds = [...new Set((ps ?? []).map((r: any) => r.parent_id))]

    // 학생 삭제 (parent_students는 CASCADE로 자동 삭제됨)
    const { error } = await supabase.from('students').delete().eq('id', id)
    if (error) return toast('삭제 실패: ' + error.message, false)

    // 연결된 학부모 중 이제 자녀가 0명인 경우 학부모 데이터도 삭제
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

  // 권한에 따라 보여줄 필드 결정
  const isAdmin   = role === 'admin'
  const isTeacher = role === 'teacher'
  const canFull   = can.viewFullStudent(role!)   // admin만 전체 열람

  // 필터링
  const filtered = students.filter(s => {
    const matchSearch = s.name.includes(search) || s.school.includes(search)
    const matchAge    = ageFlt === '' || String(ageOf(s.birth_year)) === ageFlt
    const matchSchool = schoolFlt === '' || s.school === schoolFlt
    return matchSearch && matchAge && matchSchool
  })

  // 필터 옵션 목록 (등록된 학생 기준 자동 추출)
  const ageOptions    = [...new Set(students.map(s => ageOf(s.birth_year)))].sort((a, b) => a - b)
  const schoolOptions = [...new Set(students.map(s => s.school).filter(Boolean))].sort()

  return (
    <div style={{ padding: '28px 32px', fontFamily: "'Noto Sans KR',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
        table{width:100%;border-collapse:collapse;}
        th{padding:9px 12px;text-align:left;font-size:11px;font-weight:600;color:${tx3};letter-spacing:.5px;background:${bg};border-bottom:1px solid ${bd};}
        td{padding:11px 12px;border-bottom:1px solid ${bd};font-size:13px;color:${tx};}
        tr:last-child td{border-bottom:none;}
        tr:hover td{background:${navyM};}
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
      `}</style>

      {/* 토스트 */}
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
        {/* 상단 필터 */}
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16 }}>
          <span style={{ fontSize:14,fontWeight:600,color:tx }}>
            전체 학생 <span style={{ fontSize:12,color:tx3,fontWeight:400 }}>{filtered.length}명</span>
          </span>
        </div>
        <div style={{ display:'flex',gap:9,alignItems:'center',marginBottom:18,flexWrap:'wrap' }}>
          <div className="sbox">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={tx3}><circle cx="11" cy="11" r="8" strokeWidth={2}/><path strokeWidth={2} d="M21 21l-4.35-4.35"/></svg>
            <input
              placeholder="이름 또는 학교 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
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

        {/* 테이블 */}
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
                  <th>출생연도</th>
                  <th>나이</th>
                  <th>학교</th>
                  {/* admin만 연락처 열람 */}
                  {canFull && <th>학생 연락처</th>}
                  {canFull && <th>학부모 연락처</th>}
                  <th>소속 반</th>
                  <th>등록일</th>
                  {isAdmin && <th>관리</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const cls = classes.find(c => c.id === csMap[s.id])
                  return (
                    <tr key={s.id}>
                      <td>
                        <span style={{ fontWeight:600 }}>{s.name}</span>
                      </td>
                      <td style={{ color:tx2 }}>{s.birth_year}년</td>
                      <td style={{ color:tx2 }}>{ageOf(s.birth_year)}세</td>
                      <td style={{ color:tx2 }}>{s.school || '-'}</td>
                      {canFull && <td style={{ color:tx2 }}>{fmtPhone(s.phone)}</td>}
                      {canFull && <td style={{ color:tx2 }}>{fmtPhone(s.parent_phone)}</td>}
                      <td>
                        {cls
                          ? <span className="badge" style={{ background:navyM,color:navy }}>{cls.name}</span>
                          : <span style={{ color:tx3,fontSize:12 }}>미배정</span>
                        }
                      </td>
                      <td style={{ color:tx3,fontSize:12 }}>{s.reg_date ?? '-'}</td>
                      {isAdmin && (
                        <td>
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

      {/* 등록/수정 모달 */}
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
                  <input type="number" className="fi" value={form.birth_year} onChange={e => setForm(f => ({...f, birth_year:Number(e.target.value)}))} placeholder="예) 2011"/>
                </div>
              </div>

              {/* 학교 */}
              <div style={{ marginBottom:14 }}>
                <label className="lb">학교</label>
                <input className="fi" value={form.school} onChange={e => setForm(f => ({...f, school:e.target.value}))} placeholder="예) 강남중학교"/>
              </div>

              {/* 연락처 */}
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14 }}>
                <div>
                  <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:5 }}>
                    <label className="lb" style={{ margin:0 }}>학생 전화번호</label>
                    <label style={{ display:'flex',alignItems:'center',gap:5,fontSize:11,cursor:'pointer',color:noPhone?re:tx3 }}>
                      <input
                        type="checkbox"
                        checked={noPhone}
                        onChange={e => {
                          setNoPhone(e.target.checked)
                          if (e.target.checked) setForm(f => ({...f, phone:''}))
                        }}
                        style={{ cursor:'pointer' }}
                      />
                      번호 없음
                    </label>
                  </div>
                  <input
                    className="fi"
                    value={noPhone ? '' : form.phone}
                    disabled={noPhone}
                    onChange={e => setForm(f => ({...f, phone: e.target.value.replace(/-/g,'')}))}
                    placeholder="01000000000"
                    style={{ opacity: noPhone ? 0.4 : 1, background: noPhone ? bg : '#fff' }}
                  />
                  {!noPhone && form.phone && !/^\d{10,11}$/.test(form.phone) && (
                    <p style={{ fontSize:11,color:re,marginTop:4 }}>하이픈(-) 없이 숫자만 입력하세요</p>
                  )}
                </div>
                <div>
                  <label className="lb">학부모 전화번호</label>
                  <input
                    className="fi"
                    value={form.parent_phone}
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

              {/* 학부모 계정 안내 */}
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
    </div>
  )
}