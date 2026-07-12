'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { can } from '@/lib/permissions'
import { kstDateStr, kstNow } from '@/lib/kst'

type Test = { id:number; name:string; date:string; total:number }
type ScoreRow = {
  id:number; test_id:number; student_id:number; cor:number; score:number
  students?:{ name:string; school:string }|null
}
type Student = { id:number; name:string; school:string }

const navy='#0D2A5E', navyDk='#071A3E', navyM='#E8EEF8'
const gold='#D87E13', goldL='#F09830'
const bg='#F5F7FA', bd='#DDE3EE'
const tx='#0D1B36', tx2='#4B5C7E', tx3='#96A4BF'
const re='#C0392B', rbg='#FDECEA', gr='#1A7F4E', gbg='#E0F5EB'

export default function TestsPage() {
  const { role } = useAuth()
  const [view,      setView]      = useState<'list'|'detail'>('list')
  const [tests,     setTests]     = useState<Test[]>([])
  const [scores,    setScores]    = useState<ScoreRow[]>([])
  const [students,  setStudents]  = useState<Student[]>([])
  const [curTest,   setCurTest]   = useState<Test|null>(null)
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [addModal,  setAddModal]  = useState(false)
  const [form,      setForm]      = useState({ name:'', date:kstDateStr(), total:'' })
  const [editId,    setEditId]    = useState<number|null>(null)
  const [editSc,    setEditSc]    = useState<{row:ScoreRow;cor:string;score:string}|null>(null)
  const [saving,    setSaving]    = useState(false)
  const [notif,     setNotif]     = useState<{msg:string;ok:boolean}|null>(null)
  const [testStats, setTestStats] = useState<Record<number,{cnt:number; avg:number; max:number; min:number; dist:number[]}>>({})

  useEffect(()=>{ fetchAll() },[])

  useEffect(()=>{ if(tests.length>0) fetchAllStats() },[tests])

  async function fetchAllStats(){
    const stats:Record<number,{cnt:number; avg:number; max:number; min:number; dist:number[]}> = {}
    for(const t of tests){
      // test_scores 먼저 시도
      const { data: sc } = await supabase.from('test_scores').select('score').eq('test_id', t.id)
      let scoreList = (sc??[]).map(x=>x.score)

      if(scoreList.length===0){
        // fallback: record_test_items
        const { data: items } = await supabase.from('record_test_items').select('t_score,t_cor,t_total').eq('test_id', t.id)
        scoreList = (items??[]).map((x:any)=> x.t_score ? x.t_score : (x.t_total>0?Math.round(x.t_cor/x.t_total*100):0))
      }

      if(scoreList.length===0){
        stats[t.id] = { cnt:0, avg:0, max:0, min:0, dist:[0,0,0,0,0,0,0] }
        continue
      }

      const avg = Math.round(scoreList.reduce((a,b)=>a+b,0)/scoreList.length)
      const max = Math.max(...scoreList)
      const min = Math.min(...scoreList)
      // 7개 구간 분포 (0~100점을 7등분)
      const dist = [0,0,0,0,0,0,0]
      for(const s of scoreList){
        const idx = Math.min(6, Math.floor(s/(100/7)))
        dist[idx]++
      }
      stats[t.id] = { cnt: scoreList.length, avg, max, min, dist }
    }
    setTestStats(stats)
  }

  async function fetchAll() {
    setLoading(true)
    const [{data:t},{data:s}] = await Promise.all([
      supabase.from('tests').select('*').order('date',{ascending:false}),
      supabase.from('students').select('id,name,school').order('name'),
    ])
    setTests(t??[])
    setStudents(s??[])
    setLoading(false)
  }

  async function fetchScores(testId:number) {
    // test_scores 먼저 시도
    const { data: sc, error } = await supabase
      .from('test_scores')
      .select('*, students(name,school)')
      .eq('test_id', testId)
      .order('score',{ascending:false})

    if (!error && sc && sc.length > 0) {
      setScores(sc)
      return
    }

    // test_scores가 비어있으면 record_test_items에서 집계
    const { data: items } = await supabase
      .from('record_test_items')
      .select('*, records(student_id, date), tests(name)')
      .eq('test_id', testId)

    if (!items || items.length === 0) { setScores([]); return }

    // 학생별 최신 기록으로 집계
    const map = new Map<number, ScoreRow>()
    for (const item of items) {
      const stuId = item.records?.student_id
      if (!stuId) continue
      const stu = students.find(s=>s.id===stuId)
      const total = item.t_total ?? 0
      const cor   = item.t_cor   ?? 0
      const score = item.t_score ?? (total>0 ? Math.round(cor/total*100) : 0)
      if (!map.has(stuId) || score > (map.get(stuId)?.score??0)) {
        map.set(stuId, {
          id: item.id, test_id: testId, student_id: stuId,
          cor, score,
          students: stu ? { name:stu.name, school:stu.school } : null
        })
      }
    }
    const merged = [...map.values()].sort((a,b)=>b.score-a.score)
    setScores(merged)
  }

  function toast(msg:string, ok=true) { setNotif({msg,ok}); setTimeout(()=>setNotif(null),3000) }

  async function openDetail(t:Test) {
    setCurTest(t)
    await fetchScores(t.id)
    setView('detail')
  }

  function openAdd() {
    setEditId(null)
    setForm({ name:'', date:kstDateStr(), total:'' })
    setAddModal(true)
  }
  function openEdit(t:Test, e:React.MouseEvent) {
    e.stopPropagation()
    setEditId(t.id)
    setForm({ name:t.name, date:t.date, total:String(t.total) })
    setAddModal(true)
  }
  async function saveTest() {
    if (!form.name.trim()) return toast('테스트명을 입력하세요.',false)
    if (!form.total || parseInt(form.total)<1) return toast('총 문항 수를 입력하세요.',false)
    setSaving(true)
    const row = { name:form.name.trim(), date:form.date, total:parseInt(form.total) }
    if (editId) {
      await supabase.from('tests').update(row).eq('id',editId)
      if (curTest?.id===editId) setCurTest(p=>p?{...p,...row}:null)
      toast(form.name+' 수정됨')
    } else {
      await supabase.from('tests').insert(row)
      toast(form.name+' 생성됨')
    }
    setSaving(false); setAddModal(false)
    await fetchAll()
  }
  async function delTest(t:Test, e:React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`"${t.name}" 테스트를 삭제하시겠습니까?`)) return
    await supabase.from('tests').delete().eq('id',t.id)
    if (curTest?.id===t.id) { setView('list'); setCurTest(null) }
    toast(t.name+' 삭제됨',false)
    await fetchAll()
  }

  function openEditSc(sc: ScoreRow) {
    setEditSc({ row: sc, cor: String(sc.cor), score: '' })
  }
  async function saveEditedSc() {
    if (!editSc || !curTest) return
    setSaving(true)
    const cor        = parseInt(editSc.cor)   || 0
    const scoreInput = parseInt(editSc.score) || 0
    const autoScore  = scoreInput || (curTest.total > 0 ? Math.round(cor / curTest.total * 100) : 0)
    const studentId  = editSc.row.student_id
    await supabase.from('test_scores')
      .upsert({ test_id: curTest.id, student_id: studentId, cor, score: autoScore },
               { onConflict: 'test_id,student_id' })
    const { data: stuRecs } = await supabase.from('records').select('id').eq('student_id', studentId)
    if (stuRecs && stuRecs.length > 0) {
      await supabase.from('record_test_items')
        .update({ t_cor: cor, t_score: autoScore })
        .in('record_id', stuRecs.map(r => r.id))
        .eq('test_id', curTest.id)
    }
    setSaving(false); setEditSc(null)
    toast('성적 수정됨')
    await fetchScores(curTest.id)
  }
  async function deleteSc(sc: ScoreRow) {
    if (!curTest || !confirm(`${sc.students?.name ?? '이 학생'}의 성적을 삭제하시겠습니까?`)) return
    await supabase.from('test_scores').delete().eq('test_id', curTest.id).eq('student_id', sc.student_id)
    const { data: stuRecs } = await supabase.from('records').select('id').eq('student_id', sc.student_id)
    if (stuRecs && stuRecs.length > 0) {
      await supabase.from('record_test_items').delete()
        .in('record_id', stuRecs.map(r => r.id)).eq('test_id', curTest.id)
    }
    toast('성적 삭제됨', false)
    await fetchScores(curTest.id)
  }

  // ── 달력 state ──
  const [calYear,  setCalYear]  = useState(kstNow().getFullYear())
  const [calMonth, setCalMonth] = useState(kstNow().getMonth())
  const [selDate,  setSelDate]  = useState<string|null>(null)

  const todayStr = kstDateStr()
  function prevCal(){ if(calMonth===0){setCalYear(y=>y-1);setCalMonth(11)}else setCalMonth(m=>m-1); setSelDate(null) }
  function nextCal(){ if(calMonth===11){setCalYear(y=>y+1);setCalMonth(0)}else setCalMonth(m=>m+1); setSelDate(null) }

  const testDateSet = new Set(tests.map(t=>t.date))
  const firstDow    = new Date(calYear, calMonth, 1).getDay()
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate()
  const calCells: (number|null)[] = [...Array(firstDow).fill(null), ...Array.from({length:daysInMonth},(_,i)=>i+1)]
  while(calCells.length%7!==0) calCells.push(null)
  const DOW = ['일','월','화','수','목','금','토']

  const filtered = tests.filter(t=>{
    const nameMatch = !search || t.name.includes(search)
    const dateMatch = !selDate || t.date===selDate
    return nameMatch && dateMatch
  })

  const avg = scores.length ? Math.round(scores.reduce((a,b)=>a+b.score,0)/scores.length) : null
  const max = scores.length ? Math.max(...scores.map(x=>x.score)) : null
  const min = scores.length ? Math.min(...scores.map(x=>x.score)) : null

  function buildFreqTable(scoreList: number[]) {
    const bins = Array(11).fill(0)
    for(const s of scoreList) bins[Math.min(10, s>=100?10:Math.floor(s/10))]++
    const n = scoreList.length
    return bins.map((cnt, i) => ({
      range: i===10 ? '90 ~ 100' : `${i*10} ~ ${i*10+9}`,
      cnt,
      rel: n>0 ? Math.round(cnt/n*100) : 0,
    })).reverse()
  }
  function scoreColor(s:number){ return s>=80?gr:s>=60?'#C05621':re }

  // 테스트 관리 메뉴: admin, teacher 모두 전체 기능 (성적 입력/수정/삭제 포함)
  const canManageTests = role ? can.manageTests(role as any) : false

  const css=`
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
    .tc{background:#fff;border:1px solid ${bd};border-radius:10px;padding:16px;cursor:pointer;transition:all .2s;position:relative;overflow:hidden;}
    .tc::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,${navy},${gold});}
    .tc:hover{border-color:${navy};box-shadow:0 3px 14px rgba(13,42,94,.1);transform:translateY(-1px);}
    .bgold{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:none;background:${gold};color:${navyDk};font-family:inherit;}
    .bgold:hover{background:${goldL};}
    .bprim{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:${navy};color:#fff;font-family:inherit;}
    .bprim:hover{background:#1A4080;}
    .bout{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;border:1px solid ${bd};background:transparent;color:${tx2};font-family:inherit;}
    .bout:hover{border-color:${navy};color:${navy};}
    .bdng{display:inline-flex;align-items:center;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;border:none;background:${rbg};color:${re};font-family:inherit;}
    .sbox{display:flex;align-items:center;gap:7px;padding:7px 12px;background:#fff;border:1px solid ${bd};border-radius:8px;}
    .sbox input{border:none;outline:none;font-size:13px;font-family:inherit;color:${tx};background:transparent;width:100%;}
    .badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:500;}
    .fi{width:100%;padding:9px 11px;border:1.5px solid ${bd};border-radius:8px;font-size:13px;font-family:inherit;color:${tx};outline:none;background:#fff;transition:border-color .2s;box-sizing:border-box;}
    .fi:focus{border-color:${navy};}
    .lb{display:block;font-size:12px;font-weight:500;color:${tx2};margin-bottom:5px;}
    .bc{font-size:12px;color:${tx3};margin-bottom:14px;display:flex;align-items:center;gap:5px;}
    .bc span{cursor:pointer;color:${tx2};}
    .bc span:last-child{color:${tx};font-weight:500;cursor:default;}
    .fsel{padding:7px 11px;border:1px solid ${bd};border-radius:8px;font-size:12px;font-family:inherit;color:${tx2};background:#fff;outline:none;cursor:pointer;}
    table{width:100%;border-collapse:collapse;}
    th{padding:9px 12px;text-align:left;font-size:11px;font-weight:600;color:${tx3};letter-spacing:.5px;background:${bg};border-bottom:1px solid ${bd};}
    td{padding:10px 12px;border-bottom:1px solid ${bd};font-size:13px;color:${tx};}
    tr:last-child td{border-bottom:none;}
    tr:hover td{background:${navyM};}
    .rank1{background:linear-gradient(135deg,#FFD700,#FFA500);color:#5a3a00;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;}
    .rank2{background:linear-gradient(135deg,#C0C0C0,#A8A8A8);color:#3a3a3a;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;}
    .rank3{background:linear-gradient(135deg,#CD7F32,#A0522D);color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;}
    .rankn{background:${navyM};color:${navy};width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;flex-shrink:0;}
    .pb{height:8px;background:${bd};border-radius:99px;flex:1;}
    .pf{height:100%;border-radius:99px;}
    .stat-card{background:#fff;border-radius:12px;border:1px solid ${bd};padding:18px 22px;box-shadow:0 1px 4px rgba(0,0,0,.06);}
  `

  return (
    <div style={{padding:'28px 32px',fontFamily:"'Noto Sans KR',sans-serif"}}>
      <style>{css}</style>

      {notif&&(
        <div style={{position:'fixed',top:18,right:18,zIndex:9999,background:'#fff',borderRadius:8,padding:'11px 14px',borderLeft:`4px solid ${notif.ok?gr:re}`,boxShadow:'0 4px 18px rgba(0,0,0,.1)',minWidth:200}}>
          <div style={{fontWeight:600,marginBottom:2,color:tx,fontSize:13}}>{notif.ok?'완료':'알림'}</div>
          <div style={{fontSize:12,color:tx2}}>{notif.msg}</div>
        </div>
      )}

      {/* ════ 테스트 목록 ════ */}
      {view==='list'&&<>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
          <div>
            <h1 style={{fontSize:21,fontWeight:700,color:tx}}>테스트 관리</h1>
            <p style={{fontSize:13,color:tx2,marginTop:4}}>날짜를 클릭하면 해당일 테스트를 확인합니다</p>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'280px 1fr',gap:16,alignItems:'start'}}>

          {/* 달력 */}
          <div style={{background:'#fff',borderRadius:12,border:`1px solid ${bd}`,padding:16,boxShadow:'0 1px 4px rgba(0,0,0,.06)',position:'sticky',top:16}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
              <button onClick={prevCal} style={{background:'none',border:'none',cursor:'pointer',color:tx3,fontSize:18,padding:'2px 8px'}}>‹</button>
              <span style={{fontSize:14,fontWeight:700,color:tx}}>{calYear}년 {calMonth+1}월</span>
              <button onClick={nextCal} style={{background:'none',border:'none',cursor:'pointer',color:tx3,fontSize:18,padding:'2px 8px'}}>›</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:4}}>
              {DOW.map((d,i)=>(
                <div key={d} style={{textAlign:'center',fontSize:10,fontWeight:600,color:i===0?re:i===6?navy:tx3,padding:'3px 0'}}>{d}</div>
              ))}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2}}>
              {calCells.map((day,idx)=>{
                if(!day) return <div key={idx}/>
                const ds=`${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                const hasTest=testDateSet.has(ds)
                const isSel=ds===selDate
                const isToday=ds===todayStr
                const dow=idx%7
                return(
                  <button key={idx} onClick={()=>setSelDate(isSel?null:ds)}
                    style={{
                      position:'relative',padding:'5px 0 8px',border:'none',
                      borderRadius:6,cursor:'pointer',textAlign:'center',
                      background:isSel?gold:isToday?navy:'transparent',
                      color:isSel||isToday?'#fff':dow===0?re:dow===6?navy:tx,
                      fontSize:12,fontWeight:isSel||isToday?700:400,fontFamily:'inherit',
                    }}>
                    {day}
                    {hasTest&&<span style={{position:'absolute',bottom:2,left:'50%',transform:'translateX(-50%)',width:4,height:4,borderRadius:'50%',background:isSel||isToday?'rgba(255,255,255,.8)':gold,display:'block'}}/>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 오른쪽: 검색 + 목록 */}
          <div>
            <div style={{display:'flex',gap:9,alignItems:'center',marginBottom:12}}>
              <div className="sbox" style={{flex:1}}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={tx3}><circle cx="11" cy="11" r="8" strokeWidth={2}/><path strokeWidth={2} d="M21 21l-4.35-4.35"/></svg>
                <input placeholder="테스트명 검색..." value={search} onChange={e=>setSearch(e.target.value)}/>
              </div>
              {selDate&&<button onClick={()=>setSelDate(null)} style={{fontSize:12,color:tx2,background:'none',border:`1px solid ${bd}`,borderRadius:8,padding:'6px 12px',cursor:'pointer',fontFamily:'inherit',flexShrink:0}}>전체 보기</button>}
              <span style={{fontSize:12,color:tx3,flexShrink:0}}>{filtered.length}개</span>
            </div>

            {loading?(
              <p style={{color:tx3,fontSize:13}}>불러오는 중...</p>
            ):(
              <div style={{background:'#fff',borderRadius:12,border:`1px solid ${bd}`,overflow:'hidden',boxShadow:'0 1px 4px rgba(0,0,0,.06)'}}>
                {selDate&&(
                  <div style={{padding:'10px 16px',borderBottom:`1px solid ${bd}`,fontSize:13,fontWeight:700,color:tx,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    📋 {selDate} 테스트
                    <span style={{fontSize:12,color:tx3,fontWeight:400}}>{filtered.length}건</span>
                  </div>
                )}
                {filtered.length===0?(
                  <div style={{padding:'50px 0',textAlign:'center',color:tx3}}>
                    <p style={{fontSize:28,marginBottom:8}}>📋</p>
                    <p style={{fontSize:14}}>{selDate?'이 날짜에 테스트가 없습니다':'등록된 테스트가 없습니다'}</p>
                  </div>
                ):filtered.map((t,idx)=>{
                  const stat=testStats[t.id]
                  const hasData=stat&&stat.cnt>0
                  return(
                    <div key={t.id}
                      style={{display:'flex',alignItems:'center',gap:12,padding:'13px 16px',borderBottom:idx<filtered.length-1?`1px solid ${bg}`:'none',cursor:'pointer',transition:'background .12s'}}
                      onMouseEnter={e=>(e.currentTarget.style.background=navyM)}
                      onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
                      onClick={()=>openDetail(t)}
                    >
                      <div style={{width:36,height:36,borderRadius:8,background:navyM,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke={navy} strokeWidth={2}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2"/></svg>
                      </div>
                      <div style={{flex:1}}>
                        <p style={{fontSize:13,fontWeight:600,color:tx,margin:0}}>{t.name}</p>
                        <p style={{fontSize:11,color:tx3,margin:0}}>{t.date} · {t.total}문항 · 응시 {stat?.cnt??0}명</p>
                      </div>
                      {hasData?(
                        <div style={{textAlign:'right',flexShrink:0}}>
                          <div style={{fontSize:13,fontWeight:700,color:gold}}>평균 {stat.avg}점</div>
                          <div style={{fontSize:11,color:tx3}}>최고 {stat.max} / 최저 {stat.min}</div>
                        </div>
                      ):(
                        <span style={{fontSize:12,color:tx3,flexShrink:0}}>성적 미입력</span>
                      )}
                      {canManageTests&&(
                        <div style={{display:'flex',gap:5,flexShrink:0}} onClick={e=>e.stopPropagation()}>
                          <button className="bout" onClick={e=>openEdit(t,e)}>편집</button>
                          <button className="bdng" onClick={e=>delTest(t,e)}>삭제</button>
                        </div>
                      )}
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={tx3} style={{flexShrink:0}}><path strokeWidth={2} d="M9 18l6-6-6-6"/></svg>
                    </div>
                  )
                })}
                {/* 테스트 추가 행 */}
                {canManageTests&&(
                  <div onClick={openAdd}
                    style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:14,color:tx3,cursor:'pointer',borderTop:`1px dashed ${bd}`,fontSize:13,transition:'all .15s'}}
                    onMouseEnter={e=>{(e.currentTarget as HTMLDivElement).style.color=navy;(e.currentTarget as HTMLDivElement).style.background=navyM}}
                    onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.color=tx3;(e.currentTarget as HTMLDivElement).style.background='transparent'}}
                  >
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M12 5v14M5 12h14"/></svg>
                    테스트 추가
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </>}

      {/* ════ 테스트 상세 ════ */}
      {view==='detail'&&curTest&&<>
        <div className="bc">
          <span onClick={()=>setView('list')}>테스트 관리</span>
          <span>›</span>
          <span>{curTest.name}</span>
        </div>

        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
          <div>
            <h1 style={{fontSize:21,fontWeight:700,color:tx}}>{curTest.name}</h1>
            <p style={{fontSize:13,color:tx2,marginTop:4}}>{curTest.date} · 총 {curTest.total}문항 · 응시 {scores.length}명</p>
          </div>
          <div/>
        </div>

        {scores.length===0?(
          <div style={{background:'#fff',borderRadius:12,border:`1px solid ${bd}`,padding:'60px 0',textAlign:'center',color:tx3}}>
            <p style={{fontSize:15,fontWeight:600,color:tx,marginBottom:8}}>아직 입력된 성적이 없어요</p>
            <p style={{fontSize:13,color:tx3}}>테스트 결과 입력을 위해서 수업기록에서 작성을 해주세요</p>
          </div>
        ):null}

        {scores.length>0&&(()=>{
          const freqRows = buildFreqTable(scores.map(s=>s.score))
          return(
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>

              {/* 왼쪽: 요약 + 도수분포표 */}
              <div style={{background:'#fff',borderRadius:12,border:`1px solid ${bd}`,padding:18,boxShadow:'0 1px 4px rgba(0,0,0,.06)'}}>
                {/* 요약 3칸 */}
                <div style={{display:'flex',gap:10,marginBottom:18}}>
                  <div style={{flex:1,background:bg,borderRadius:8,padding:10,textAlign:'center'}}>
                    <p style={{fontSize:10,color:tx3,marginBottom:4}}>평균</p>
                    <p style={{fontSize:20,fontWeight:700,color:gold,margin:0}}>{avg}점</p>
                  </div>
                  <div style={{flex:1,background:bg,borderRadius:8,padding:10,textAlign:'center'}}>
                    <p style={{fontSize:10,color:tx3,marginBottom:4}}>최고점</p>
                    <p style={{fontSize:20,fontWeight:700,color:gr,margin:0}}>{max}점</p>
                  </div>
                  <div style={{flex:1,background:bg,borderRadius:8,padding:10,textAlign:'center'}}>
                    <p style={{fontSize:10,color:tx3,marginBottom:4}}>최저점</p>
                    <p style={{fontSize:20,fontWeight:700,color:re,margin:0}}>{min}점</p>
                  </div>
                </div>

                {/* 도수분포표 */}
                <p style={{fontSize:11,fontWeight:600,color:tx3,marginBottom:10,letterSpacing:'.5px'}}>📊 도수분포표</p>
                <div style={{border:`1px solid ${bd}`,borderRadius:8,overflow:'hidden'}}>
                  <div style={{display:'grid',gridTemplateColumns:'88px 48px 56px 1fr',background:bg,padding:'6px 12px',borderBottom:`1px solid ${bd}`}}>
                    <span style={{fontSize:10,fontWeight:600,color:tx3}}>계급 (점)</span>
                    <span style={{fontSize:10,fontWeight:600,color:tx3,textAlign:'center'}}>도수 (명)</span>
                    <span style={{fontSize:10,fontWeight:600,color:tx3,textAlign:'center'}}>상대도수</span>
                    <span/>
                  </div>
                  {freqRows.map((row, i) => {
                    const barPct = scores.length>0 ? (row.cnt/scores.length)*100 : 0
                    return (
                      <div key={i} style={{display:'grid',gridTemplateColumns:'88px 48px 56px 1fr',alignItems:'center',padding:'5px 12px',borderBottom:i<freqRows.length-1?`1px solid ${bg}`:'none'}}>
                        <span style={{fontSize:12,color:tx}}>{row.range}</span>
                        <span style={{fontSize:12,fontWeight:row.cnt>0?700:400,color:row.cnt>0?tx:tx3,textAlign:'center'}}>{row.cnt}</span>
                        <span style={{fontSize:11,color:tx2,textAlign:'center'}}>{row.rel}%</span>
                        <div style={{paddingLeft:8}}>
                          {row.cnt>0&&<div style={{height:8,width:`${Math.max(4,barPct)}%`,background:navy,borderRadius:2,opacity:.55}}/>}
                        </div>
                      </div>
                    )
                  })}
                  <div style={{display:'grid',gridTemplateColumns:'88px 48px 56px 1fr',padding:'6px 12px',background:bg,borderTop:`1px solid ${bd}`}}>
                    <span style={{fontSize:11,fontWeight:700,color:tx}}>합계</span>
                    <span style={{fontSize:11,fontWeight:700,color:tx,textAlign:'center'}}>{scores.length}</span>
                    <span style={{fontSize:11,fontWeight:700,color:tx,textAlign:'center'}}>100%</span>
                    <span/>
                  </div>
                </div>
              </div>

              {/* 오른쪽: 순위 목록 */}
              <div style={{background:'#fff',borderRadius:12,border:`1px solid ${bd}`,overflow:'hidden',boxShadow:'0 1px 4px rgba(0,0,0,.06)'}}>
                <div style={{padding:'12px 16px',borderBottom:`1px solid ${bd}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <span style={{fontSize:13,fontWeight:700,color:tx}}>🏆 학생 순위</span>
                  <span style={{fontSize:12,color:tx3,fontWeight:400}}>{scores.length}명</span>
                </div>
                {/* 헤더 */}
                <div style={{display:'flex',alignItems:'center',gap:10,padding:'8px 16px',background:bg,borderBottom:`1px solid ${bd}`,fontSize:10,fontWeight:600,color:tx3}}>
                  <div style={{width:28,flexShrink:0,textAlign:'center'}}>순위</div>
                  <div style={{flex:1}}>이름</div>
                  <div style={{width:64,textAlign:'center'}}>맞은 개수</div>
                  <div style={{width:50,textAlign:'center'}}>정답률</div>
                  <div style={{width:50,textAlign:'right'}}>점수</div>
                  {canManageTests&&<div style={{width:80,textAlign:'right'}}>관리</div>}
                </div>
                <div style={{overflowY:'auto',maxHeight:380}}>
                {scores.map((sc,i)=>{
                  const pct=curTest.total>0?Math.round(sc.cor/curTest.total*100):0
                  const rank=scores.filter(x=>x.score>sc.score).length+1
                  const rankStyle:{background:string;color:string}=
                    rank===1?{background:'linear-gradient(135deg,#FFD700,#FFA500)',color:'#5a3a00'}
                    :rank===2?{background:'linear-gradient(135deg,#C0C0C0,#A8A8A8)',color:'#3a3a3a'}
                    :rank===3?{background:'linear-gradient(135deg,#CD7F32,#A0522D)',color:'#fff'}
                    :{background:navyM,color:navy}
                  return(
                    <div key={sc.id??i}
                      style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',borderBottom:`1px solid ${bg}`,transition:'background .12s'}}
                      onMouseEnter={e=>(e.currentTarget.style.background=navyM)}
                      onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
                    >
                      <div style={{width:28,height:28,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0,...rankStyle}}>{rank}</div>
                      <div style={{flex:1,fontSize:13,fontWeight:rank<=3?700:400,color:tx}}>{sc.students?.name??'-'}</div>
                      <div style={{width:64,textAlign:'center',fontSize:12,color:tx2}}>{sc.cor}/{curTest.total}</div>
                      <div style={{width:50,textAlign:'center'}}>
                        <span style={{fontSize:11,fontWeight:600,color:pct>=80?gr:pct>=60?'#C05621':re}}>{pct}%</span>
                      </div>
                      <div style={{width:50,textAlign:'right',fontSize:14,fontWeight:700,color:scoreColor(sc.score)}}>{sc.score}점</div>
                      {canManageTests&&(
                        <div style={{width:80,display:'flex',gap:4,justifyContent:'flex-end'}}>
                          <button className="bout" style={{padding:'3px 8px',fontSize:11}} onClick={()=>openEditSc(sc)}>수정</button>
                          <button className="bdng" style={{padding:'3px 8px',fontSize:11}} onClick={()=>deleteSc(sc)}>삭제</button>
                        </div>
                      )}
                    </div>
                  )
                })}
                </div>
              </div>
            </div>
          )
        })()}
      </>}

      {/* ════ 테스트 추가/수정 모달 ════ */}
      {addModal&&(
        <div onClick={()=>setAddModal(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.42)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:12,width:460,maxWidth:'100%',boxShadow:'0 20px 60px rgba(0,0,0,.15)'}}>
            <div style={{padding:'18px 22px 0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:15,fontWeight:600,color:tx}}>{editId?'테스트 편집':'테스트 추가'}</span>
              <button onClick={()=>setAddModal(false)} style={{width:28,height:28,borderRadius:'50%',border:'none',background:bg,cursor:'pointer',fontSize:17,color:tx2}}>×</button>
            </div>
            <div style={{padding:'18px 22px'}}>
              <div style={{marginBottom:14}}>
                <label className="lb">테스트명</label>
                <input className="fi" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="예) 2학년 1학기 중간 단원평가"/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div>
                  <label className="lb">날짜</label>
                  <input type="date" className="fi" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/>
                </div>
                <div>
                  <label className="lb">총 문항 수</label>
                  <input type="number" className="fi" min={1} value={form.total} onChange={e=>setForm(f=>({...f,total:e.target.value}))} placeholder="예) 20" style={{textAlign:'center'}}/>
                </div>
              </div>
            </div>
            <div style={{padding:'0 22px 18px',display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>setAddModal(false)} style={{padding:'8px 16px',borderRadius:8,fontSize:13,border:`1px solid ${bd}`,background:'#fff',cursor:'pointer',color:tx2,fontFamily:'inherit'}}>취소</button>
              <button className="bgold" onClick={saveTest} disabled={saving} style={{opacity:saving?0.7:1}}>{saving?'저장 중...':'저장'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ 개별 성적 수정 모달 ════ */}
      {editSc&&curTest&&(
        <div onClick={()=>setEditSc(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.42)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:12,width:440,maxWidth:'100%',boxShadow:'0 20px 60px rgba(0,0,0,.15)'}}>
            <div style={{padding:'18px 22px 0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <span style={{fontSize:15,fontWeight:600,color:tx}}>{editSc.row.students?.name} 성적 수정</span>
                <p style={{fontSize:12,color:tx3,marginTop:2}}>{curTest.name} · 총 {curTest.total}문항</p>
              </div>
              <button onClick={()=>setEditSc(null)} style={{width:28,height:28,borderRadius:'50%',border:'none',background:bg,cursor:'pointer',fontSize:17,color:tx2}}>×</button>
            </div>
            <div style={{padding:'18px 22px'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div>
                  <label className="lb">정답 수</label>
                  <input type="number" className="fi" min={0} max={curTest.total}
                    value={editSc.cor}
                    onChange={e=>setEditSc(p=>p?{...p,cor:e.target.value}:null)}
                    style={{textAlign:'center'}}/>
                </div>
                <div>
                  <label className="lb">점수 <span style={{fontSize:11,color:'#7B8AA0'}}>(미입력 시 자동 계산)</span></label>
                  <input type="number" className="fi" min={0} max={100}
                    value={editSc.score}
                    placeholder={`${curTest.total>0?Math.round((parseInt(editSc.cor)||0)/curTest.total*100):0}`}
                    onChange={e=>setEditSc(p=>p?{...p,score:e.target.value}:null)}
                    style={{textAlign:'center'}}/>
                </div>
              </div>
            </div>
            <div style={{padding:'0 22px 18px',display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>setEditSc(null)} style={{padding:'8px 16px',borderRadius:8,fontSize:13,border:`1px solid ${bd}`,background:'#fff',cursor:'pointer',color:tx2,fontFamily:'inherit'}}>취소</button>
              <button className="bprim" onClick={saveEditedSc} disabled={saving} style={{opacity:saving?0.7:1}}>{saving?'저장 중...':'저장'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
