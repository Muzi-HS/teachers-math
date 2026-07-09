'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const navy='#0D2A5E', navyDk='#071A3E', navyM='#E8EEF8'
const gold='#D87E13', bg='#F5F7FA', bd='#DDE3EE'
const tx='#0D1B36', tx2='#4B5C7E', tx3='#96A4BF'
const re='#C0392B', rbg='#FDECEA', gr='#1A7F4E', gbg='#E0F5EB'

type Teacher = {
  id: number; user_id: string; name: string; email: string
  phone: string; role: string; approved: boolean; created_at: string
}
type AttLog = {
  id: number; teacher_id: string; date: string
  clock_in: string | null; clock_out: string | null; work_minutes: number | null; memo: string
}

const MONTHS = Array.from({length:12},(_,i)=>i+1)

function fmtPhone(p:string){
  if(!p) return '-'
  const n=p.replace(/-/g,'')
  return n.replace(/(\d{3})(\d{4})(\d{4})/,'$1-$2-$3')||p
}
function fmtTime(t:string|null){return t?t.slice(0,5):'-'}
function fmtHours(m:number|null){
  if(m==null) return '-'
  const h=Math.floor(m/60), min=m%60
  return min>0?`${h}시간 ${min}분`:`${h}시간`
}

export default function TeachersPage(){
  const [tabIdx,    setTabIdx]    = useState(0)
  const [teachers,  setTeachers]  = useState<Teacher[]>([])
  const [attLogs,   setAttLogs]   = useState<AttLog[]>([])
  const [loading,   setLoading]   = useState(true)
  const [selYear,   setSelYear]   = useState(new Date().getFullYear())
  const [selMonth,  setSelMonth]  = useState(new Date().getMonth()+1)
  const [selTeacher,setSelTeacher]= useState<Teacher|null>(null)
  const [notif,     setNotif]     = useState<{msg:string;ok:boolean}|null>(null)

  useEffect(()=>{ fetchTeachers() },[])
  useEffect(()=>{ if(tabIdx===1) fetchAtt() },[tabIdx,selYear,selMonth])

  async function fetchTeachers(){
    setLoading(true)
    const {data}=await supabase.from('teachers').select('*').order('created_at')
    setTeachers(data??[])
    setLoading(false)
  }

  async function fetchAtt(){
    setLoading(true)
    const from=`${selYear}-${String(selMonth).padStart(2,'0')}-01`
    const to=`${selYear}-${String(selMonth).padStart(2,'0')}-31`
    const {data}=await supabase.from('attendance_log')
      .select('*').gte('date',from).lte('date',to).order('date')
    setAttLogs(data??[])
    setLoading(false)
  }

  function toast(msg:string,ok=true){setNotif({msg,ok});setTimeout(()=>setNotif(null),3000)}

  async function toggleApprove(t:Teacher){
    const {error}=await supabase.from('teachers').update({approved:!t.approved}).eq('id',t.id)
    if(error) return toast('수정 실패',false)
    toast(t.approved?`${t.name} 승인 취소됨`:`${t.name} 승인됨`, !t.approved)
    fetchTeachers()
  }

  async function changeRole(t:Teacher,role:string){
    const {error}=await supabase.from('teachers').update({role}).eq('id',t.id)
    if(error) return toast('역할 변경 실패',false)
    toast(`${t.name} 역할이 ${role==='admin'?'관리자':'선생님'}으로 변경됨`)
    fetchTeachers()
  }

  async function deleteTeacher(t:Teacher){
    if(!confirm(`${t.name} 선생님을 삭제하시겠습니까?`)) return
    await supabase.auth.admin.deleteUser(t.user_id).catch(()=>{})
    const {error}=await supabase.from('teachers').delete().eq('id',t.id)
    if(error) return toast('삭제 실패',false)
    toast(t.name+' 삭제됨',false)
    fetchTeachers()
  }

  // 출근부 집계: teacher_id별 합산
  const attSummary = teachers
    .filter(t=>t.approved)
    .map(t=>{
      const logs=attLogs.filter(a=>a.teacher_id===t.user_id)
      const days=logs.length
      const totalMin=logs.reduce((s,a)=>s+(a.work_minutes??0),0)
      return {teacher:t, days, totalMin, logs}
    })

  // 선택된 선생님 일별 로그
  const selLogs=selTeacher
    ? attLogs.filter(a=>a.teacher_id===selTeacher.user_id)
    : []

  const css=`
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
    table{width:100%;border-collapse:collapse;}
    th{padding:9px 12px;text-align:left;font-size:11px;font-weight:600;color:${tx3};background:${bg};border-bottom:1px solid ${bd};}
    td{padding:11px 12px;border-bottom:1px solid ${bd};font-size:13px;color:${tx};}
    tr:last-child td{border-bottom:none;}
    tr:hover td{background:${navyM};}
    .bgold{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:none;background:${gold};color:${navyDk};font-family:inherit;}
    .bout{display:inline-flex;align-items:center;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;border:1px solid ${bd};background:transparent;color:${tx2};font-family:inherit;}
    .bout:hover{border-color:${navy};color:${navy};}
    .bdng{display:inline-flex;align-items:center;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;border:none;background:${rbg};color:${re};font-family:inherit;}
    .bapv{display:inline-flex;align-items:center;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;border:none;background:${gbg};color:${gr};font-family:inherit;}
    .fsel{padding:7px 11px;border:1px solid ${bd};border-radius:8px;font-size:12px;font-family:inherit;color:${tx2};background:#fff;outline:none;cursor:pointer;}
    .tab-btn{padding:8px 20px;border:none;background:none;cursor:pointer;font-size:14px;font-family:inherit;color:${tx3};border-bottom:2.5px solid transparent;transition:all .15s;}
    .tab-btn.active{color:${navy};font-weight:700;border-bottom-color:${navy};}
  `

  return(
    <div style={{padding:'28px 32px',fontFamily:"'Noto Sans KR',sans-serif"}}>
      <style>{css}</style>

      {notif&&(
        <div style={{position:'fixed',top:18,right:18,zIndex:9999,background:'#fff',borderRadius:8,padding:'11px 14px',borderLeft:`4px solid ${notif.ok?gr:re}`,boxShadow:'0 4px 18px rgba(0,0,0,.1)',minWidth:200}}>
          <div style={{fontWeight:600,marginBottom:2,color:tx,fontSize:13}}>{notif.ok?'완료':'알림'}</div>
          <div style={{fontSize:12,color:tx2}}>{notif.msg}</div>
        </div>
      )}

      <div style={{marginBottom:20}}>
        <h1 style={{fontSize:21,fontWeight:700,color:tx}}>선생님 관리</h1>
        <p style={{fontSize:13,color:tx2,marginTop:4}}>선생님 승인, 역할 변경, 출근 현황을 관리합니다</p>
      </div>

      {/* 탭 */}
      <div style={{borderBottom:`1px solid ${bd}`,marginBottom:20,display:'flex',gap:4}}>
        {['선생님 목록','출근부'].map((t,i)=>(
          <button key={i} className={`tab-btn${tabIdx===i?' active':''}`} onClick={()=>{setTabIdx(i);setSelTeacher(null)}}>
            {t}
          </button>
        ))}
      </div>

      {/* ── 탭 1: 선생님 목록 ── */}
      {tabIdx===0&&(
        <div style={{background:'#fff',borderRadius:12,border:`1px solid ${bd}`,boxShadow:'0 1px 4px rgba(0,0,0,.06)',overflow:'hidden'}}>
          {loading?(
            <p style={{padding:24,color:tx3}}>불러오는 중...</p>
          ):(
            <table>
              <thead>
                <tr>
                  <th>이름</th>
                  <th>이메일</th>
                  <th>연락처</th>
                  <th>역할</th>
                  <th>승인 상태</th>
                  <th>가입일</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map(t=>(
                  <tr key={t.id}>
                    <td style={{fontWeight:600}}>{t.name}</td>
                    <td style={{color:tx2}}>{t.email}</td>
                    <td style={{color:tx2}}>{fmtPhone(t.phone)}</td>
                    <td>
                      <select className="fsel" value={t.role} onChange={e=>changeRole(t,e.target.value)}
                        style={{padding:'3px 8px',fontSize:11}}>
                        <option value="teacher">선생님</option>
                        <option value="admin">관리자</option>
                      </select>
                    </td>
                    <td>
                      {t.approved
                        ? <span style={{background:gbg,color:gr,fontSize:11,fontWeight:600,padding:'3px 9px',borderRadius:20}}>승인됨</span>
                        : <span style={{background:rbg,color:re,fontSize:11,fontWeight:600,padding:'3px 9px',borderRadius:20}}>대기중</span>
                      }
                    </td>
                    <td style={{color:tx3,fontSize:12}}>{t.created_at.slice(0,10)}</td>
                    <td>
                      <div style={{display:'flex',gap:6}}>
                        <button className={t.approved?'bdng':'bapv'} onClick={()=>toggleApprove(t)}>
                          {t.approved?'승인 취소':'승인'}
                        </button>
                        <button className="bdng" onClick={()=>deleteTeacher(t)}>삭제</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── 탭 2: 출근부 ── */}
      {tabIdx===1&&(
        <>
          {/* 월 선택 */}
          <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:16}}>
            <select className="fsel" value={selYear} onChange={e=>setSelYear(Number(e.target.value))}>
              {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}년</option>)}
            </select>
            <select className="fsel" value={selMonth} onChange={e=>setSelMonth(Number(e.target.value))}>
              {MONTHS.map(m=><option key={m} value={m}>{m}월</option>)}
            </select>
            <span style={{fontSize:13,color:tx3}}>{selYear}년 {selMonth}월 출근 현황</span>
          </div>

          <div style={{display:'grid',gridTemplateColumns:selTeacher?'1fr 1fr':'1fr',gap:16}}>

            {/* 선생님별 집계 */}
            <div style={{background:'#fff',borderRadius:12,border:`1px solid ${bd}`,boxShadow:'0 1px 4px rgba(0,0,0,.06)',overflow:'hidden'}}>
              <table>
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>출근일수</th>
                    <th>총 근무시간</th>
                  </tr>
                </thead>
                <tbody>
                  {attSummary.map(({teacher:t,days,totalMin})=>(
                    <tr key={t.id} onClick={()=>setSelTeacher(selTeacher?.id===t.id?null:t)}
                      style={{cursor:'pointer',background:selTeacher?.id===t.id?navyM:''}}>
                      <td style={{fontWeight:600}}>{t.name}</td>
                      <td style={{color:days>0?navy:tx3}}>{days}일</td>
                      <td style={{color:totalMin>0?navy:tx3}}>{fmtHours(totalMin||null)}</td>
                    </tr>
                  ))}
                  {attSummary.length===0&&(
                    <tr><td colSpan={3} style={{textAlign:'center',color:tx3,padding:'30px 0'}}>출근 기록이 없습니다</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 선택된 선생님 일별 상세 */}
            {selTeacher&&(
              <div style={{background:'#fff',borderRadius:12,border:`1px solid ${bd}`,boxShadow:'0 1px 4px rgba(0,0,0,.06)',overflow:'hidden'}}>
                <div style={{padding:'12px 16px',borderBottom:`1px solid ${bd}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <span style={{fontSize:13,fontWeight:700,color:tx}}>{selTeacher.name} — 일별 상세</span>
                  <button onClick={()=>setSelTeacher(null)} style={{background:'none',border:'none',cursor:'pointer',color:tx3,fontSize:16}}>×</button>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>날짜</th>
                      <th>출근</th>
                      <th>퇴근</th>
                      <th>근무시간</th>
                      <th>메모</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selLogs.length===0?(
                      <tr><td colSpan={5} style={{textAlign:'center',color:tx3,padding:'30px 0'}}>기록 없음</td></tr>
                    ):selLogs.map(l=>(
                      <tr key={l.id}>
                        <td style={{color:tx2}}>{l.date}</td>
                        <td style={{color:gr,fontWeight:500}}>{fmtTime(l.clock_in)}</td>
                        <td style={{color:re,fontWeight:500}}>{fmtTime(l.clock_out)}</td>
                        <td style={{color:navy,fontWeight:600}}>{fmtHours(l.work_minutes)}</td>
                        <td style={{color:tx3,fontSize:12}}>{l.memo||'-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

    </div>
  )
}
