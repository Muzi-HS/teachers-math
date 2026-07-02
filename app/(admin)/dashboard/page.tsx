'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

type Class_   = { id:number; name:string; days:string; time:string }
type Student  = { id:number; name:string }

const navy='#0D2A5E', navyDk='#071A3E', navyM='#E8EEF8'
const gold='#D87E13', goldL='#F09830'
const bd='#DDE3EE'
const tx='#0D1B36', tx2='#4B5C7E', tx3='#96A4BF'
const re='#C0392B'

const DOW = ['일','월','화','수','목','금','토']

export default function DashboardPage(){
  const router = useRouter()
  const { teacher } = useAuth()

  const [classes,    setClasses]    = useState<Class_[]>([])
  const [csMap,      setCsMap]      = useState<Record<number, number[]>>({}) // class_id -> student_ids
  const [students,   setStudents]   = useState<Student[]>([])
  const [unsentRecs, setUnsentRecs] = useState<{ id:number; student_id:number; date:string; sms_sent:boolean }[]>([])
  const [loading,    setLoading]    = useState(true)

  useEffect(()=>{ fetchAll() },[])

  async function fetchAll(){
    setLoading(true)
    const [{ data:cls },{ data:cs },{ data:stu },{ data:unsent }] = await Promise.all([
      supabase.from('classes').select('id,name,days,time').order('name'),
      supabase.from('class_students').select('class_id,student_id'),
      supabase.from('students').select('id,name'),
      supabase.from('records').select('id,student_id,date,sms_sent').eq('sms_sent',false).eq('is_draft',false).order('date',{ascending:false}).limit(10),
    ])
    setClasses(cls??[])
    const map:Record<number,number[]>={}
    for(const r of (cs??[])) {
      if(!map[r.class_id]) map[r.class_id]=[]
      map[r.class_id].push(r.student_id)
    }
    setCsMap(map)
    setStudents(stu??[])
    setUnsentRecs(unsent??[])
    setLoading(false)
  }

  // 오늘 요일에 해당하는 반만 필터링
  const todayDow = DOW[new Date().getDay()]
  const todayClasses = classes.filter(c => (c.days??'').includes(todayDow))

  function goToClassDetail(classId: number){
    // 반관리 페이지로 이동 + 해당 반 상세(학생목록) 화면 자동 오픈
    router.push(`/classes?openDetail=${classId}`)
  }

  function goToRecordsMenu(){
    router.push('/records')
  }

  const studentNameOf = (sid:number) => students.find(s=>s.id===sid)?.name ?? '알 수 없음'

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;900&display=swap');
    .mc{background:#fff;border-radius:12px;padding:14px 16px;border:1px solid ${bd};}
    .schedule-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid ${bd};}
    .schedule-row:last-child{border-bottom:none;}
    .badge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;}
    .bgold{display:inline-flex;align-items:center;gap:6px;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:none;background:${gold};color:${navyDk};font-family:inherit;}
    .bgold:hover{background:${goldL};}
    .bsm{display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;border:none;font-family:inherit;}
    .bav{width:26px;height:26px;border-radius:50%;background:${navyM};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:${navy};flex-shrink:0;}
  `

  return (
    <div style={{ padding: '28px 32px', fontFamily: "'Noto Sans KR',sans-serif" }}>
      <style>{css}</style>

      {/* 헤더 */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 20 }}>
        <div>
          <p style={{ fontSize: 20, fontWeight: 700, color: tx, margin: 0 }}>
            안녕하세요, {teacher?.name ?? '선생님'}님 👋
          </p>
          <p style={{ fontSize: 13, color: tx2, margin: '4px 0 0' }}>
            {new Date().toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric', weekday:'long' })}
            {' · '}오늘 수업 {todayClasses.length}개 예정
          </p>
        </div>
      </div>

      {/* 상단 요약 4칸 */}
      <div style={{ display:'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        <div className="mc">
          <p style={{ fontSize: 11, color: tx3, margin: '0 0 6px' }}>오늘 수업</p>
          <p style={{ fontSize: 24, fontWeight: 700, color: navy, margin: 0 }}>
            {todayClasses.length}<span style={{ fontSize: 13, fontWeight: 400, color: tx2 }}>개 반</span>
          </p>
        </div>
        <div className="mc">
          <p style={{ fontSize: 11, color: tx3, margin: '0 0 6px' }}>전체 반</p>
          <p style={{ fontSize: 24, fontWeight: 700, color: navy, margin: 0 }}>
            {classes.length}<span style={{ fontSize: 13, fontWeight: 400, color: tx2 }}>개</span>
          </p>
        </div>
        <div className="mc">
          <p style={{ fontSize: 11, color: tx3, margin: '0 0 6px' }}>전체 학생</p>
          <p style={{ fontSize: 24, fontWeight: 700, color: navy, margin: 0 }}>
            {students.length}<span style={{ fontSize: 13, fontWeight: 400, color: tx2 }}>명</span>
          </p>
        </div>
        <div className="mc" style={{ borderColor: unsentRecs.length > 0 ? re + '55' : bd, borderWidth: unsentRecs.length > 0 ? 1.5 : 1 }}>
          <p style={{ fontSize: 11, color: unsentRecs.length > 0 ? re : tx3, fontWeight: unsentRecs.length > 0 ? 600 : 400, margin: '0 0 6px' }}>미발송 알림</p>
          <p style={{ fontSize: 24, fontWeight: 700, color: unsentRecs.length > 0 ? re : tx, margin: 0 }}>
            {unsentRecs.length}<span style={{ fontSize: 13, fontWeight: 400 }}>건</span>
          </p>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16 }}>

        {/* 좌측: 오늘 수업 일정 */}
        <div className="mc">
          <p style={{ fontSize: 13, fontWeight: 700, color: tx, margin: '0 0 4px' }}>📅 오늘 수업 일정</p>
          {loading ? (
            <p style={{ fontSize: 13, color: tx3, padding: '20px 0', textAlign: 'center' }}>불러오는 중...</p>
          ) : todayClasses.length === 0 ? (
            <p style={{ fontSize: 13, color: tx3, padding: '24px 0', textAlign: 'center' }}>오늘 예정된 수업이 없습니다</p>
          ) : todayClasses.map(c => {
            const stuCnt = (csMap[c.id] ?? []).length
            return (
              <div key={c.id} className="schedule-row" style={{ cursor: 'pointer' }} onClick={() => goToClassDetail(c.id)}>
                <div style={{ width: 4, height: 36, background: navy, borderRadius: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: tx, margin: 0 }}>{c.name}</p>
                  <p style={{ fontSize: 11, color: tx3, margin: 0 }}>{c.time || '시간 미정'} · 학생 {stuCnt}명</p>
                </div>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={tx3}><path strokeWidth={2} d="M9 18l6-6-6-6"/></svg>
              </div>
            )
          })}
        </div>

        {/* 우측: 미발송 문자 알림 */}
        <div className="mc">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: unsentRecs.length>0?re:tx, margin: 0 }}>✉️ 미발송 문자 알림</p>
            {unsentRecs.length > 0 && (
              <span style={{ fontSize: 12, color: navy, fontWeight: 600, cursor: 'pointer' }} onClick={goToRecordsMenu}>
                수업기록에서 발송 →
              </span>
            )}
          </div>
          {loading ? (
            <p style={{ fontSize: 13, color: tx3, padding: '20px 0', textAlign: 'center' }}>불러오는 중...</p>
          ) : unsentRecs.length === 0 ? (
            <p style={{ fontSize: 13, color: tx3, padding: '20px 0', textAlign: 'center' }}>미발송 알림이 없습니다 🎉</p>
          ) : (
            <>
              {unsentRecs.slice(0, 5).map(r => (
                <div key={r.id} style={{ display:'flex', alignItems:'center', gap: 8, padding: '6px 0' }}>
                  <div className="bav">{studentNameOf(r.student_id)[0]}</div>
                  <span style={{ fontSize: 12, color: tx, flex: 1 }}>
                    {studentNameOf(r.student_id)} · {r.date} 수업
                  </span>
                </div>
              ))}
              {unsentRecs.length > 5 && (
                <p style={{ fontSize: 11, color: tx3, margin: '6px 0 0' }}>외 {unsentRecs.length - 5}명 더보기</p>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  )
}
