'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

type Student = { id:number; name:string; birth_year:number; school:string }
type Class_  = { id:number; name:string }
type Rec = {
  id:number; student_id:number; date:string
  content:string; homework:string
  hw_rate:number; hw_cor:number; attitude:number
  late:boolean; has_test:boolean; feedback:string
  record_test_items?: { test_id:number; t_total:number; t_cor:number; t_score:number; tests:{name:string}|null }[]
}

const navy='#0D2A5E', navyDk='#071A3E', navyM='#E8EEF8'
const gold='#D87E13', goldL='#F09830'
const bg='#F5F7FA', bd='#DDE3EE'
const tx='#0D1B36', tx2='#4B5C7E', tx3='#96A4BF'
const re='#C0392B', rbg='#FDECEA', gr='#1A7F4E', gbg='#E0F5EB'

function rateColor(v:number){ return v>=80?'#1A7F4E':v>=60?'#C05621':'#C0392B' }
function rateBg(v:number){    return v>=80?'#E0F5EB':v>=60?'#FEF3E2':'#FDECEA' }
function ageOf(b:number){ return new Date().getFullYear()-b+1 }

export default function StatsPage(){
  const [students, setStudents] = useState<Student[]>([])
  const [classes,  setClasses]  = useState<Class_[]>([])
  const [csMap,    setCsMap]    = useState<Record<number,number>>({})
  const [search,   setSearch]   = useState('')
  const [selStu,   setSelStu]   = useState<Student|null>(null)
  const [recs,     setRecs]     = useState<Rec[]>([])
  const [loading,  setLoading]  = useState(false)

  useEffect(()=>{ fetchBase() },[])

  async function fetchBase(){
    const [{data:s},{data:c},{data:cs}] = await Promise.all([
      supabase.from('students').select('id,name,birth_year,school').order('name'),
      supabase.from('classes').select('id,name').order('name'),
      supabase.from('class_students').select('student_id,class_id'),
    ])
    setStudents(s??[])
    setClasses(c??[])
    const map:Record<number,number>={}
    for(const r of(cs??[]))map[r.student_id]=r.class_id
    setCsMap(map)
  }

  async function selectStu(s:Student){
    setSelStu(s)
    setLoading(true)

    // 1. records 기본 조회
    const{data:recsData}=await supabase
      .from('records')
      .select('*')
      .eq('student_id',s.id)
      .eq('is_draft',false)
      .order('date',{ascending:true})

    if(!recsData||recsData.length===0){ setRecs([]); setLoading(false); return }

    // 2. record_test_items 별도 조회 (join RLS 우회)
    const recIds=recsData.map(r=>r.id)
    const{data:items}=await supabase
      .from('record_test_items')
      .select('id,record_id,test_id,t_total,t_cor,t_score')
      .in('record_id',recIds)

    // 3. tests 이름 조회
    const testIds=[...new Set((items??[]).map((x:any)=>x.test_id))]
    let testsMap:Record<number,string>={}
    if(testIds.length>0){
      const{data:testsData}=await supabase.from('tests').select('id,name').in('id',testIds)
      for(const t of(testsData??[]))testsMap[t.id]=t.name
    }

    // 4. record_id별 그룹화
    const itemsByRecord:Record<number,any[]>={}
    for(const item of(items??[])){
      if(!itemsByRecord[item.record_id])itemsByRecord[item.record_id]=[]
      itemsByRecord[item.record_id].push({
        test_id:item.test_id, t_total:item.t_total, t_cor:item.t_cor, t_score:item.t_score,
        tests:{name:testsMap[item.test_id]??''},
      })
    }

    const merged=recsData.map(r=>({...r,record_test_items:itemsByRecord[r.id]??[]}))
    setRecs(merged as Rec[])
    setLoading(false)
  }

  function clearStu(){ setSelStu(null); setRecs([]); setSearch('') }

  const filtered = students.filter(s=>s.name.includes(search))

  // 통계 계산
  const hwRecs   = recs.filter(r=>r.hw_rate>=0)
  const corRecs  = recs.filter(r=>r.hw_cor>=0)
  const avgHwRate = hwRecs.length ? Math.round(hwRecs.reduce((a,b)=>a+b.hw_rate,0)/hwRecs.length) : null
  const avgHwCor  = corRecs.length ? Math.round(corRecs.reduce((a,b)=>a+b.hw_cor,0)/corRecs.length) : null
  const lateCnt   = recs.filter(r=>r.late).length

  // 차트 데이터
  const chartData = recs.map(r=>({
    date: r.date.slice(5),
    hwRate: r.hw_rate>=0 ? r.hw_rate : null,
    hwCor:  r.hw_cor>=0  ? r.hw_cor  : null,
  }))

  // 시험 응시 목록 (날짜 최신순)
  const testRecs = recs
    .filter(r=>r.has_test && (r.record_test_items??[]).length>0)
    .sort((a,b)=>b.date.localeCompare(a.date))

  // 수업 기록 목록 (최신순)
  const sortedRecs = [...recs].sort((a,b)=>b.date.localeCompare(a.date))

  const css=`
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
    .sbox{display:flex;align-items:center;gap:7px;padding:9px 14px;background:#fff;border:1px solid ${bd};border-radius:10px;}
    .sbox input{border:none;outline:none;font-size:14px;font-family:inherit;color:${tx};background:transparent;width:100%;}
    .ssl-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;cursor:pointer;transition:background .15s;}
    .ssl-item:hover{background:${navyM};}
    .sav{width:36px;height:36px;border-radius:50%;background:${navyM};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:${navy};flex-shrink:0;}
    .bout{display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border-radius:8px;font-size:12px;cursor:pointer;border:1px solid ${bd};background:transparent;color:${tx2};font-family:inherit;}
    .bout:hover{border-color:${navy};color:${navy};}
    .stat-card{background:'#fff';border-radius:10px;border:1px solid ${bd};padding:14px 16px;}
    .pb{height:6px;background:${bd};border-radius:99px;}
    .pf{height:100%;border-radius:99px;}
    .rc{background:#fff;border:1px solid ${bd};border-radius:10px;padding:16px;margin-bottom:10px;}
    .rch{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid ${bd};}
    .badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:500;}
    .fb{background:rgba(13,42,94,.05);border-left:3px solid ${navy};border-radius:0 8px 8px 0;padding:10px 12px;margin-top:10px;}
    .fdv{font-size:11px;font-weight:600;color:${tx3};letter-spacing:1px;margin-bottom:8px;}
  `

  return (
    <div style={{padding:'28px 32px',fontFamily:"'Noto Sans KR',sans-serif"}}>
      <style>{css}</style>

      <div style={{marginBottom:20}}>
        <h1 style={{fontSize:21,fontWeight:700,color:tx}}>통계</h1>
        <p style={{fontSize:13,color:tx2,marginTop:4}}>학생별 성취도 분석</p>
      </div>

      {/* ════ 좌측 고정 사이드바 + 우측 본문 ════ */}
      <div style={{display:'grid',gridTemplateColumns:'280px 1fr',gap:16,alignItems:'start'}}>

        {/* 좌측: 학생 검색 + 목록 (항상 고정) */}
        <div style={{background:'#fff',borderRadius:12,border:`1px solid ${bd}`,padding:16,boxShadow:'0 1px 4px rgba(0,0,0,.06)',position:'sticky',top:16}}>
          <div className="sbox" style={{marginBottom:12}}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={tx3}><circle cx="11" cy="11" r="8" strokeWidth={2}/><path strokeWidth={2} d="M21 21l-4.35-4.35"/></svg>
            <input placeholder="학생 이름 검색..." value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <div style={{maxHeight:'calc(100vh - 220px)',overflowY:'auto'}}>
            {filtered.length===0?(
              <p style={{textAlign:'center',color:tx3,fontSize:13,padding:'30px 0'}}>검색 결과가 없습니다</p>
            ):filtered.map(s=>{
              const cls=classes.find(c=>c.id===csMap[s.id])
              const isSel=selStu?.id===s.id
              return(
                <div key={s.id} className="ssl-item" onClick={()=>selectStu(s)}
                  style={{background:isSel?navyM:undefined,border:isSel?`1px solid ${navy}33`:'1px solid transparent'}}>
                  <div className="sav" style={isSel?{background:navy,color:'#fff'}:undefined}>{s.name[0]}</div>
                  <div>
                    <p style={{fontSize:13,fontWeight:600,color:isSel?navy:tx}}>{s.name}</p>
                    <span style={{fontSize:11,color:tx3}}>{s.school}{cls?' · '+cls.name:''}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 우측: 선택된 학생 본문 */}
        <div>
          {!selStu?(
            <div style={{background:'#fff',borderRadius:12,border:`1px solid ${bd}`,padding:'80px 0',textAlign:'center',color:tx3}}>
              <p style={{fontSize:36,marginBottom:10}}>👈</p>
              <p style={{fontSize:14}}>왼쪽에서 학생을 선택해주세요</p>
            </div>
          ):(
            <>
              {/* 헤더 카드 */}
              <div style={{background:'#fff',borderRadius:12,border:`1px solid ${bd}`,padding:18,marginBottom:14,boxShadow:'0 1px 4px rgba(0,0,0,.06)'}}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
                  <div className="sav" style={{width:42,height:42,fontSize:16}}>{selStu.name[0]}</div>
                  <div>
                    <p style={{fontSize:15,fontWeight:700,color:tx}}>{selStu.name}</p>
                    <span style={{fontSize:12,color:tx3}}>
                      {selStu.school} · {ageOf(selStu.birth_year)}세
                      {classes.find(c=>c.id===csMap[selStu.id])?' · '+classes.find(c=>c.id===csMap[selStu.id])!.name:''}
                    </span>
                  </div>
                </div>

                {/* 통계 요약 4칸 */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
                  <div className="stat-card" style={{background:'#fff'}}>
                    <p style={{fontSize:11,color:tx3,marginBottom:8}}>숙제 이행률 평균</p>
                    <p style={{fontSize:22,fontWeight:700,color:avgHwRate!=null?rateColor(avgHwRate):tx3,marginBottom:8}}>
                      {avgHwRate!=null?avgHwRate+'%':'-'}
                    </p>
                    <div className="pb"><div className="pf" style={{width:(avgHwRate??0)+'%',background:avgHwRate!=null?rateColor(avgHwRate):bd}}/></div>
                  </div>
                  <div className="stat-card" style={{background:'#fff'}}>
                    <p style={{fontSize:11,color:tx3,marginBottom:8}}>숙제 정답률 평균</p>
                    <p style={{fontSize:22,fontWeight:700,color:avgHwCor!=null?rateColor(avgHwCor):tx3,marginBottom:8}}>
                      {avgHwCor!=null?avgHwCor+'%':'-'}
                    </p>
                    <div className="pb"><div className="pf" style={{width:(avgHwCor??0)+'%',background:avgHwCor!=null?rateColor(avgHwCor):bd}}/></div>
                  </div>
                  <div className="stat-card" style={{background:'#fff'}}>
                    <p style={{fontSize:11,color:tx3,marginBottom:8}}>지각 횟수</p>
                    <p style={{fontSize:22,fontWeight:700,color:lateCnt>0?re:tx}}>{lateCnt}<span style={{fontSize:13,fontWeight:400,color:tx2}}>회</span></p>
                  </div>
                  <div className="stat-card" style={{background:'#fff'}}>
                    <p style={{fontSize:11,color:tx3,marginBottom:8}}>수업 기록 수</p>
                    <p style={{fontSize:22,fontWeight:700,color:navy}}>{recs.length}<span style={{fontSize:13,fontWeight:400,color:tx2}}>개</span></p>
                  </div>
                </div>
              </div>

              {loading?(
                <p style={{textAlign:'center',color:tx3,padding:'40px 0'}}>불러오는 중...</p>
              ):recs.length===0?(
                <div style={{background:'#fff',borderRadius:12,border:`1px solid ${bd}`,padding:'60px 0',textAlign:'center',color:tx3}}>
                  <p style={{fontSize:32,marginBottom:8}}>📭</p>
                  <p style={{fontSize:14}}>수업 기록이 없습니다</p>
                </div>
              ):(
                <>
                  {/* 꺾은선 그래프 2개 */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
                    <div style={{background:'#fff',borderRadius:12,border:`1px solid ${bd}`,padding:18,boxShadow:'0 1px 4px rgba(0,0,0,.06)'}}>
                      <div style={{fontSize:13,fontWeight:600,color:tx,marginBottom:12}}>숙제 이행률 추이</div>
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={chartData} margin={{top:10,right:10,left:-15,bottom:0}}>
                          <CartesianGrid strokeDasharray="3 3" stroke={bd}/>
                          <XAxis dataKey="date" tick={{fontSize:10,fill:tx3}} axisLine={{stroke:bd}}/>
                          <YAxis domain={[0,100]} tick={{fontSize:10,fill:tx3}} axisLine={{stroke:bd}}/>
                          <Tooltip formatter={(v:any)=>v+'%'} contentStyle={{fontSize:12,borderRadius:8,border:`1px solid ${bd}`}}/>
                          <Line type="monotone" dataKey="hwRate" stroke={navy} strokeWidth={2.5} dot={{r:4,fill:navy}} connectNulls/>
                        </LineChart>
                      </ResponsiveContainer>
                      <div style={{display:'flex',alignItems:'center',gap:6,marginTop:6}}>
                        <div style={{width:8,height:8,borderRadius:'50%',background:navy}}/>
                        <span style={{fontSize:12,color:tx2}}>이행률</span>
                      </div>
                    </div>
                    <div style={{background:'#fff',borderRadius:12,border:`1px solid ${bd}`,padding:18,boxShadow:'0 1px 4px rgba(0,0,0,.06)'}}>
                      <div style={{fontSize:13,fontWeight:600,color:tx,marginBottom:12}}>숙제 정답률 추이</div>
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={chartData} margin={{top:10,right:10,left:-15,bottom:0}}>
                          <CartesianGrid strokeDasharray="3 3" stroke={bd}/>
                          <XAxis dataKey="date" tick={{fontSize:10,fill:tx3}} axisLine={{stroke:bd}}/>
                          <YAxis domain={[0,100]} tick={{fontSize:10,fill:tx3}} axisLine={{stroke:bd}}/>
                          <Tooltip formatter={(v:any)=>v+'%'} contentStyle={{fontSize:12,borderRadius:8,border:`1px solid ${bd}`}}/>
                          <Line type="monotone" dataKey="hwCor" stroke={gold} strokeWidth={2.5} dot={{r:4,fill:gold}} connectNulls/>
                        </LineChart>
                      </ResponsiveContainer>
                      <div style={{display:'flex',alignItems:'center',gap:6,marginTop:6}}>
                        <div style={{width:8,height:8,borderRadius:'50%',background:gold}}/>
                        <span style={{fontSize:12,color:tx2}}>정답률</span>
                      </div>
                    </div>
                  </div>

                  {/* 응시한 테스트 목록 */}
                  <div style={{background:'#fff',borderRadius:12,border:`1px solid ${bd}`,padding:18,marginBottom:16,boxShadow:'0 1px 4px rgba(0,0,0,.06)'}}>
                    <div style={{fontSize:14,fontWeight:600,color:tx,marginBottom:14}}>📝 응시한 테스트 목록</div>
                    {testRecs.length===0?(
                      <p style={{textAlign:'center',color:tx3,fontSize:13,padding:'20px 0'}}>응시한 테스트가 없습니다</p>
                    ):(
                      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(380px, 1fr))',gap:10}}>
                        <TestList recs={testRecs} studentId={selStu.id}/>
                      </div>
                    )}
                  </div>

                  {/* 전체 수업 기록 목록 */}
                  <div style={{background:'#fff',borderRadius:12,border:`1px solid ${bd}`,padding:18,boxShadow:'0 1px 4px rgba(0,0,0,.06)'}}>
                    <div style={{fontSize:14,fontWeight:600,color:tx,marginBottom:14}}>수업 기록 목록</div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(420px, 1fr))',gap:14}}>
                    {sortedRecs.map(r=>(
                      <div key={r.id} className="rc">
                    <div className="rch">
                      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                        <b style={{fontSize:13,color:tx}}>{r.date}</b>
                        {r.late
                          ?<span className="badge" style={{background:rbg,color:re}}>지각</span>
                          :<span className="badge" style={{background:gbg,color:gr}}>정시</span>
                        }
                        {r.has_test&&<span className="badge" style={{background:navyM,color:navy}}>시험</span>}
                      </div>
                    </div>

                    {/* 이행률/정답률/태도 — 원형 게이지 */}
                    <div style={{display:'flex',gap:8,marginBottom:10}}>
                      <div style={{flex:1,background:bg,borderRadius:10,padding:'8px 10px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                        <div>
                          <p style={{fontSize:11,color:navy,fontWeight:600,margin:'0 0 2px'}}>숙제 이행률</p>
                          {r.hw_rate<0
                            ?<p style={{fontSize:13,color:tx3,margin:0}}>숙제 없음</p>
                            :<p style={{fontSize:18,fontWeight:700,color:rateColor(r.hw_rate),margin:0,lineHeight:1}}>{r.hw_rate}<span style={{fontSize:11,fontWeight:400,color:tx2}}>%</span></p>
                          }
                        </div>
                        {r.hw_rate>=0&&(
                          <svg width="32" height="32" viewBox="0 0 32 32">
                            <circle cx="16" cy="16" r="12.5" fill="none" stroke={bd} strokeWidth={3.2}/>
                            <circle cx="16" cy="16" r="12.5" fill="none" stroke={rateColor(r.hw_rate)} strokeWidth={3.2}
                              strokeDasharray={78.5} strokeDashoffset={78.5*(1-r.hw_rate/100)}
                              strokeLinecap="round" transform="rotate(-90 16 16)"/>
                          </svg>
                        )}
                      </div>
                      <div style={{flex:1,background:bg,borderRadius:10,padding:'8px 10px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                        <div>
                          <p style={{fontSize:11,color:navy,fontWeight:600,margin:'0 0 2px'}}>숙제 정답률</p>
                          {r.hw_cor<0
                            ?<p style={{fontSize:13,color:tx3,margin:0}}>채점 안함</p>
                            :<p style={{fontSize:18,fontWeight:700,color:rateColor(r.hw_cor),margin:0,lineHeight:1}}>{r.hw_cor}<span style={{fontSize:11,fontWeight:400,color:tx2}}>%</span></p>
                          }
                        </div>
                        {r.hw_cor>=0&&(
                          <svg width="32" height="32" viewBox="0 0 32 32">
                            <circle cx="16" cy="16" r="12.5" fill="none" stroke={bd} strokeWidth={3.2}/>
                            <circle cx="16" cy="16" r="12.5" fill="none" stroke={rateColor(r.hw_cor)} strokeWidth={3.2}
                              strokeDasharray={78.5} strokeDashoffset={78.5*(1-r.hw_cor/100)}
                              strokeLinecap="round" transform="rotate(-90 16 16)"/>
                          </svg>
                        )}
                      </div>
                      {r.attitude!=null&&(
                        <div style={{flex:1,background:bg,borderRadius:10,padding:'8px 10px',display:'flex',flexDirection:'column',justifyContent:'center'}}>
                          <p style={{fontSize:11,color:navy,fontWeight:600,margin:'0 0 2px'}}>수업 태도</p>
                          <p style={{fontSize:18,fontWeight:700,color:tx,margin:0,lineHeight:1}}>{r.attitude}<span style={{fontSize:11,fontWeight:400,color:tx2}}>점</span></p>
                        </div>
                      )}
                    </div>

                    {/* 수업 내용 */}
                    {r.content&&(
                      <div style={{display:'flex',gap:8,marginBottom:6,alignItems:'flex-start'}}>
                        <div style={{width:3,alignSelf:'stretch',background:navy,borderRadius:2,flexShrink:0}}/>
                        <div>
                          <p style={{fontSize:11,fontWeight:700,color:navy,margin:'0 0 1px'}}>수업 내용</p>
                          <p style={{fontSize:13,color:tx,margin:0,lineHeight:1.5,whiteSpace:'pre-wrap'}}>{r.content}</p>
                        </div>
                      </div>
                    )}

                    {/* 숙제 */}
                    {r.homework&&(
                      <div style={{display:'flex',gap:8,marginBottom:10,alignItems:'flex-start'}}>
                        <div style={{width:3,alignSelf:'stretch',background:gold,borderRadius:2,flexShrink:0}}/>
                        <div>
                          <p style={{fontSize:11,fontWeight:700,color:gold,margin:'0 0 1px'}}>숙제</p>
                          <p style={{fontSize:13,color:tx,margin:0,lineHeight:1.5,whiteSpace:'pre-wrap'}}>{r.homework}</p>
                        </div>
                      </div>
                    )}

                    {r.feedback&&(
                      <div className="fb">
                        <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:5}}>
                          <div style={{width:3,height:14,background:navy,borderRadius:2}}/>
                          <span style={{fontSize:13,fontWeight:600,color:navy}}>수업 피드백</span>
                        </div>
                        <p style={{fontSize:14,color:tx,lineHeight:1.6}}>{r.feedback}</p>
                      </div>
                    )}
                      </div>
                    ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 응시 테스트 카드: 순위/시험평균/최고점까지 표시 ──
function TestList({ recs, studentId }: { recs: Rec[]; studentId: number }) {
  const [statsMap, setStatsMap] = useState<Record<number, { avg:number; max:number; rank:number; total:number }>>({})

  useEffect(() => {
    async function load() {
      const testIds = [...new Set(
        recs.flatMap(r => (r.record_test_items??[]).map(ti=>ti.test_id))
      )]
      const map: Record<number, { avg:number; max:number; rank:number; total:number }> = {}

      for (const testId of testIds) {
        // 1순위: test_scores 조회
        const { data: scores } = await supabase
          .from('test_scores')
          .select('student_id, score')
          .eq('test_id', testId)

        let scoreList = (scores??[]).map(s=>({student_id:s.student_id, score:s.score}))

        // test_scores가 비어있으면 record_test_items에서 직접 집계 (fallback)
        if (scoreList.length === 0) {
          const { data: items } = await supabase
            .from('record_test_items')
            .select('record_id, t_score, t_cor, t_total')
            .eq('test_id', testId)

          if (items && items.length > 0) {
            const recordIds = items.map(x=>x.record_id)
            const { data: recsData } = await supabase
              .from('records')
              .select('id, student_id')
              .in('id', recordIds)

            const recMap: Record<number, number> = {}
            for (const r of (recsData??[])) recMap[r.id] = r.student_id

            // 학생별 최고점 기준 집계
            const byStudent = new Map<number, number>()
            for (const item of items) {
              const sid = recMap[item.record_id]
              if (!sid) continue
              const score = item.t_score ? item.t_score : (item.t_total>0 ? Math.round(item.t_cor/item.t_total*100) : 0)
              if (!byStudent.has(sid) || score > byStudent.get(sid)!) byStudent.set(sid, score)
            }
            scoreList = [...byStudent.entries()].map(([student_id, score])=>({student_id, score}))
          }
        }

        if (scoreList.length === 0) continue

        scoreList.sort((a,b)=>b.score-a.score)
        const avg = Math.round(scoreList.reduce((a,b)=>a+b.score,0)/scoreList.length)
        const max = scoreList[0].score
        const rankIdx = scoreList.findIndex(s=>s.student_id===studentId)
        map[testId] = { avg, max, rank: rankIdx>=0?rankIdx+1:0, total: scoreList.length }
      }
      setStatsMap(map)
    }
    load()
  }, [recs, studentId])

  return (
    <>
      {recs.map(r=>(r.record_test_items??[]).map((ti, idx)=>{
        const pct = ti.t_total>0 ? Math.round(ti.t_cor/ti.t_total*100) : 0
        const stat = statsMap[ti.test_id]
        const sc = ti.t_score ?? 0
        const diff = stat ? sc - stat.avg : null
        return (
          <div key={r.id+'-'+idx} style={{border:`1px solid ${bd}`,borderRadius:12,padding:16,background:'#fff',boxShadow:'0 1px 4px rgba(0,0,0,.06)',marginBottom:10}}>
            {/* 헤더: 시험명 + 날짜/문항 */}
            <div style={{marginBottom:14}}>
              <p style={{fontSize:14,fontWeight:700,color:tx,margin:'0 0 2px'}}>{ti.tests?.name??'테스트'}</p>
              <p style={{fontSize:12,color:tx3,margin:0}}>{r.date} · {ti.t_total}문항</p>
            </div>

            {/* 핵심: 내 점수 크게 + 등수 배지 */}
            <div style={{display:'flex',alignItems:'baseline',gap:6,marginBottom:4}}>
              <span style={{fontSize:36,fontWeight:700,color:navy,lineHeight:1}}>{sc}</span>
              <span style={{fontSize:16,color:tx2}}>점</span>
              {stat&&stat.total>0&&(
                <span style={{marginLeft:'auto',background:gbg,color:gr,fontSize:13,fontWeight:600,padding:'4px 10px',borderRadius:20}}>
                  {stat.rank}등 / {stat.total}명
                </span>
              )}
            </div>
            <p style={{fontSize:12,color:tx2,margin:'0 0 14px'}}>{ti.t_cor}문항 정답 (정답률 {pct}%)</p>

            <div style={{height:1,background:bd,marginBottom:12}}/>

            {/* 보조: 시험평균 / 최고점 / 점수차 */}
            <div style={{display:'flex',alignItems:'center'}}>
              <div style={{flex:1,textAlign:'center'}}>
                <p style={{fontSize:11,color:tx3,margin:'0 0 4px'}}>시험평균</p>
                <p style={{fontSize:16,fontWeight:700,color:stat?tx:tx3,margin:0}}>{stat?`${stat.avg}점`:'—'}</p>
              </div>
              <div style={{width:1,height:30,background:bd}}/>
              <div style={{flex:1,textAlign:'center'}}>
                <p style={{fontSize:11,color:tx3,margin:'0 0 4px'}}>최고점</p>
                <p style={{fontSize:16,fontWeight:700,color:stat?tx:tx3,margin:0}}>{stat?`${stat.max}점`:'—'}</p>
              </div>
              <div style={{width:1,height:30,background:bd}}/>
              <div style={{flex:1,textAlign:'center'}}>
                <p style={{fontSize:11,color:tx3,margin:'0 0 4px'}}>평균과 차이</p>
                <p style={{fontSize:16,fontWeight:700,color:diff==null?tx3:diff>=0?gr:re,margin:0}}>
                  {diff==null?'—':(diff>0?'+':'')+diff+'점'}
                </p>
              </div>
            </div>
          </div>
        )
      }))}
    </>
  )
}
