'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { kstNow } from '@/lib/kst'
import TimeSlotInput from '@/components/TimeSlotInput'
import * as XLSX from 'xlsx-js-style'
import { IconX } from '@/components/icons'
import { useMobileMode } from '@/context/MobileModeContext'

const navy='#0D2A5E', navyDk='#071A3E', navyM='#E8EEF8'
const gold='#D87E13', goldL='#F09830', bg='#F5F7FA', bd='#DDE3EE'
const tx='#0D1B36', tx2='#4B5C7E', tx3='#96A4BF'
const re='#C0392B', rbg='#FDECEA', gr='#1A7F4E', gbg='#E0F5EB'

type Teacher = {
  id:number; user_id:string; name:string; email:string
  phone:string; role:string; approved:boolean; created_at:string
}
type Slot = { in:string; out:string }
type AttLog = {
  id:number; teacher_id:string; date:string
  clock_in:string|null; clock_out:string|null
  work_minutes:number|null; memo:string
  slots:Slot[]; approved:boolean
}
type SchEvt = {
  id:number; title:string; start_date:string; end_date:string|null
  start_time:string|null; type:'normal'|'holiday'
}

const MONTHS = Array.from({length:12},(_,i)=>i+1)
const DOW = ['일','월','화','수','목','금','토']

function fmtPhone(p:string){
  if(!p) return '-'
  const n=p.replace(/-/g,'')
  return n.replace(/(\d{3})(\d{4})(\d{4})/,'$1-$2-$3')||p
}
function fmtHours(m:number|null){
  if(m==null||m<=0) return '-'
  const h=Math.floor(m/60), min=m%60
  return min>0?`${h}시간 ${min}분`:`${h}시간`
}
function calcMin(slots:Slot[]){
  return slots.reduce((s,sl)=>{
    if(!sl.in||!sl.out||sl.in>=sl.out) return s
    return s+(new Date(`2000-01-01T${sl.out}`).getTime()-new Date(`2000-01-01T${sl.in}`).getTime())/60000
  },0)
}
function kstDateOf(utcStr:string){
  const s=/[Z+]/.test(utcStr.slice(10))?utcStr:utcStr+'Z'
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date(s))
}
function roleLabel(r:string){ return r==='admin'?'관리자':r==='assistant'?'조교':'선생님' }
// 'H:MM' 형식 (엑셀 다운로드용 — 화면 표시용 fmtHours와는 별개)
function minToHM(m:number){
  const mm=Math.max(0,Math.round(m))
  return `${Math.floor(mm/60)}:${String(mm%60).padStart(2,'0')}`
}

// ── 엑셀 스타일 상수 (앱 화면과 동일한 옅은 톤 팔레트 재사용) ──
const XLSX_FONT_NAME='맑은 고딕'
const XLSX_TXT={rgb:'1A1A1A'}
const XLSX_NAVY={rgb:'0D2A5E'}
const XLSX_BORDER_LINE={style:'thin' as const,color:{rgb:'CCCCCC'}}
const XLSX_BORDER_ALL={top:XLSX_BORDER_LINE,bottom:XLSX_BORDER_LINE,left:XLSX_BORDER_LINE,right:XLSX_BORDER_LINE}
const XLSX_TITLE_FILL={fgColor:{rgb:'E8EEF8'},patternType:'solid' as const}   // 옅은 네이비
const XLSX_SUB_FILL={fgColor:{rgb:'FEF3E2'},patternType:'solid' as const}     // 옅은 골드
const XLSX_HEADER_FILL={fgColor:{rgb:'E8EEF8'},patternType:'solid' as const}  // 옅은 네이비
const XLSX_TOTAL_FILL={fgColor:{rgb:'FEF3E2'},patternType:'solid' as const}   // 옅은 골드
const XLSX_APPROVED_FILL={fgColor:{rgb:'E0F5EB'},patternType:'solid' as const} // 옅은 초록
const XLSX_APPROVED_TXT={rgb:'1A7F4E'}
const XLSX_PENDING_FILL={fgColor:{rgb:'FEF3E2'},patternType:'solid' as const}  // 옅은 주황
const XLSX_PENDING_TXT={rgb:'C05621'}
function xlsxDataFill(rowIdxInData:number){
  // 1번째(홀수) 데이터 행 = 흰색, 2번째(짝수) 데이터 행 = 아주 옅은 네이비 톤
  return {fgColor:{rgb: rowIdxInData%2===1?'F5F7FA':'FFFFFF'},patternType:'solid' as const}
}

function xlsxSetCell(ws:XLSX.WorkSheet, r:number, c:number, style:XLSX.CellStyle){
  const addr=XLSX.utils.encode_cell({r,c})
  if(!ws[addr]) ws[addr]={t:'s',v:''}
  ws[addr].s=style
}

