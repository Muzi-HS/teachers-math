'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { kstDateStr, kstNow } from '@/lib/kst'
import TimeSlotInput from '@/components/TimeSlotInput'

const navy='#0D2A5E', bg='#F5F7FA', bd='#DDE3EE'
const tx='#0D1B36', tx2='#4B5C7E', tx3='#96A4BF'
const re='#C0392B', rbg='#FDECEA', gr='#1A7F4E', gbg='#E0F5EB'
const gold='#D87E13', goldPale='#FEF3E2'

type Slot = { in: string; out: string }
type Log = {
  id: number; date: string
  clock_in: string|null; clock_out: string|null
  work_minutes: number|null; memo: string
  slots: Slot[]
  approved: boolean
}

function calcMin(slots: Slot[]): number {
  return slots.reduce((s, sl) => {
    if (!sl.in || !sl.out || sl.in >= sl.out) return s
    const diff = (new Date(`2000-01-01T${sl.out}`).getTime() - new Date(`2000-01-01T${sl.in}`).getTime()) / 60000
    return s + diff
  }, 0)
}

function fmtHours(m: number|null) {
  if (!m || m <= 0) return '-'
  const h = Math.floor(m/60), min = m%60
  return min > 0 ? `${h}시간 ${min}분` : `${h}시간`
}

