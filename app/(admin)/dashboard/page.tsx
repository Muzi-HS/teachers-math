'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { kstNow, kstDateStr } from '@/lib/kst'
import { IconCalendar, IconChat, IconCheck, IconClock } from '@/components/icons'
import { isUnreadParentComment } from '@/lib/records'
import { useMobileMode } from '@/context/MobileModeContext'
import { loadPendingClassSends, ClassBulkSendStatus } from '@/lib/class-bulk-sends'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import PageHeader from '@/components/ui/PageHeader'
import Button from '@/components/ui/Button'

type Class_   = { id:number; name:string; days:string; time:string }
type Student  = { id:number; name:string }
type InqMsg   = { id:number; parent_id:number; content:string; created_at:string }
type UnreadRecComment = { id:number; student_id:number; date:string; parent_comment:string; parent_comment_at:string; parent_comment_read_at:string|null }
type TodayAtt = { id:number; student_id:number; type:'absence'|'late'; reason:string|null }

const DOW = ['일','월','화','수','목','금','토']

export default function DashboardPage(){
  const router = useRouter()
  const { teacher } = useAuth()
  const { mobileMode } = useMobileMode()

  const [classes,    setClasses]    = useState<Class_[]>([])
  const [csMap,      setCsMap]      = useState<Record<number, number[]>>({}) // class_id -> student_ids
  const [students,   setStudents]   = useState<Student[]>([])
  const [unreadInq,     setUnreadInq]     = useState<InqMsg[]>([])
  const [unreadInqTotal,setUnreadInqTotal]= useState(0)
  const [unreadComments,setUnreadComments]= useState<UnreadRecComment[]>([])
  const [childrenMap,   setChildrenMap]   = useState<Record<number, string[]>>({})
  const [todayAtt,      setTodayAtt]      = useState<TodayAtt[]>([])
  const [loading,       setLoading]       = useState(true)
  const [pendingClasses, setPendingClasses] = useState<ClassBulkSendStatus[]>([])
  const [pendingLoading, setPendingLoading] = useState(true)
  const [pendingError, setPendingError] = useState(false)

  useEffect(()=>{ fetchAll() },[])
  useEffect(() => {
    let cancelled = false
    loadPendingClassSends().then(rows => {
      if (!cancelled) setPendingClasses(rows)
    }).catch(() => {
      if (!cancelled) setPendingError(true)
    }).finally(() => {
      if (!cancelled) setPendingLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  async function fetchAll(){
    setLoading(true)
    const [{ data:cls },{ data:cs },{ data:stu },{ data:inq, count:inqCount },{ data:par },{ data:comments },{ data:att }] = await Promise.all([
      supabase.from('classes').select('id,name,days,time').order('name'),
      supabase.from('class_students').select('class_id,student_id'),
      supabase.from('students').select('id,name'),
      supabase.from('inquiry_messages').select('id,parent_id,content,created_at',{count:'exact'}).eq('sender_type','parent').eq('is_read',false).order('created_at',{ascending:false}).limit(10),
      supabase.from('parents').select('id, parent_students(students(name))'),
      supabase.from('records').select('id,student_id,date,parent_comment,parent_comment_at,parent_comment_read_at')
        .eq('is_draft',false).not('parent_comment','is',null).order('parent_comment_at',{ascending:false}).limit(50),
      supabase.from('attendance_notices').select('id,student_id,type,reason').eq('date',kstDateStr()),
    ])
    setClasses(cls??[])
    const map:Record<number,number[]>={}
    for(const r of (cs??[])) {
      if(!map[r.class_id]) map[r.class_id]=[]
      map[r.class_id].push(r.student_id)
    }
    setCsMap(map)
    setStudents(stu??[])
    setUnreadInq(inq??[])
    setUnreadInqTotal(inqCount ?? (inq??[]).length)
    setUnreadComments((comments??[]).filter(isUnreadParentComment) as UnreadRecComment[])
    setTodayAtt((att??[]) as TodayAtt[])
    const cmap:Record<number,string[]> = {}
    for (const row of (par??[]) as any[]) {
      cmap[row.id] = (row.parent_students ?? []).map((ps:any) => ps.students?.name).filter(Boolean)
    }
    setChildrenMap(cmap)
    setLoading(false)
  }

  // 오늘 요일에 해당하는 반만 필터링
  const todayDow = DOW[kstNow().getDay()]
  const startMinutes = (time: string) => {
    const match = time?.match(/(\d{1,2}):(\d{2})/)
    return match ? Number(match[1]) * 60 + Number(match[2]) : Infinity
  }
  const todayClasses = classes.filter(c => (c.days??'').includes(todayDow))
    .sort((a, b) => startMinutes(a.time) - startMinutes(b.time) || a.name.localeCompare(b.name, 'ko'))

  function goToClassDetail(classId: number){
    // 반관리 페이지로 이동 + 해당 반 상세(학생목록) 화면 자동 오픈
    router.push(`/classes?openDetail=${classId}`)
  }

  function goToRecordsMenu(){
    router.push('/records')
  }

  function goToInquiries(){
    router.push('/inquiries')
  }

  function goToRecordDate(date: string){
    router.push(`/records?date=${date}`)
  }

  function goToSchedule(){
    router.push('/schedule')
  }

  const studentNameOf = (sid:number) => students.find(s=>s.id===sid)?.name ?? '알 수 없음'
  const childNameOf = (parentId:number) => (childrenMap[parentId] ?? []).join(', ') || '학부모'

  const css = `
    .dashboard-page .schedule-row{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--ui-border);}
    .dashboard-page .schedule-row:last-child{border-bottom:none;}
    .dashboard-page .stat-card{cursor:default;}
    .dashboard-page .av{width:26px;height:26px;border-radius:50%;background:var(--ui-surface-2);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--ui-primary);flex-shrink:0;}
    .dashboard-page .section-title{font-size:14px;font-weight:700;color:var(--ui-text);margin:0 0 4px;display:flex;align-items:center;gap:6px;}
    .dashboard-page .link-cta{font-size:12px;color:var(--ui-primary);font-weight:700;cursor:pointer;border:0;background:none;padding:4px 0;text-align:left;}
    .dashboard-page{max-width:1440px;margin:0 auto;}
    .dashboard-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:12px;}
    .dashboard-alerts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:20px;background:var(--ui-surface);border:1px solid var(--ui-border);border-radius:var(--ui-radius-md);overflow:hidden;}
    .dashboard-alert{border:0;background:transparent;padding:14px 10px;color:var(--ui-text-2);font:inherit;cursor:pointer;text-align:center;}
    .dashboard-alert + .dashboard-alert{border-left:1px solid var(--ui-border);}
    .dashboard-alert:hover{background:var(--ui-surface-2);}
    .dashboard-alert span{display:block;font-size:12px;}
    .dashboard-alert strong{display:block;margin-top:4px;font-size:17px;color:var(--ui-text);}
    .dashboard-alert.has-alert strong{color:var(--ui-danger);}
    .dashboard-alert:focus-visible{outline-offset:-4px;}
    .dashboard-class{flex:1;min-width:0;border:0;background:none;text-align:left;cursor:pointer;font:inherit;padding:4px 0;}
    .dashboard-class:hover .dashboard-class-name{text-decoration:underline;text-underline-offset:3px;}
    .dashboard-time{width:80px;flex-shrink:0;font-size:13px;font-weight:600;color:var(--ui-text);font-variant-numeric:tabular-nums;}
    .dashboard-time small{display:block;font-size:12px;font-weight:400;color:var(--ui-text-3);}
    .dashboard-panel-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px;}
    .dashboard-detail-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:16px;align-items:start;}
    @media(max-width:700px){
      .dashboard-stats{gap:8px;}
      .dashboard-alert span{font-size:11px;}
      .dashboard-time{width:52px;font-size:12px;}
      .dashboard-page .schedule-row{gap:8px;flex-wrap:wrap;}
      .dashboard-page .ui-btn{padding:8px 10px;font-size:12px;}
      .dashboard-page .stat-card{padding:12px 10px !important;}
    }
  `

  return (
    <div className="dashboard-page" style={{ padding: mobileMode ? '16px 14px 88px' : '28px clamp(16px, 3vw, 32px)', background: 'var(--ui-bg)', minHeight: '100%' }}>
      <style>{css}</style>

      <PageHeader
        title={`안녕하세요, ${teacher?.name ?? '선생님'}님`}
        subtitle={`${kstNow().toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric', weekday:'long' })} · 오늘 수업 ${todayClasses.length}개 예정`}
      />

      {/* 수업 요약과 확인할 알림을 구분 */}
      <div className="dashboard-stats">
        <Card className="stat-card" style={{ padding: '14px 16px', background: 'var(--ui-accent-bg)' }}>
          <p style={{ fontSize: 11, color: 'var(--ui-text-3)', margin: '0 0 6px' }}>오늘 수업</p>
          <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--ui-primary)', margin: 0 }}>
            {todayClasses.length}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--ui-text-2)' }}>개 반</span>
          </p>
        </Card>
        <Card className="stat-card" style={{ padding: '14px 16px' }}>
          <p style={{ fontSize: 11, color: 'var(--ui-text-3)', margin: '0 0 6px' }}>전체 반</p>
          <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--ui-primary)', margin: 0 }}>
            {classes.length}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--ui-text-2)' }}>개</span>
          </p>
        </Card>
        <Card className="stat-card" style={{ padding: '14px 16px' }}>
          <p style={{ fontSize: 11, color: 'var(--ui-text-3)', margin: '0 0 6px' }}>전체 학생</p>
          <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--ui-primary)', margin: 0 }}>
            {students.length}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--ui-text-2)' }}>명</span>
          </p>
        </Card>
      </div>
      <div className="dashboard-alerts" aria-label="확인할 알림">
        {[
          { label: '읽지 않은 문의', count: unreadInqTotal, unit: '건', action: goToInquiries },
          { label: '안읽은 학부모 의견', count: unreadComments.length, unit: '건', action: goToRecordsMenu },
          { label: '오늘 결석·지각', count: todayAtt.length, unit: '명', action: goToSchedule },
        ].map(item => (
          <button key={item.label} className={`dashboard-alert${item.count > 0 ? ' has-alert' : ''}`} onClick={item.action}>
            <span>{item.label}</span><strong>{loading ? '…' : `${item.count}${item.unit}`}</strong>
          </button>
        ))}
      </div>

      {/* 오늘 수업 일정 */}
      <Card style={{ marginBottom: mobileMode ? 12 : 16 }}>
        <div className="dashboard-panel-heading">
          <h2 className="section-title"><IconCalendar size={16} /> 오늘 수업 일정 <Badge tone="accent">{loading ? '…' : todayClasses.length}</Badge></h2>
          <Button size="sm" onClick={() => goToRecordDate(kstDateStr())}>오늘 수업기록 보기</Button>
        </div>
        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--ui-text-3)', padding: '20px 0', textAlign: 'center' }}>불러오는 중...</p>
        ) : todayClasses.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ui-text-3)', padding: '24px 0', textAlign: 'center' }}>오늘 예정된 수업이 없습니다</p>
        ) : todayClasses.map(c => {
          const stuCnt = (csMap[c.id] ?? []).length
          const times = (c.time || '').split(/\s*[~–-]\s*/)
          return (
            <div key={c.id} className="schedule-row">
              <div className="dashboard-time">{times[0] || '시간 미정'}{times[1] && <small>– {times[1]}</small>}</div>
              <button className="dashboard-class" onClick={() => goToClassDetail(c.id)} aria-label={`${c.name} 반 상세 보기`}>
                <span className="dashboard-class-name" style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--ui-text)' }}>{c.name}</span>
                <span style={{ fontSize: 12, color: 'var(--ui-text-3)' }}>학생 {stuCnt}명</span>
              </button>
              <Button size="sm" variant="secondary" onClick={() => router.push(`/classes?openDetail=${c.id}&prep=1`)} aria-label={`${c.name} 수업 준비`}>수업 준비</Button>
            </div>
          )
        })}
      </Card>

      {/* 미발송 반 목록 */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--ui-primary)', margin: 0 }}>미발송 반 목록</p>
          {!pendingLoading && !pendingError && <Badge tone="accent">{pendingClasses.length}건</Badge>}
        </div>
        <p style={{ fontSize: 11, color: 'var(--ui-text-3)', margin: '0 0 10px' }}>수업기록이 있고 '일괄 발송' 버튼을 누르지 않은 반입니다. 날짜별로 표시하며, 학부모의 푸시 알림 수신 여부는 무관합니다.</p>
        {pendingLoading ? <p style={{ fontSize: 13, color: 'var(--ui-text-3)' }}>불러오는 중...</p>
          : pendingError ? <p role="alert" style={{ fontSize: 13, color: 'var(--ui-danger)' }}>미발송 반 목록을 불러오지 못했습니다. 새로고침해주세요.</p>
          : pendingClasses.length === 0 ? <p style={{ fontSize: 13, color: 'var(--ui-text-2)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--ui-bg)', padding: 12, borderRadius: 8 }}><IconCheck size={16} /> 일괄 발송 대기 중인 반이 없습니다.</p>
          : <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {pendingClasses.map(row => (
              <button key={`${row.date}-${row.class_id ?? 0}`} className="schedule-row" onClick={() => router.push(`/records?date=${row.date}&unsent=1`)} style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid var(--ui-border)', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
                <span style={{ color: 'var(--ui-text-2)', fontSize: 12 }}>{row.date}</span>
                <span style={{ flex: 1, color: 'var(--ui-primary)', fontSize: 13, fontWeight: 600 }}>{classes.find(c => c.id === row.class_id)?.name ?? '반 미지정'}</span>
                <span style={{ color: 'var(--ui-danger)', fontSize: 11 }}>일괄 발송 전 →</span>
              </button>
            ))}
          </div>}
      </Card>

      <div className="dashboard-detail-grid">
      {/* 읽지 않은 문의 */}
      <Card style={{ marginBottom: 16, borderColor: unreadInq.length > 0 ? 'var(--ui-danger)' : undefined }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 10 }}>
          <p className="section-title" style={{ color: unreadInq.length>0 ? 'var(--ui-danger)' : 'var(--ui-text)' }}><IconChat size={14} /> 읽지 않은 문의</p>
          {unreadInq.length > 0 && (
            <button className="link-cta" onClick={goToInquiries}>문의하기에서 확인 →</button>
          )}
        </div>
        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--ui-text-3)', padding: '20px 0', textAlign: 'center' }}>불러오는 중...</p>
        ) : unreadInq.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ui-text-3)', padding: '20px 0', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><IconCheck size={14} /> 읽지 않은 문의가 없습니다</p>
        ) : (
          <>
            {unreadInq.slice(0, 5).map(m => (
              <div key={m.id} style={{ display:'flex', alignItems:'center', gap: 8, padding: '6px 0', cursor: 'pointer' }} onClick={goToInquiries}>
                <div className="av">{childNameOf(m.parent_id)[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ui-text)', margin: 0 }}>{childNameOf(m.parent_id)} 학부모</p>
                  <p style={{ fontSize: 11, color: 'var(--ui-text-2)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.content}</p>
                </div>
              </div>
            ))}
            {unreadInqTotal > 5 && (
              <p style={{ fontSize: 11, color: 'var(--ui-text-3)', margin: '6px 0 0' }}>외 {unreadInqTotal - 5}건 더보기</p>
            )}
          </>
        )}
      </Card>

      {/* 안읽은 학부모 의견 */}
      <Card style={{ marginBottom: 16, borderColor: unreadComments.length > 0 ? 'var(--ui-danger)' : undefined }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 10 }}>
          <p className="section-title" style={{ color: unreadComments.length>0 ? 'var(--ui-danger)' : 'var(--ui-text)' }}><IconChat size={14} /> 안읽은 학부모 의견</p>
          {unreadComments.length > 0 && (
            <button className="link-cta" onClick={goToRecordsMenu}>수업기록에서 확인 →</button>
          )}
        </div>
        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--ui-text-3)', padding: '20px 0', textAlign: 'center' }}>불러오는 중...</p>
        ) : unreadComments.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ui-text-3)', padding: '20px 0', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><IconCheck size={14} /> 안읽은 학부모 의견이 없습니다</p>
        ) : (
          <>
            {unreadComments.slice(0, 5).map(c => (
              <div key={c.id} style={{ display:'flex', alignItems:'center', gap: 8, padding: '6px 0', cursor: 'pointer' }} onClick={() => goToRecordDate(c.date)}>
                <div className="av">{studentNameOf(c.student_id)[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ui-text)', margin: 0 }}>{studentNameOf(c.student_id)} · {c.date}</p>
                  <p style={{ fontSize: 11, color: 'var(--ui-text-2)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.parent_comment}</p>
                </div>
              </div>
            ))}
            {unreadComments.length > 5 && (
              <p style={{ fontSize: 11, color: 'var(--ui-text-3)', margin: '6px 0 0' }}>외 {unreadComments.length - 5}건 더보기</p>
            )}
          </>
        )}
      </Card>

      {/* 오늘 결석·지각 */}
      <Card style={{ borderColor: todayAtt.length > 0 ? 'var(--ui-danger)' : undefined }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 10 }}>
          <p className="section-title" style={{ color: todayAtt.length>0 ? 'var(--ui-danger)' : 'var(--ui-text)' }}><IconClock size={14} /> 오늘 결석·지각</p>
          {todayAtt.length > 0 && (
            <button className="link-cta" onClick={goToSchedule}>학원일정에서 확인 →</button>
          )}
        </div>
        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--ui-text-3)', padding: '20px 0', textAlign: 'center' }}>불러오는 중...</p>
        ) : todayAtt.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ui-text-3)', padding: '20px 0', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><IconCheck size={14} /> 오늘 등록된 결석·지각이 없습니다</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {todayAtt.map(n => {
              const isLate = n.type === 'late'
              return (
                <Badge key={n.id} tone={isLate ? 'warning' : 'danger'} onClick={goToSchedule} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }} title={n.reason ?? undefined}>
                  {isLate && <IconClock size={11} />}
                  {studentNameOf(n.student_id)} · {isLate ? '지각' : '결석'}
                </Badge>
              )
            })}
          </div>
        )}
      </Card>
      </div>
    </div>
  )
}
