'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useMobileMode } from '@/context/MobileModeContext'
import StudyRecords from '@/components/StudyRecords'
import { StudyReport, studyDuration, studyPeriods } from '@/lib/study'

type Student = { id: number; name: string; school: string }
export default function StudyStatsView() {
 const { mobileMode } = useMobileMode()
 const [students,setStudents] = useState<Student[]>([])
 const [report,setReport] = useState<StudyReport | null>(null)
 const [search,setSearch] = useState('')
 const [selected,setSelected] = useState<Student | null>(null)
 const heading = useRef<HTMLHeadingElement>(null)
 useEffect(()=>{if(selected){heading.current?.focus({preventScroll:true});heading.current?.scrollIntoView({block:'start'})}},[selected])
 const [error,setError] = useState('')
 const [reload,setReload] = useState(0)
 useEffect(()=>{
  let active=true
  Promise.all([supabase.from('students').select('id,name,school').order('name'),supabase.rpc('study_report')]).then(([s,r])=>{
   if(!active)return
   setError(s.error || r.error ? '공부시간을 불러오지 못했습니다. 다시 시도해주세요.' : '')
   setStudents((s.data??[]) as Student[]);setReport(r.error ? null : r.data as StudyReport)
  })
  return ()=>{active=false}
 },[reload])
 const filtered=students.filter(s=>s.name.includes(search.trim()))
 const totals=new Map(report?.totals.map(t=>[t.student_id,t]))
 if(selected)return <div>
  <button onClick={()=>{const id=selected.id;setSelected(null);requestAnimationFrame(()=>document.getElementById(`study-row-${id}`)?.focus())}} style={{display:'inline-flex',alignItems:'center',gap:6,minHeight:44,padding:'8px 12px',marginBottom:12,border:'1px solid var(--ui-border)',borderRadius:9,background:'var(--ui-surface)',color:'var(--ui-text-2)',cursor:'pointer',font:'inherit',fontSize:13}}>← 목록으로</button>
  <h2 ref={heading} tabIndex={-1} style={{fontSize:18,fontWeight:700,scrollMarginTop:24}}>{selected.name} · 공부 기록</h2>
  <p style={{fontSize:12,color:'var(--ui-text-3)',marginTop:6}}>{selected.school}</p>
  <StudyRecords key={`${selected.id}-${reload}`} studentId={selected.id} />
 </div>
 return <div>
  <style>{`.study-student-row:hover td{background:var(--ui-surface-2)}.study-student-row:focus-visible{outline:2px solid var(--ui-primary);outline-offset:-2px}`}</style>
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:16}}><div><h2 style={{fontSize:16,fontWeight:700}}>공부시간 통계</h2><p style={{fontSize:12,color:'var(--ui-text-2)',marginTop:6}}>학생 행을 누르면 목표와 세부 공부 기록을 볼 수 있어요.</p></div><button onClick={()=>setReload(v=>v+1)} style={{padding:8,border:'1px solid var(--ui-border)',borderRadius:8,background:'var(--ui-surface)',color:'var(--ui-text)',cursor:'pointer'}}>새로고침</button></div>
  <label style={{display:'block',fontSize:12,marginBottom:16}}>학생 이름 검색<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="이름을 입력하세요" style={{display:'block',marginTop:6,padding:12,width:'100%',maxWidth:360,border:'1px solid var(--ui-border)',borderRadius:10,background:'var(--ui-surface)',color:'var(--ui-text)'}} /></label>
  {error ? <p role="alert">{error}</p> : !report ? <p>불러오는 중…</p> : <div style={{overflowX:'auto',border:'1px solid var(--ui-border)',borderRadius:12}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:mobileMode?11:13,textAlign:'left'}}><thead style={{background:'var(--ui-surface-2)'}}><tr><th style={{padding:12}}>학생</th>{studyPeriods.map(p=><th key={p.id} style={{padding:12}}>{p.label}</th>)}<th style={{width:32}} aria-label="상세 기록" /></tr></thead><tbody>{filtered.map(s=><tr key={s.id} id={`study-row-${s.id}`} tabIndex={0} role="button" aria-label={`${s.name} 공부 기록 보기`} onClick={()=>setSelected(s)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(s)}}} className="study-student-row" style={{borderTop:'1px solid var(--ui-border)',background:'var(--ui-surface)',cursor:'pointer'}}><td style={{padding:12}}><strong>{s.name}</strong><small style={{display:'block',marginTop:4,color:'var(--ui-text-3)'}}>{s.school}</small></td>{studyPeriods.map(p=><td key={p.id} style={{padding:14,color:'var(--ui-primary)',whiteSpace:'nowrap'}}>{studyDuration(totals.get(s.id)?.[p.id]??0)}</td>)}<td style={{padding:12,color:'var(--ui-text-3)'}} aria-hidden="true">›</td></tr>)}</tbody></table>{filtered.length===0&&<p style={{padding:20,textAlign:'center'}}>검색 결과가 없습니다.</p>}</div>}

 </div>
}