export default function AttendancePage() {
  const { teacher } = useAuth()
  const [logs,     setLogs]     = useState<Log[]>([])
  const [selYear,  setSelYear]  = useState(kstNow().getFullYear())
  const [selMonth, setSelMonth] = useState(kstNow().getMonth()+1)
  const [selDate,  setSelDate]  = useState(kstDateStr())
  const [slots,    setSlots]    = useState<Slot[]>([{in:'',out:''}])
  const [memo,     setMemo]     = useState('')
  const [saving,   setSaving]   = useState(false)
  const [notif,    setNotif]    = useState<{msg:string;ok:boolean}|null>(null)

  const today = logs.find(l => l.date === selDate) ?? null

  useEffect(() => { fetchAll() }, [selYear, selMonth, teacher])
  useEffect(() => {
    if (today) {
      const s: Slot[] = today.slots?.length ? today.slots
        : (today.clock_in ? [{in: today.clock_in.slice(0,5), out: today.clock_out?.slice(0,5)??''}] : [{in:'',out:''}])
      setSlots(s)
      setMemo(today.memo ?? '')
    } else {
      setSlots([{in:'',out:''}])
      setMemo('')
    }
  }, [selDate, logs])

  async function fetchAll() {
    if (!teacher) return
    const from = `${selYear}-${String(selMonth).padStart(2,'0')}-01`
    const to   = `${selYear}-${String(selMonth).padStart(2,'0')}-31`
    const { data } = await supabase.from('attendance_log')
      .select('*').eq('teacher_id', teacher.userId)
      .gte('date', from).lte('date', to).order('date', {ascending:false})
    setLogs((data ?? []).map(r => ({ ...r, slots: r.slots ?? [] })))
  }

  function toast(msg:string, ok=true) { setNotif({msg,ok}); setTimeout(()=>setNotif(null),3000) }

  function handleDateChange(d: string) {
    setSelDate(d)
    const [y, m] = d.split('-').map(Number)
    setSelYear(y); setSelMonth(m)
  }

  function addSlot() { setSlots(p => [...p, {in:'',out:''}]) }
  function removeSlot(i: number) { setSlots(p => p.filter((_,idx)=>idx!==i)) }
  function updateSlot(i: number, field: 'in'|'out', val: string) {
    setSlots(p => p.map((s,idx) => idx===i ? {...s,[field]:val} : s))
  }

  async function save() {
    if (!teacher) return
    const validSlots = slots.filter(s => s.in && s.out && s.in < s.out)
    if (!validSlots.length) return toast('올바른 시간을 1개 이상 입력하세요.', false)
    setSaving(true)

    const mins = Math.round(calcMin(validSlots))
    const base: Record<string,unknown> = {
      teacher_id: teacher.userId,
      date: selDate,
      clock_in: validSlots[0].in,
      clock_out: validSlots[validSlots.length-1].out,
      work_minutes: mins,
      memo,
    }
    const full = { ...base, slots: validSlots, approved: false }

    const doSave = (row: Record<string,unknown>) => today
      ? supabase.from('attendance_log').update(row).eq('id', today.id)
      : supabase.from('attendance_log').insert(row)

    let { error } = await doSave(full)
    if (error) {
      const msg = error.message?.toLowerCase() ?? ''
      if (msg.includes('column') || msg.includes('does not exist') || error.code === '42703') {
        // slots/approved 컬럼 없으면 base로 재시도
        ;({ error } = await doSave(base))
        if (error) {
          const msg2 = error.message?.toLowerCase() ?? ''
          // work_minutes가 generated column이면 제외하고 재시도
          if (msg2.includes('non-default') || msg2.includes('generated') || msg2.includes('work_minutes')) {
            const { work_minutes: _wm, ...noWm } = base as any
            ;({ error } = await doSave(noWm))
          }
        }
      }
    }
    if (error) toast('저장 실패: '+error.message, false)
    else toast(today ? '수정됨 (승인 대기)' : '제출됨 (승인 대기)')
    setSaving(false)
    fetchAll()
  }

  async function deleteLog(id: number) {
    if (!confirm('이 기록을 삭제하시겠습니까?')) return
    await supabase.from('attendance_log').delete().eq('id', id)
    toast('삭제됨', false); fetchAll()
  }

  const totalDays = logs.filter(l => l.approved).length
  const totalMin  = logs.filter(l => l.approved).reduce((s,l) => s+(l.work_minutes??0), 0)
  const pendingCnt = logs.filter(l => !l.approved).length

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
    table{width:100%;border-collapse:collapse;}
    th{padding:9px 12px;text-align:left;font-size:11px;font-weight:600;color:${tx3};background:${bg};border-bottom:1px solid ${bd};}
    td{padding:10px 12px;border-bottom:1px solid ${bd};font-size:13px;color:${tx};}
    tr:last-child td{border-bottom:none;}
    .fi{width:100%;padding:9px 11px;border:1.5px solid ${bd};border-radius:8px;font-size:13px;font-family:inherit;color:${tx};outline:none;background:#fff;transition:border-color .2s;box-sizing:border-box;}
    .fi:focus{border-color:${navy};}
    .lb{display:block;font-size:12px;font-weight:500;color:${tx2};margin-bottom:5px;}
    .bdng{display:inline-flex;align-items:center;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;border:none;background:${rbg};color:${re};font-family:inherit;}
    .fsel{padding:7px 11px;border:1px solid ${bd};border-radius:8px;font-size:12px;font-family:inherit;color:${tx2};background:#fff;outline:none;cursor:pointer;}
  `

  return (
    <div style={{padding:'28px 32px',fontFamily:"'Noto Sans KR',sans-serif"}}>
      <style>{css}</style>

      {notif && (
        <div style={{position:'fixed',top:18,right:18,zIndex:9999,background:'#fff',borderRadius:8,padding:'11px 14px',borderLeft:`4px solid ${notif.ok?gr:re}`,boxShadow:'0 4px 18px rgba(0,0,0,.1)',minWidth:200}}>
          <div style={{fontWeight:600,marginBottom:2,color:tx,fontSize:13}}>{notif.ok?'완료':'알림'}</div>
          <div style={{fontSize:12,color:tx2}}>{notif.msg}</div>
        </div>
      )}

      <div style={{marginBottom:20}}>
        <h1 style={{fontSize:21,fontWeight:700,color:tx}}>출근부</h1>
        <p style={{fontSize:13,color:tx2,marginTop:4}}>근무 시간대를 입력하고 관리자 승인을 받으세요</p>
      </div>

      {/* 이번 달 통계 */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:16}}>
        {[
          {label:'승인된 출근일수', val:`${totalDays}일`},
          {label:'승인된 총 근무시간', val:fmtHours(totalMin||null)},
          {label:'승인 대기', val:`${pendingCnt}건`, warn:pendingCnt>0},
        ].map(({label,val,warn})=>(
          <div key={label} style={{background:'#fff',borderRadius:12,border:`1px solid ${warn?re+'55':bd}`,padding:'14px 16px',boxShadow:'0 1px 4px rgba(0,0,0,.06)'}}>
            <p style={{fontSize:11,color:warn?re:tx3,marginBottom:6,fontWeight:warn?600:400}}>{label}</p>
            <p style={{fontSize:22,fontWeight:700,color:warn?re:navy,margin:0}}>{val}</p>
          </div>
        ))}
      </div>

      {/* 출근 입력 카드 */}
      <div style={{background:'#fff',borderRadius:12,border:`1px solid ${bd}`,padding:20,marginBottom:16,boxShadow:'0 1px 4px rgba(0,0,0,.06)'}}>
        <div style={{fontSize:14,fontWeight:700,color:tx,marginBottom:14,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          날짜
          <input type="date" className="fi" value={selDate} onChange={e=>handleDateChange(e.target.value)}
            style={{width:'auto',display:'inline-block',padding:'5px 10px',fontSize:13,fontWeight:400}}/>
          {today && (
            <span style={{fontSize:11,padding:'2px 8px',borderRadius:20,
              background: today.approved ? gbg : goldPale,
              color: today.approved ? gr : gold,
              fontWeight:600}}>
              {today.approved ? '승인됨' : '승인 대기'}
            </span>
          )}
        </div>

        {today?.approved && (
          <div style={{background:gbg,borderRadius:8,padding:'10px 14px',marginBottom:14,fontSize:13,color:gr,fontWeight:500}}>
            관리자가 승인한 기록입니다. 수정하면 재승인이 필요합니다.
          </div>
        )}

        {/* 시간대 목록 */}
        <div style={{marginBottom:12}}>
          <label className="lb">근무 시간대</label>
          {slots.map((sl, i) => (
            <div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
              <span style={{fontSize:12,color:tx3,minWidth:16,textAlign:'right'}}>{i+1}</span>
              <TimeSlotInput value={sl.in} onChange={v=>updateSlot(i,'in',v)} />
              <span style={{color:tx3,fontSize:13}}>~</span>
              <TimeSlotInput value={sl.out} onChange={v=>updateSlot(i,'out',v)} />
              {sl.in && sl.out && sl.in < sl.out && (
                <span style={{fontSize:11,color:navy,minWidth:60,whiteSpace:'nowrap'}}>
                  {fmtHours(Math.round(calcMin([sl])))}
                </span>
              )}
              {slots.length > 1 && (
                <button onClick={()=>removeSlot(i)}
                  style={{padding:'5px 8px',border:'none',background:rbg,color:re,borderRadius:6,cursor:'pointer',fontSize:12,flexShrink:0}}>✕</button>
              )}
            </div>
          ))}
          <button onClick={addSlot}
            style={{padding:'6px 14px',borderRadius:7,border:`1px dashed ${bd}`,background:'transparent',color:tx2,fontSize:12,cursor:'pointer',fontFamily:'inherit',marginTop:4}}>
            + 시간대 추가
          </button>
        </div>

        {/* 총 근무시간 미리보기 */}
        {calcMin(slots.filter(s=>s.in&&s.out&&s.in<s.out)) > 0 && (
          <p style={{fontSize:12,color:navy,marginBottom:12,fontWeight:600}}>
            총 근무시간: {fmtHours(Math.round(calcMin(slots.filter(s=>s.in&&s.out&&s.in<s.out))))}
          </p>
        )}

        <div style={{marginBottom:12}}>
          <label className="lb">메모 (선택)</label>
          <input className="fi" value={memo} onChange={e=>setMemo(e.target.value)} placeholder="특이사항"/>
        </div>

        <button onClick={save} disabled={saving}
          style={{padding:'9px 20px',borderRadius:8,border:'none',background:navy,color:'#fff',fontSize:13,fontWeight:600,cursor:saving?'not-allowed':'pointer',fontFamily:'inherit',opacity:saving?0.7:1}}>
          {saving ? '저장 중...' : (today ? '수정 제출' : '제출')}
        </button>
      </div>

      {/* 기록 목록 */}
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
        {logs.length === 0 ? (
          <p style={{textAlign:'center',color:tx3,padding:'40px 0',fontSize:13}}>출근 기록이 없습니다</p>
        ) : (
          <table>
            <thead>
              <tr><th>날짜</th><th>시간대</th><th>근무시간</th><th>메모</th><th>승인</th><th>관리</th></tr>
            </thead>
            <tbody>
              {logs.map(l => {
                const slotsDisplay: Slot[] = l.slots?.length
                  ? l.slots
                  : (l.clock_in ? [{in:l.clock_in.slice(0,5), out:l.clock_out?.slice(0,5)??''}] : [])
                return (
                  <tr key={l.id} style={{cursor:'pointer',background:selDate===l.date?bg:''}}
                    onClick={()=>handleDateChange(l.date)}>
                    <td style={{color:tx2}}>{l.date}</td>
                    <td>
                      {slotsDisplay.map((s,i) => (
                        <div key={i} style={{fontSize:12,color:navy}}>
                          {s.in} ~ {s.out}
                        </div>
                      ))}
                    </td>
                    <td style={{color:l.approved?gr:tx,fontWeight:600}}>{fmtHours(l.work_minutes)}</td>
                    <td style={{color:tx3,fontSize:12}}>{l.memo||'-'}</td>
                    <td>
                      <span style={{fontSize:11,padding:'2px 8px',borderRadius:20,fontWeight:600,
                        background:l.approved?gbg:goldPale, color:l.approved?gr:gold}}>
                        {l.approved ? '승인됨' : '대기'}
                      </span>
                    </td>
                    <td onClick={e=>e.stopPropagation()}>
                      {!l.approved && (
                        <button className="bdng" onClick={()=>deleteLog(l.id)}>삭제</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
