'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { kstNow } from '@/lib/kst'
import { IconClock } from '@/components/icons'

const navy = 'var(--ui-primary)'

const DOW = ['일', '월', '화', '수', '목', '금', '토']

type TodayClass = { id: number; name: string; time: string }

// 학부모/학생 화면이 공유하는 "오늘 수업 시간" 배너 — 앱에 들어오자마자 오늘
// 무슨 반 수업이 몇 시에 있는지 바로 보여준다.
export default function TodayClassBanner({ studentId, sessionToken }: { studentId: number | null; sessionToken: string | undefined }) {
  const [classes, setClasses] = useState<TodayClass[] | null>(null)

  useEffect(() => {
    if (!studentId || !sessionToken) { setClasses(null); return }
    let cancelled = false
    async function load() {
      const now = kstNow()
      const todayDow = DOW[now.getDay()]
      const { data: csRows } = await supabase.rpc('client_class_students', { p_token: sessionToken, p_student_id: studentId })
      const classIds = ((csRows ?? []) as { class_id: number }[]).map(r => r.class_id)
      if (classIds.length === 0) { if (!cancelled) setClasses([]); return }
      const { data: cls } = await supabase.from('classes').select('id,name,days,time').in('id', classIds)
      const todays = (cls ?? [])
        .filter(c => (c.days ?? '').includes(todayDow) && c.time)
        .map(c => ({ id: c.id, name: c.name, time: c.time as string }))
        .sort((a, b) => a.time.localeCompare(b.time))
      if (!cancelled) setClasses(todays)
    }
    load()
    return () => { cancelled = true }
  }, [studentId, sessionToken])

  if (!classes || classes.length === 0) return null

  return (
    <div style={{ background: '#fff', border: `1.5px solid color-mix(in srgb, ${navy} 20%, transparent)`, borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ flexShrink: 0, color: navy, display: 'flex' }}><IconClock size={20} /></span>
      <p style={{ fontSize: 13, fontWeight: 700, color: navy, margin: 0, lineHeight: 1.5 }}>
        오늘 {classes.map(c => `${c.time.split('~')[0]?.trim()} ${c.name}`).join(', ')} 수업이 있어요
      </p>
    </div>
  )
}