// 시트 공통 스타일 적용 (제목 / 부제 / 헤더 / 데이터 / 합계 행)
function xlsxStyleSheet(ws:XLSX.WorkSheet, opts:{
  titleRow:number; subRow?:number; headerRow:number
  dataStart:number; dataEnd:number; totalRow:number; colCount:number
}){
  const {titleRow,subRow,headerRow,dataStart,dataEnd,totalRow,colCount}=opts
  xlsxSetCell(ws,titleRow,0,{font:{name:XLSX_FONT_NAME,sz:13,bold:true,color:XLSX_NAVY},fill:XLSX_TITLE_FILL,alignment:{horizontal:'left',vertical:'center'}})
  if(subRow!=null) xlsxSetCell(ws,subRow,0,{font:{name:XLSX_FONT_NAME,sz:10,bold:true,color:{rgb:'D87E13'}},fill:XLSX_SUB_FILL,alignment:{horizontal:'left'}})
  for(let c=0;c<colCount;c++){
    xlsxSetCell(ws,headerRow,c,{
      font:{name:XLSX_FONT_NAME,sz:10,bold:true,color:XLSX_NAVY},
      fill:XLSX_HEADER_FILL, border:XLSX_BORDER_ALL,
      alignment:{horizontal:'center',vertical:'center'},
    })
  }
  for(let r=dataStart;r<=dataEnd;r++){
    const fill=xlsxDataFill(r-dataStart)
    for(let c=0;c<colCount;c++){
      xlsxSetCell(ws,r,c,{
        font:{name:XLSX_FONT_NAME,sz:10,color:XLSX_TXT},
        fill, border:XLSX_BORDER_ALL,
        alignment:{horizontal:c===0?'left':'center',vertical:'center'},
      })
    }
  }
  for(let c=0;c<colCount;c++){
    xlsxSetCell(ws,totalRow,c,{
      font:{name:XLSX_FONT_NAME,sz:10,bold:true,color:XLSX_NAVY},
      fill:XLSX_TOTAL_FILL, border:XLSX_BORDER_ALL,
      alignment:{horizontal:'center',vertical:'center'},
    })
  }
}

// 승인/대기 값에 따라 옅은 초록·주황으로 강조 (개별상세 시트의 '승인 상태' 열)
function xlsxColorStatusColumn(ws:XLSX.WorkSheet, dataStart:number, dataEnd:number, col:number){
  for(let r=dataStart;r<=dataEnd;r++){
    const addr=XLSX.utils.encode_cell({r,c:col})
    const cell=ws[addr]
    if(!cell) continue
    if(cell.v==='승인'){
      xlsxSetCell(ws,r,col,{font:{name:XLSX_FONT_NAME,sz:10,bold:true,color:XLSX_APPROVED_TXT},fill:XLSX_APPROVED_FILL,border:XLSX_BORDER_ALL,alignment:{horizontal:'center',vertical:'center'}})
    } else if(cell.v==='대기'){
      xlsxSetCell(ws,r,col,{font:{name:XLSX_FONT_NAME,sz:10,bold:true,color:XLSX_PENDING_TXT},fill:XLSX_PENDING_FILL,border:XLSX_BORDER_ALL,alignment:{horizontal:'center',vertical:'center'}})
    }
  }
}

function xlsxSheetName(name:string, used:Set<string>){
  const base=(name.replace(/[\\/?*[\]:]/g,'').trim()||'선생님').slice(0,31)
  let candidate=base, n=2
  while(used.has(candidate)){
    const suffix='_'+n
    candidate=base.slice(0,31-suffix.length)+suffix
    n++
  }
  used.add(candidate)
  return candidate
}

