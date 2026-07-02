'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

const navy='#0D2A5E', bg='#F5F7FA', bd='#DDE3EE'
const tx='#0D1B36', tx2='#4B5C7E', tx3='#96A4BF'
const re='#C0392B', rbg='#FDECEA', gr='#1A7F4E', gbg='#E0F5EB'

type Log = {
  id:number; date:string; clock_in:string|null
  clock_out:string|null; work_minutes:number|null; memo:string
}

function fmtHours(m:number|null){
  if(m==null||m<=0) return '-'
  const h=Math.floor(m/60), min=m%60
  return min>0?`${h}시간 ${min}분`:`${h}시간`
}

function todayStr(){ return new Date().toISOString().split('T')[0] }

export default function AttendancePage(){
  const { teacher } = useAuth()
  const [logs,    setLogs]    = useState<Log[]>([])
  const [today,   setToday]   = useState<Log|null>(null)
  const [clockIn, setClockIn] = useState('')
  const [clockOut,setClockOut]= useState('')
  const [memo,    setMemo]    = useState('')
  const [saving,  setSaving]  = useState(false)
  const [notif,   setNotif]   = useState<{msg:string;ok:boolean}|null>(null)
  const [selYear,  setSelYear]  = useState(new Date().getFullYear())
  const [selMonth, setSelMonth] = useState(new Date().getMonth()+1)
  const [selDate,  setSelDate]  = useState(todayStr())

  function handleDateChange(d: string) {
    setSelDate(d)
    const [y, m] = d.split('-').map(Number)
    setSelYear(y)
    setSelMonth(m)
  }

  useEffect(()=>{ fetchAll() },[selYear,selMonth])
  useEffect(()=>{
    const t=logs.find(l=>l.date===selDate)??null
    setToday(t)
    if(t){setClockIn(t.clock_in?.slice(0,5)??'');setClockOut(t.clock_out?.slice(0,5)??'');setMemo(t.memo??'')}
    else{setClockIn('');setClockOut('');setMemo('')}
  },[selDate,logs])

  async function fetchAll(){
    if(!teacher) return
    const from=`${selYear}-${String(selMonth).padStart(2,'0')}-01`
    const to  =`${selYear}-${String(selMonth).padStart(2,'0')}-31`
    const {data}=await supabase.from('attendance_log')
      .select('*').eq('teacher_id',teacher.userId)
      .gte('date',from).lte('date',to).order('date',{ascending:false})
    setLogs(data??[])
  }

  function toast(msg:string,ok=true){setNotif({msg,ok});setTimeout(()=>setNotif(null),3000)}

  async function save(){
    if(!teacher) return
    if(!clockIn) return toast('출근 시간을 입력하세요.',false)
    setSaving(true)
    const row={
      teacher_id: teacher.userId,
      date: selDate,
      clock_in: clockIn||null,
      clock_out: clockOut||null,
      memo,
    }
    const {error}=today
      ? await supabase.from('attendance_log').update(row).eq('id',today.id)
      : await supabase.from('attendance_log').insert(row)
    if(error) toast('저장 실패: '+error.message,false)
    else toast(today?'출근 기록 수정됨':'출근 기록 저장됨')
    setSaving(false)
    fetchAll()
  }

  async function deleteLog(id:number){
    if(!confirm('이 기록을 삭제하시겠습니까?')) return
    await supabase.from('attendance_log').delete().eq('id',id)
    toast('삭제됨',false)
    fetchAll()
  }

  const totalDays=logs.length
  const totalMin=logs.reduce((s,l)=>s+(l.work_minutes??0),0)

  const css=`
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
    table{width:100%;border-collapse:collapse;}
    th{padding:9px 12px;text-align:left;font-size:11px;font-weight:600;color:${tx3};background:${bg};border-bottom:1px solid ${bd};}
    td{padding:11px 12px;border-bottom:1px solid ${bd};font-size:13px;color:${tx};}
    tr:last-child td{border-bottom:none;}
    .fi{width:100%;padding:9px 11px;border:1.5px solid ${bd};border-radius:8px;font-size:13px;font-family:inherit;color:${tx};outline:none;background:#fff;transition:border-color .2s;box-sizing:border-box;}
    .fi:focus{border-color:${navy};}
    .lb{display:block;font-size:12px;font-weight:500;color:${tx2};margin-bottom:5px;}
    .fsel{padding:7px 11px;border:1px solid ${bd};border-radius:8px;font-size:12px;font-family:inherit;color:${tx2};background:#fff;outline:none;cursor:pointer;}
    .bdng{display:inline-flex;align-items:center;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;border:none;background:${rbg};color:${re};font-family:inherit;}
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
        <h1 style={{fontSize:21,fontWeight:700,color:tx}}>출근부</h1>
        <p style={{fontSize:13,color:tx2,marginTop:4}}>오늘 출근/퇴근 시간을 입력하고 이번 달 기록을 확인하세요</p>
      </div>

      {/* 오늘 출근 입력 카드 */}
      <div style={{background:'#fff',borderRadius:12,border:`1px solid ${bd}`,padding:20,marginBottom:16,boxShadow:'0 1px 4px rgba(0,0,0,.06)'}}>
        <div style={{fontSize:14,fontWeight:700,color:tx,marginBottom:14,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          📅 날짜
          <input type="date" className="fi" value={selDate} onChange={e=>handleDateChange(e.target.value)}
            style={{width:'auto',display:'inline-block',padding:'5px 10px',fontSize:13,fontWeight:400}}/>
          {today&&<span style={{fontSize:11,color:gr,background:gbg,padding:'2px 8px',borderRadius:20}}>기록 있음</span>}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:12}}>
          <div>
            <label className="lb">출근 시간</label>
            <input type="time" className="fi" value={clockIn} onChange={e=>setClockIn(e.target.value)}/>
          </div>
          <div>
            <label className="lb">퇴근 시간</label>
            <input type="time" className="fi" value={clockOut} onChange={e=>setClockOut(e.target.value)}/>
          </div>
          <div>
            <label className="lb">메모 (선택)</label>
            <input className="fi" value={memo} onChange={e=>setMemo(e.target.value)} placeholder="특이사항"/>
          </div>
        </div>
        {clockIn&&clockOut&&clockIn<clockOut&&(
          <p style={{fontSize:12,color:navy,marginBottom:10}}>
            근무시간: <b>{fmtHours(Math.round((new Date(`2000-01-01T${clockOut}`).getTime()-new Date(`2000-01-01T${clockIn}`).getTime())/60000))}</b>
          </p>
        )}
        <button onClick={save} disabled={saving}
          style={{padding:'9px 20px',borderRadius:8,border:'none',background:navy,color:'#fff',fontSize:13,fontWeight:600,cursor:saving?'not-allowed':'pointer',fontFamily:'inherit',opacity:saving?0.7:1}}>
          {saving?'저장 중...':(today?'수정':'저장')}
        </button>
      </div>

      {/* 이번 달 통계 */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
        <div style={{background:'#fff',borderRadius:12,border:`1px solid ${bd}`,padding:'14px 16px',boxShadow:'0 1px 4px rgba(0,0,0,.06)'}}>
          <p style={{fontSize:11,color:tx3,marginBottom:6}}>이번 달 출근일수</p>
          <p style={{fontSize:24,fontWeight:700,color:navy,margin:0}}>{totalDays}<span style={{fontSize:13,fontWeight:400,color:tx2}}>일</span></p>
        </div>
        <div style={{background:'#fff',borderRadius:12,border:`1px solid ${bd}`,padding:'14px 16px',boxShadow:'0 1px 4px rgba(0,0,0,.06)'}}>
          <p style={{fontSize:11,color:tx3,marginBottom:6}}>이번 달 총 근무시간</p>
          <p style={{fontSize:24,fontWeight:700,color:navy,margin:0}}>{fmtHours(totalMin||null)}</p>
        </div>
      </div>

      {/* 월 선택 + 기록 목록 */}
      <div style={{background:'#fff',borderRadius:12,border:`1px solid ${bd}`,boxShadow:'0 1px 4px rgba(0,0,0,.06)',overflow:'hidden'}}>
        <div style={{padding:'12px 16px',borderBottom:`1px solid ${bd}`,display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:13,fontWeight:700,color:tx}}>출근 기록</span>
          <select className="fsel" value={selYear} onChange={e=>setSelYear(Number(e.target.value))}>
            {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}년</option>)}
          </select>
          <select className="fsel" value={selMonth} onChange={e=>setSelMonth(Number(e.target.value))}>
            {Array.from({length:12},(_,i)=>i+1).map(m=><option key={m} value={m}>{m}월</option>)}
          </select>
        </div>
        {logs.length===0?(
          <p style={{textAlign:'center',color:tx3,padding:'40px 0',fontSize:13}}>출근 기록이 없습니다</p>
        ):(
          <table>
            <thead>
              <tr><th>날짜</th><th>출근</th><th>퇴근</th><th>근무시간</th><th>메모</th><th>관리</th></tr>
            </thead>
            <tbody>
              {logs.map(l=>(
                <tr key={l.id}>
                  <td style={{color:tx2}}>{l.date}</td>
                  <td style={{color:gr,fontWeight:500}}>{l.clock_in?.slice(0,5)??'-'}</td>
                  <td style={{color:re,fontWeight:500}}>{l.clock_out?.slice(0,5)??'-'}</td>
                  <td style={{color:navy,fontWeight:600}}>{fmtHours(l.work_minutes)}</td>
                  <td style={{color:tx3,fontSize:12}}>{l.memo||'-'}</td>
                  <td><button className="bdng" onClick={()=>deleteLog(l.id)}>삭제</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
