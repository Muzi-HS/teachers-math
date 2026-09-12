import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DOW = ['일', '월', '화', '수', '목', '금', '토']
// 수업 시작 몇 분 전부터 알림을 보낼지 — pg_cron이 5분 간격으로 이 함수를 호출하고,
// class_reminder_log로 반/날짜당 한 번만 보내도록 막으므로 이 값보다 넓게 잡아도 중복 발송은 없다.
const REMINDER_WINDOW_MIN = 30

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

// pg_cron이 몇 분마다 호출해 "곧 시작하는 수업"이 있는지 확인하고, 그 반 소속 학생·학부모에게
// 한 번씩만(class_reminder_log로 중복 방지) 등원 전 알림 푸시를 보낸다.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    const kstNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
    const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
    const todayDow = DOW[kstNow.getDay()]
    const nowMinutes = kstNow.getHours() * 60 + kstNow.getMinutes()

    const { data: classes } = await supabase
      .from('classes').select('id, name, days, time')
      .not('time', 'is', null)

    const todaysUpcoming = (classes ?? [])
      .filter(c => (c.days ?? '').includes(todayDow) && c.time)
      .map(c => ({ id: c.id, name: c.name, start: (c.time as string).split('~')[0]?.trim() ?? '' }))
      .filter(c => c.start)
      .map(c => ({ ...c, diff: toMinutes(c.start) - nowMinutes }))
      .filter(c => c.diff >= 0 && c.diff <= REMINDER_WINDOW_MIN)

    if (todaysUpcoming.length === 0) {
      return new Response(JSON.stringify({ checked: 0, sent: 0 }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const { data: alreadySent } = await supabase
      .from('class_reminder_log').select('class_id')
      .eq('date', dateStr).in('class_id', todaysUpcoming.map(c => c.id))
    const alreadySentIds = new Set((alreadySent ?? []).map(r => r.class_id))
    const pending = todaysUpcoming.filter(c => !alreadySentIds.has(c.id))

    let sentCount = 0
    for (const cls of pending) {
      const { data: csRows } = await supabase
        .from('class_students').select('student_id').eq('class_id', cls.id)
      const studentIds = (csRows ?? []).map(r => r.student_id)
      if (studentIds.length === 0) {
        await supabase.from('class_reminder_log').insert({ class_id: cls.id, date: dateStr })
        continue
      }

      const { data: parentLinks } = await supabase
        .from('parent_students').select('student_id, parent_id').in('student_id', studentIds)
      const parentIds = [...new Set((parentLinks ?? []).map(r => r.parent_id))]
      let parentPhones: string[] = []
      if (parentIds.length > 0) {
        const { data: parents } = await supabase.from('parents').select('phone').in('id', parentIds)
        parentPhones = (parents ?? []).map(p => p.phone).filter(Boolean)
      }

      const body = `${cls.start} ${cls.name} 수업이 곧 시작합니다!`

      const pushes: Promise<any>[] = []
      for (const studentId of studentIds) {
        pushes.push(fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
          body: JSON.stringify({ student_id: studentId, title: '티처스 수학학원', body, link: '/student/records' }),
        }).catch(() => {}))
      }
      for (const phone of parentPhones) {
        pushes.push(fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
          body: JSON.stringify({ parent_phone: phone, title: '티처스 수학학원', body, link: '/parent/records' }),
        }).catch(() => {}))
      }
      await Promise.allSettled(pushes)
      sentCount += pushes.length

      await supabase.from('class_reminder_log').insert({ class_id: cls.id, date: dateStr })
    }

    return new Response(JSON.stringify({ checked: todaysUpcoming.length, classesNotified: pending.length, pushesSent: sentCount }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