export default function TeachersPage(){
  const { teacher: me } = useAuth()
  const { mobileMode } = useMobileMode()
  const [tabIdx,     setTabIdx]     = useState(0)
  const [attTabIdx,  setAttTabIdx]  = useState(0) // 0=달력 1=선생님별
  const [teachers,   setTeachers]   = useState<Teacher[]>([])
  const [attLogs,    setAttLogs]    = useState<AttLog[]>([])
  const [schEvts,    setSchEvts]    = useState<SchEvt[]>([])
  const [loading,    setLoading]    = useState(true)
  const [selYear,    setSelYear]    = useState(kstNow().getFullYear())
  const [selMonth,   setSelMonth]   = useState(kstNow().getMonth()+1)
  const [selTeacher, setSelTeacher] = useState<Teacher|null>(null)
  const [notif,      setNotif]      = useState<{msg:string;ok:boolean}|null>(null)
  // 수정 모달
  const [editLog,    setEditLog]    = useState<AttLog|null>(null)
  const [editSlots,  setEditSlots]  = useState<Slot[]>([])
  const [editMemo,   setEditMemo]   = useState('')
  const [editSaving, setEditSaving] = useState(false)
  // 달력
  const [calDay,     setCalDay]     = useState<string|null>(null)
  const [bulkApproving, setBulkApproving] = useState(false)

  useEffect(()=>{ fetchTeachers() },[])
  useEffect(()=>{ if(tabIdx===1){ fetchAtt(); fetchSchEvts() } },[tabIdx,selYear,selMonth])

  async function fetchTeachers(){
    setLoading(true)
    const {data}=await supabase.from('teachers').select('*').order('created_at')
    setTeachers(data??[])
    setLoading(false)
  }
  async function fetchAtt(){
    setLoading(true)
    const from=`${selYear}-${String(selMonth).padStart(2,'0')}-01`
    const to  =`${selYear}-${String(selMonth).padStart(2,'0')}-31`
    const {data}=await supabase.from('attendance_log')
      .select('*').gte('date',from).lte('date',to).order('date')
    setAttLogs((data??[]).map(r=>({...r,slots:r.slots??[],approved:r.approved??false})))
    setLoading(false)
  }
  // 학원일정(학원일정 메뉴에서 등록한 일정)을 달력에 함께 표시 — 조회 전용, 출근부 내용은 반대로 반영되지 않음
  async function fetchSchEvts(){
    const from=`${selYear}-${String(selMonth).padStart(2,'0')}-01`
    const lastDay=new Date(selYear,selMonth,0).getDate()
    const to=`${selYear}-${String(selMonth).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`
    const cols='id,title,start_date,end_date,start_time,type'
    const [{data:A},{data:B}]=await Promise.all([
      supabase.from('events').select(cols).gte('start_date',from).lte('start_date',to),
      supabase.from('events').select(cols).lt('start_date',from).gte('end_date',from),
    ])
    const map=new Map<number,SchEvt>()
    for(const e of [...(A??[]),...(B??[])]) map.set(e.id,e as SchEvt)
    setSchEvts([...map.values()])
  }

  function toast(msg:string,ok=true){setNotif({msg,ok});setTimeout(()=>setNotif(null),3000)}

  // 출근부 Excel 다운로드 (선택된 selYear/selMonth 기준)
  function downloadAttendanceExcel(){
    const approvedTeachers=teachers.filter(t=>t.approved)
    if(approvedTeachers.length===0) return toast('승인된 선생님이 없습니다.',false)

    const ymTitle=`${selYear}년 ${String(selMonth).padStart(2,'0')}월`
    const wb=XLSX.utils.book_new()

    // ── 시트 1: 월별 집계 요약 (근무시간은 승인된 기록만 반영, 근무시간이 없는 사람은 제외) ──
    const perTeacherAll=approvedTeachers.map(t=>{
      const logs=attLogs.filter(l=>l.teacher_id===t.user_id)
      const approvedLogs=logs.filter(l=>l.approved)
      const pendingCnt=logs.length-approvedLogs.length
      const days=approvedLogs.length
      const mins=approvedLogs.reduce((s,l)=>s+(l.work_minutes??0),0)
      return {t,logs,pendingCnt,days,mins}
    })
    const perTeacher=perTeacherAll.filter(p=>p.mins>0)
    if(perTeacher.length===0) return toast('승인된 근무시간이 있는 선생님이 없습니다.',false)

    const sumDays=perTeacher.reduce((s,p)=>s+p.days,0)
    const sumMins=perTeacher.reduce((s,p)=>s+p.mins,0)

    const s1Header=['이름','역할','출근일수','총 근무시간(분)','총 근무시간(H:MM)','비고']
    const s1Aoa=[
      [`티처스 수학학원 출근부 — ${ymTitle}`],
      s1Header,
      ...perTeacher.map(({t,days,mins,pendingCnt})=>[t.name,roleLabel(t.role),days,mins,minToHM(mins),pendingCnt>0?`승인 대기 ${pendingCnt}건 제외`:'']),
      ['합계','',sumDays,sumMins,minToHM(sumMins),''],
    ]
    const ws1=XLSX.utils.aoa_to_sheet(s1Aoa)
    ws1['!merges']=[{s:{r:0,c:0},e:{r:0,c:5}}]
    ws1['!cols']=[{wch:12},{wch:10},{wch:10},{wch:16},{wch:16},{wch:22}]
    xlsxStyleSheet(ws1,{titleRow:0,headerRow:1,dataStart:2,dataEnd:2+perTeacher.length-1,totalRow:2+perTeacher.length,colCount:6})
    XLSX.utils.book_append_sheet(wb,ws1,'월별 집계 요약')

    // ── 시트 2~N: 선생님별 일별 상세 (평일만, 승인/대기 구분, 합계는 승인된 시간만) ──
    const dim=new Date(selYear,selMonth,0).getDate()
    const usedNames=new Set<string>()
    for(const {t,logs} of perTeacher){
      const rows:(string|number)[][]=[]
      let mDays=0, mMins=0
      for(let d=1;d<=dim;d++){
        const dow=new Date(selYear,selMonth-1,d).getDay()
        if(dow===0||dow===6) continue // 평일(월~금)만
        const ds=`${selYear}-${String(selMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`
        const log=logs.find(l=>l.date===ds)
        if(log){
          if(log.approved){ mDays++; mMins+=(log.work_minutes??0) }
          rows.push([ds,DOW[dow],
            log.clock_in?log.clock_in.slice(0,5):'-',
            log.clock_out?log.clock_out.slice(0,5):'-',
            log.work_minutes??'-',
            log.work_minutes!=null?minToHM(log.work_minutes):'-',
            log.approved?'승인':'대기',
          ])
        } else {
          rows.push([ds,DOW[dow],'-','-','-','-','-'])
        }
      }
      const avgMins=mDays>0?Math.round(mMins/mDays):0
      const aoa=[
        [`티처스 수학학원 출근부 — ${t.name}(${roleLabel(t.role)}) ${ymTitle}`],
        [`출근일수(승인): ${mDays}일   총 근무시간(승인): ${minToHM(mMins)}   평균 근무시간: ${minToHM(avgMins)}`],
        ['날짜','요일','출근 시간','퇴근 시간','근무시간(분)','근무시간(H:MM)','승인 상태'],
        ...rows,
        ['합계','','','',mMins,minToHM(mMins),''],
      ]
      const ws=XLSX.utils.aoa_to_sheet(aoa)
      ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:6}},{s:{r:1,c:0},e:{r:1,c:6}}]
      ws['!cols']=[{wch:12},{wch:6},{wch:12},{wch:12},{wch:14},{wch:16},{wch:12}]
      xlsxStyleSheet(ws,{titleRow:0,subRow:1,headerRow:2,dataStart:3,dataEnd:3+rows.length-1,totalRow:3+rows.length,colCount:7})
      xlsxColorStatusColumn(ws,3,3+rows.length-1,6)
      XLSX.utils.book_append_sheet(wb,ws,xlsxSheetName(t.name,usedNames))
    }

    XLSX.writeFile(wb,`티처스 수학학원_출근부_${selYear}년${String(selMonth).padStart(2,'0')}월.xlsx`)
  }

  async function toggleApprove(t:Teacher){
    const {error}=await supabase.from('teachers').update({approved:!t.approved}).eq('id',t.id)
    if(error) return toast('수정 실패',false)
    toast(t.approved?`${t.name} 승인 취소됨`:`${t.name} 승인됨`,!t.approved)
    fetchTeachers()
  }
  async function changeRole(t:Teacher,role:string){
    const {error}=await supabase.from('teachers').update({role}).eq('id',t.id)
    if(error) return toast('역할 변경 실패',false)
    toast(`${t.name} 역할 변경됨`)
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

  // 출근부 승인 토글
  async function toggleAttApprove(log:AttLog){
    const next=!log.approved
    const res=await fetch('/api/attendance/approve',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({logId:log.id, approved:next, approvedBy:me?.userId??null}),
    })
    const json=await res.json()
    if(!res.ok||json.error) return toast('처리 실패: '+(json.error??'알 수 없는 오류'),false)
    toast(next?'승인됨':'승인 취소됨',next)
    fetchAtt()
  }

  // 특정 날짜의 대기중인 출근 기록을 한 번에 승인
  async function bulkApproveDay(date:string){
    const pending=dayLogs(date).filter(l=>!l.approved)
    if(pending.length===0) return
    setBulkApproving(true)
    const results=await Promise.all(pending.map(l=>
      fetch('/api/attendance/approve',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({logId:l.id, approved:true, approvedBy:me?.userId??null}),
      }).then(res=>res.json().then(json=>({res,json})))
    ))
    setBulkApproving(false)
    const failCnt=results.filter(({res,json})=>!res.ok||json.error).length
    if(failCnt>0) toast(`${pending.length-failCnt}건 승인됨, ${failCnt}건 실패`,false)
    else toast(`${pending.length}건 일괄 승인됨`)
    fetchAtt()
  }

  // 수정 모달 열기
  function openEditLog(log:AttLog){
    setEditLog(log)
    const s:Slot[]=log.slots?.length?log.slots:(log.clock_in?[{in:log.clock_in.slice(0,5),out:log.clock_out?.slice(0,5)??''}]:[{in:'',out:''}])
    setEditSlots(s)
    setEditMemo(log.memo??'')
  }
  function closeEditLog(){setEditLog(null)}
  async function saveEditLog(){
    if(!editLog) return
    const valid=editSlots.filter(s=>s.in&&s.out&&s.in<s.out)
    if(!valid.length) return toast('올바른 시간을 입력하세요.',false)
    setEditSaving(true)
    const mins=Math.round(calcMin(valid))
    const res=await fetch('/api/attendance/update',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        logId:editLog.id,
        slots:valid,
        clockIn:valid[0].in, clockOut:valid[valid.length-1].out,
        workMinutes:mins, memo:editMemo,
        approved:true, approvedBy:me?.userId??null,
      }),
    })
    const json=await res.json()
    if(!res.ok||json.error) toast('저장 실패: '+(json.error??'알 수 없는 오류'),false)
    else { toast('수정 및 승인됨'); closeEditLog() }
    setEditSaving(false)
    fetchAtt()
  }
  function addEditSlot(){setEditSlots(p=>[...p,{in:'',out:''}])}
  function removeEditSlot(i:number){setEditSlots(p=>p.filter((_,idx)=>idx!==i))}
  function updateEditSlot(i:number,f:'in'|'out',v:string){setEditSlots(p=>p.map((s,idx)=>idx===i?{...s,[f]:v}:s))}

  // 달력 계산
  const dim=new Date(selYear,selMonth,0).getDate()
  const fd =new Date(selYear,selMonth-1,1).getDay()
  const trail=(7-((fd+dim)%7))%7

  function dayLogs(ds:string){return attLogs.filter(l=>l.date===ds)}
  function dayEvts(ds:string){
    return schEvts.filter(e=>{
      const end=e.end_date??e.start_date
      return e.start_date<=ds && end>=ds
    })
  }
  function teacherName(uid:string){return teachers.find(t=>t.user_id===uid)?.name??uid.slice(0,8)}

  // 선생님 목록 정렬 — 역할(관리자>선생님>조교) 순, 그다음 이름 순
  const ROLE_ORDER:Record<string,number>={admin:0,teacher:1,assistant:2}
  const sortedTeachers=[...teachers].sort((a,b)=>{
    const ra=ROLE_ORDER[a.role]??99, rb=ROLE_ORDER[b.role]??99
    if(ra!==rb) return ra-rb
    return a.name.localeCompare(b.name,'ko')
  })

  // 선생님별 집계
  const attSummary=teachers.filter(t=>t.approved).map(t=>{
    const logs=attLogs.filter(a=>a.teacher_id===t.user_id)
    const approved=logs.filter(l=>l.approved)
    return {teacher:t,
      totalDays:logs.length, approvedDays:approved.length,
      pendingDays:logs.filter(l=>!l.approved).length,
      totalMin:approved.reduce((s,a)=>s+(a.work_minutes??0),0), logs}
  })
  const selLogs=selTeacher?attLogs.filter(a=>a.teacher_id===selTeacher.user_id):[]

  const css=`
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
    table{width:100%;border-collapse:collapse;}
    th{padding:9px 12px;text-align:left;font-size:11px;font-weight:600;color:${tx3};background:${bg};border-bottom:1px solid ${bd};}
    td{padding:10px 12px;border-bottom:1px solid ${bd};font-size:13px;color:${tx};}
    tr:last-child td{border-bottom:none;}
    tr:hover td{background:${navyM};}
    .bgold{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:none;background:${gold};color:${navyDk};font-family:inherit;}
    .bgold:hover{background:${goldL};}
    .bout{display:inline-flex;align-items:center;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;border:1px solid ${bd};background:transparent;color:${tx2};font-family:inherit;}
    .bout:hover{border-color:${navy};color:${navy};}
    .bdng{display:inline-flex;align-items:center;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;border:none;background:${rbg};color:${re};font-family:inherit;}
    .bapv{display:inline-flex;align-items:center;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;border:none;background:${gbg};color:${gr};font-family:inherit;}
    .bedt{display:inline-flex;align-items:center;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;border:1px solid ${bd};background:#fff;color:${tx2};font-family:inherit;}
    .fsel{padding:7px 11px;border:1px solid ${bd};border-radius:8px;font-size:12px;font-family:inherit;color:${tx2};background:#fff;outline:none;cursor:pointer;}
    .tab-btn{padding:8px 20px;border:none;background:none;cursor:pointer;font-size:14px;font-family:inherit;color:${tx3};border-bottom:2.5px solid transparent;transition:all .15s;}
    .tab-btn.active{color:${navy};font-weight:700;border-bottom-color:${navy};}
    .sub-tab{padding:6px 16px;border:none;background:none;cursor:pointer;font-size:13px;font-family:inherit;color:${tx3};border-bottom:2px solid transparent;}
    .sub-tab.active{color:${navy};font-weight:600;border-bottom-color:${navy};}
    .cd{min-height:80px;background:#fff;border:1px solid ${bd};border-radius:8px;padding:6px;cursor:pointer;transition:background .15s;}
    .cd:hover{background:${navyM};}
    .cd.om{opacity:.35;cursor:default;pointer-events:none;}
    .fi{width:100%;padding:9px 11px;border:1.5px solid ${bd};border-radius:8px;font-size:13px;font-family:inherit;color:${tx};outline:none;background:#fff;transition:border-color .2s;box-sizing:border-box;}
    .fi:focus{border-color:${navy};}
    .bnav{padding:7px 11px;border-radius:8px;font-size:12px;border:1px solid ${bd};background:#fff;cursor:pointer;color:${tx2};font-family:inherit;}
    .bnav:hover{border-color:${navy};color:${navy};}
    .bxls{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:none;background:${gr};color:#fff;font-family:inherit;transition:background .15s;}
    .bxls:hover{background:#156B40;}
  `

  return(
    <div style={{padding:mobileMode?'16px 14px 88px':'28px 32px',fontFamily:"'Noto Sans KR',sans-serif"}}>
      <style>{css}</style>

      {notif&&(
        <div style={{position:'fixed',top:18,right:18,zIndex:9999,background:'#fff',borderRadius:8,padding:'11px 14px',borderLeft:`4px solid ${notif.ok?gr:re}`,boxShadow:'0 4px 18px rgba(0,0,0,.1)',minWidth:200}}>
          <div style={{fontWeight:600,marginBottom:2,color:tx,fontSize:13}}>{notif.ok?'완료':'알림'}</div>
          <div style={{fontSize:12,color:tx2}}>{notif.msg}</div>
        </div>
      )}

      {/* 수정 모달 */}
      {editLog&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'#fff',borderRadius:14,width:'100%',maxWidth:480,boxShadow:'0 8px 40px rgba(0,0,0,.2)'}}>
            <div style={{padding:'18px 22px',borderBottom:`1px solid ${bd}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontSize:15,fontWeight:700,color:tx}}>근무 기록 수정 · 승인</span>
              <button onClick={closeEditLog} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,color:tx3}}>×</button>
            </div>
            <div style={{padding:'18px 22px'}}>
              <p style={{fontSize:12,color:tx3,marginBottom:14}}>
                {teacherName(editLog.teacher_id)} · {editLog.date}
              </p>
              <p style={{fontSize:12,fontWeight:500,color:tx2,marginBottom:8}}>근무 시간대</p>
              {editSlots.map((sl,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                  <span style={{fontSize:12,color:tx3,minWidth:16}}>{i+1}</span>
                  <TimeSlotInput value={sl.in} onChange={v=>updateEditSlot(i,'in',v)} />
                  <span style={{color:tx3}}>~</span>
                  <TimeSlotInput value={sl.out} onChange={v=>updateEditSlot(i,'out',v)} />
                  {sl.in&&sl.out&&sl.in<sl.out&&(
                    <span style={{fontSize:11,color:navy,minWidth:56,whiteSpace:'nowrap'}}>
                      {fmtHours(Math.round(calcMin([sl])))}
                    </span>
                  )}
                  {editSlots.length>1&&(
                    <button onClick={()=>removeEditSlot(i)}
                      style={{padding:'5px 8px',border:'none',background:rbg,color:re,borderRadius:6,cursor:'pointer',display:'flex'}}><IconX size={12} /></button>
                  )}
                </div>
              ))}
              <button onClick={addEditSlot}
                style={{padding:'5px 12px',borderRadius:7,border:`1px dashed ${bd}`,background:'transparent',color:tx2,fontSize:12,cursor:'pointer',fontFamily:'inherit',marginBottom:14}}>
                + 시간대 추가
              </button>
              {calcMin(editSlots.filter(s=>s.in&&s.out&&s.in<s.out))>0&&(
                <p style={{fontSize:12,color:navy,marginBottom:10,fontWeight:600}}>
                  총 근무시간: {fmtHours(Math.round(calcMin(editSlots.filter(s=>s.in&&s.out&&s.in<s.out))))}
                </p>
              )}
              <div style={{marginBottom:4}}>
                <label style={{display:'block',fontSize:12,fontWeight:500,color:tx2,marginBottom:5}}>메모</label>
                <input className="fi" value={editMemo} onChange={e=>setEditMemo(e.target.value)} placeholder="특이사항"/>
              </div>
            </div>
            <div style={{padding:'0 22px 18px',display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={closeEditLog} style={{padding:'8px 16px',borderRadius:8,border:`1px solid ${bd}`,background:'transparent',color:tx2,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>취소</button>
              <button onClick={saveEditLog} disabled={editSaving}
                style={{padding:'8px 18px',borderRadius:8,border:'none',background:navy,color:'#fff',fontSize:13,fontWeight:600,cursor:editSaving?'not-allowed':'pointer',fontFamily:'inherit',opacity:editSaving?.7:1}}>
                {editSaving?'저장 중...':'수정 및 승인'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 날짜 셀 클릭 상세 모달 */}
      {calDay&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}
          onClick={()=>setCalDay(null)}>
          <div style={{background:'#fff',borderRadius:14,width:'100%',maxWidth:480,boxShadow:'0 8px 40px rgba(0,0,0,.2)',maxHeight:'80vh',overflow:'auto'}}
            onClick={e=>e.stopPropagation()}>
            <div style={{padding:'16px 20px',borderBottom:`1px solid ${bd}`,display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
              <span style={{fontSize:14,fontWeight:700,color:tx}}>{calDay} 출근 현황</span>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                {dayLogs(calDay).some(l=>!l.approved)&&(
                  <button className="bapv" disabled={bulkApproving} onClick={()=>bulkApproveDay(calDay)}
                    style={{opacity:bulkApproving?0.6:1,cursor:bulkApproving?'not-allowed':'pointer'}}>
                    {bulkApproving?'승인 중...':'일괄 승인'}
                  </button>
                )}
                <button onClick={()=>setCalDay(null)} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,color:tx3}}>×</button>
              </div>
            </div>
            <div style={{padding:'16px 20px'}}>
              {dayLogs(calDay).length===0?(
                <p style={{color:tx3,fontSize:13,textAlign:'center',padding:'20px 0'}}>기록 없음</p>
              ):dayLogs(calDay).map(l=>{
                const slotsDisplay:Slot[]=l.slots?.length?l.slots:(l.clock_in?[{in:l.clock_in.slice(0,5),out:l.clock_out?.slice(0,5)??''}]:[])
                return(
                  <div key={l.id} style={{borderBottom:`1px solid ${bd}`,paddingBottom:12,marginBottom:12}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                      <span style={{fontSize:13,fontWeight:600,color:tx}}>{teacherName(l.teacher_id)}</span>
                      <div style={{display:'flex',gap:6,alignItems:'center'}}>
                        <span style={{fontSize:11,padding:'2px 7px',borderRadius:20,fontWeight:600,
                          background:l.approved?gbg:'#FEF3E2',color:l.approved?gr:'#D87E13'}}>
                          {l.approved?'승인':'대기'}
                        </span>
                        <button className="bedt" onClick={()=>{setCalDay(null);openEditLog(l)}}>수정·승인</button>
                        {!l.approved&&(
                          <button className="bapv" onClick={()=>toggleAttApprove(l)}>승인</button>
                        )}
                        {l.approved&&(
                          <button className="bdng" onClick={()=>toggleAttApprove(l)}>취소</button>
                        )}
                      </div>
                    </div>
                    {slotsDisplay.map((s,i)=>(
                      <div key={i} style={{fontSize:12,color:tx2}}>
                        {s.in} ~ {s.out}
                        {s.in&&s.out&&s.in<s.out&&(
                          <span style={{color:navy,marginLeft:8}}>{fmtHours(Math.round(calcMin([s])))}</span>
                        )}
                      </div>
                    ))}
                    <div style={{fontSize:12,color:navy,fontWeight:600,marginTop:4}}>
                      총 {fmtHours(l.work_minutes)}
                    </div>
                    {l.memo&&<div style={{fontSize:11,color:tx3,marginTop:2}}>{l.memo}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div style={{marginBottom:mobileMode?14:20}}>
        <h1 style={{fontSize:mobileMode?17:21,fontWeight:700,color:tx}}>선생님 관리</h1>
        {!mobileMode && <p style={{fontSize:13,color:tx2,marginTop:4}}>선생님 승인, 역할 변경, 출근 현황을 관리합니다</p>}
      </div>

      {/* 메인 탭 */}
      <div style={{borderBottom:`1px solid ${bd}`,marginBottom:mobileMode?14:20,display:'flex',gap:4}}>
        {['선생님 목록','출근부'].map((t,i)=>(
          <button key={i} className={`tab-btn${tabIdx===i?' active':''}`}
            onClick={()=>{setTabIdx(i);setSelTeacher(null)}}>
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
            <div style={{overflowX:'auto'}}>
            <table>
              <thead>
                <tr><th>이름</th><th>이메일</th><th>연락처</th><th>역할</th><th>승인 상태</th><th>가입일</th><th>관리</th></tr>
              </thead>
              <tbody>
                {sortedTeachers.map(t=>(
                  <tr key={t.id}>
                    <td style={{fontWeight:600}}>{t.name}</td>
                    <td style={{color:tx2}}>{t.email}</td>
                    <td style={{color:tx2}}>{fmtPhone(t.phone)}</td>
                    <td>
                      <select className="fsel" value={t.role} onChange={e=>changeRole(t,e.target.value)}
                        style={{padding:'3px 8px',fontSize:11}}>
                        <option value="teacher">선생님</option>
                        <option value="assistant">조교</option>
                        <option value="admin">관리자</option>
                      </select>
                    </td>
                    <td>
                      {t.approved
                        ?<span style={{background:gbg,color:gr,fontSize:11,fontWeight:600,padding:'3px 9px',borderRadius:20}}>승인됨</span>
                        :<span style={{background:rbg,color:re,fontSize:11,fontWeight:600,padding:'3px 9px',borderRadius:20}}>대기중</span>}
                    </td>
                    <td style={{color:tx3,fontSize:12}}>{kstDateOf(t.created_at)}</td>
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
            </div>
          )}
        </div>
      )}

      {/* ── 탭 2: 출근부 ── */}
      {tabIdx===1&&(
        <>
          {/* 월 선택 + 서브탭 */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:10}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <button className="bnav" onClick={()=>{
                let m=selMonth-2,y=selYear
                if(m<0){m=11;y--}
                setSelYear(y);setSelMonth(m+1)
              }}>‹</button>
              <select className="fsel" value={selYear} onChange={e=>setSelYear(Number(e.target.value))}>
                {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}년</option>)}
              </select>
              <select className="fsel" value={selMonth} onChange={e=>setSelMonth(Number(e.target.value))}>
                {MONTHS.map(m=><option key={m} value={m}>{m}월</option>)}
              </select>
              <button className="bnav" onClick={()=>{
                let m=selMonth,y=selYear
                if(m>11){m=0;y++}
                setSelYear(y);setSelMonth(m+1)
              }}>›</button>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:14}}>
              <div style={{borderBottom:`1px solid ${bd}`,display:'flex',gap:2}}>
                {['달력','선생님별'].map((t,i)=>(
                  <button key={i} className={`sub-tab${attTabIdx===i?' active':''}`}
                    onClick={()=>{setAttTabIdx(i);setSelTeacher(null)}}>
                    {t}
                  </button>
                ))}
              </div>
              <button className="bxls" onClick={downloadAttendanceExcel}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v3a1 1 0 001 1h14a1 1 0 001-1v-3"/></svg>
                Excel 다운로드
              </button>
            </div>
          </div>

          {/* ── 달력 뷰 ── */}
          {attTabIdx===0&&(
            <>
              {/* 대기 건수 배너 */}
              {attLogs.filter(l=>!l.approved).length>0&&(
                <div style={{background:'#FEF3E2',border:'1px solid #D87E13',borderRadius:8,padding:'10px 14px',marginBottom:14,fontSize:13,color:'#D87E13',fontWeight:600}}>
                  승인 대기 {attLogs.filter(l=>!l.approved).length}건
                </div>
              )}
              {/* 달력 그리드 */}
              <div style={{background:'#fff',borderRadius:12,border:`1px solid ${bd}`,padding:16,boxShadow:'0 1px 4px rgba(0,0,0,.06)'}}>
                <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:4,marginBottom:8}}>
                  {DOW.map((d,i)=>(
                    <div key={d} style={{textAlign:'center',fontSize:11,fontWeight:700,
                      color:i===0?re:i===6?navy:tx3,padding:'4px 0'}}>
                      {d}
                    </div>
                  ))}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:4}}>
                  {/* 앞 빈칸 */}
                  {Array.from({length:fd}).map((_,i)=>(
                    <div key={'p'+i} className="cd om"/>
                  ))}
                  {/* 날짜 */}
                  {Array.from({length:dim}).map((_,i)=>{
                    const d=i+1
                    const ds=`${selYear}-${String(selMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`
                    const dLogs=dayLogs(ds)
                    const pending=dLogs.filter(l=>!l.approved).length
                    const approved=dLogs.filter(l=>l.approved).length
                    const dow=(fd+d-1)%7
                    return(
                      <div key={d} className="cd" onClick={()=>dLogs.length>0&&setCalDay(ds)}
                        style={{cursor:dLogs.length>0?'pointer':'default'}}>
                        <div style={{fontSize:11,fontWeight:600,marginBottom:3,
                          color:dow===0?re:dow===6?navy:tx2}}>
                          {d}
                        </div>
                        {dayEvts(ds).map(e=>(
                          <div key={'e'+e.id} title={e.title} style={{
                            fontSize:9,padding:'2px 4px',borderRadius:3,marginBottom:2,
                            background:e.type==='holiday'?'rgba(222,53,11,.15)':navyM,
                            color:e.type==='holiday'?re:navy,
                            whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                            {e.start_time&&`${e.start_time.slice(0,5)} `}{e.title}
                          </div>
                        ))}
                        {dLogs.map(l=>(
                          <div key={l.id} style={{
                            fontSize:9,padding:'2px 4px',borderRadius:3,marginBottom:2,
                            background:l.approved?gbg:'#FEF3E2',
                            color:l.approved?gr:'#D87E13',
                            whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                            {teacherName(l.teacher_id)} {fmtHours(l.work_minutes)}
                          </div>
                        ))}
                        {pending>0&&(
                          <div style={{fontSize:9,color:'#D87E13',fontWeight:700}}>대기 {pending}</div>
                        )}
                      </div>
                    )
                  })}
                  {/* 뒤 빈칸 */}
                  {Array.from({length:trail}).map((_,i)=>(
                    <div key={'n'+i} className="cd om"/>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── 선생님별 뷰 ── */}
          {attTabIdx===1&&(
            <div style={{display:'grid',gridTemplateColumns:mobileMode?'1fr':(selTeacher?'1fr 1fr':'1fr'),gap:16}}>
              {/* 선생님별 집계 */}
              <div style={{background:'#fff',borderRadius:12,border:`1px solid ${bd}`,boxShadow:'0 1px 4px rgba(0,0,0,.06)',overflow:'hidden'}}>
                <div style={{overflowX:'auto'}}>
                <table>
                  <thead>
                    <tr><th>이름</th><th>출근일</th><th>승인</th><th>대기</th><th>총 근무(승인)</th></tr>
                  </thead>
                  <tbody>
                    {attSummary.map(({teacher:t,totalDays,approvedDays,pendingDays,totalMin})=>(
                      <tr key={t.id} onClick={()=>setSelTeacher(selTeacher?.id===t.id?null:t)}
                        style={{cursor:'pointer',background:selTeacher?.id===t.id?navyM:''}}>
                        <td style={{fontWeight:600}}>{t.name}</td>
                        <td style={{color:totalDays>0?navy:tx3}}>{totalDays}일</td>
                        <td style={{color:approvedDays>0?gr:tx3}}>{approvedDays}일</td>
                        <td style={{color:pendingDays>0?'#D87E13':tx3}}>{pendingDays}건</td>
                        <td style={{color:totalMin>0?navy:tx3,fontWeight:600}}>{fmtHours(totalMin||null)}</td>
                      </tr>
                    ))}
                    {attSummary.length===0&&(
                      <tr><td colSpan={5} style={{textAlign:'center',color:tx3,padding:'30px 0'}}>출근 기록이 없습니다</td></tr>
                    )}
                  </tbody>
                </table>
                </div>
              </div>

              {/* 선택된 선생님 일별 상세 */}
              {selTeacher&&(
                <div style={{background:'#fff',borderRadius:12,border:`1px solid ${bd}`,boxShadow:'0 1px 4px rgba(0,0,0,.06)',overflow:'hidden'}}>
                  <div style={{padding:'12px 16px',borderBottom:`1px solid ${bd}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <span style={{fontSize:13,fontWeight:700,color:tx}}>{selTeacher.name} — 일별 상세</span>
                    <button onClick={()=>setSelTeacher(null)} style={{background:'none',border:'none',cursor:'pointer',color:tx3,fontSize:16}}>×</button>
                  </div>
                  <div style={{overflowX:'auto'}}>
                  <table>
                    <thead>
                      <tr><th>날짜</th><th>시간대</th><th>근무시간</th><th>승인</th><th>관리</th></tr>
                    </thead>
                    <tbody>
                      {selLogs.length===0?(
                        <tr><td colSpan={5} style={{textAlign:'center',color:tx3,padding:'30px 0'}}>기록 없음</td></tr>
                      ):selLogs.map(l=>{
                        const slotsDisplay:Slot[]=l.slots?.length?l.slots:(l.clock_in?[{in:l.clock_in.slice(0,5),out:l.clock_out?.slice(0,5)??''}]:[])
                        return(
                          <tr key={l.id}>
                            <td style={{color:tx2,whiteSpace:'nowrap'}}>{l.date}</td>
                            <td>
                              {slotsDisplay.map((s,i)=>(
                                <div key={i} style={{fontSize:11,color:tx2}}>{s.in}~{s.out}</div>
                              ))}
                            </td>
                            <td style={{color:l.approved?gr:tx,fontWeight:600,whiteSpace:'nowrap'}}>{fmtHours(l.work_minutes)}</td>
                            <td>
                              <span style={{fontSize:10,padding:'2px 6px',borderRadius:20,fontWeight:600,
                                background:l.approved?gbg:'#FEF3E2',color:l.approved?gr:'#D87E13'}}>
                                {l.approved?'승인':'대기'}
                              </span>
                            </td>
                            <td>
                              <div style={{display:'flex',gap:4}}>
                                <button className="bedt" onClick={()=>openEditLog(l)}>수정</button>
                                {!l.approved
                                  ?<button className="bapv" onClick={()=>toggleAttApprove(l)}>승인</button>
                                  :<button className="bdng" onClick={()=>toggleAttApprove(l)}>취소</button>}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
