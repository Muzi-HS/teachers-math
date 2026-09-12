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

// 등원 체크인을 실제로 수행한다. 두 경로에서 호출된다:
// - 태블릿 키오스크(/checkin): 관리자가 학생을 특정한 뒤 student_id로 호출
// - 공용 NFC 카드(/tag-checkin): 학부모 로그인(자동 로그인 포함)으로 학생을 특정한 뒤 student_id로 호출 (관리자 로그인 불필요)
// - 오늘 요일에 해당하는 수업 시간과 비교해 지각/정시를 자동 판정해 student_checkins에 남긴다
//   (반관리 > 수업기록 작성 시 이 값을 그대로 불러와 지각 여부를 자동 반영한다)
// - 문의하기 스레드에 관리자 명의로 등원 완료 메시지를 남기고 학부모에게 푸시를 보낸다
// 학부모 명의를 사칭하는 쓰기(sender_type:'admin')와 서비스 롤이 필요한 조회가 섞여 있어
// 클라이언트(anon)에서 직접 처리하지 않고 이 함수 하나로 모은다.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { student_id } = await req.json()
    if (!student_id) {
      return new Response(JSON.stringify({ error: 'student_id가 필요합니다.' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    const { data: student, error: stuErr } = await supabase
      .from('students').select('id, name').eq('id', student_id).single()
    if (stuErr || !student) {
      return new Response(JSON.stringify({ error: '학생을 찾을 수 없습니다.' }), {
        status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // KST 기준 오늘 날짜/현재 시각 ("HH:MM" 문자열 — 반관리 반 시간 형식과 동일해서 문자열 비교로 지각 판정 가능)
    const kstNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
    const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
    const nowTimeStr = `${String(kstNow.getHours()).padStart(2, '0')}:${String(kstNow.getMinutes()).padStart(2, '0')}`
    const todayDow = DOW[kstNow.getDay()]

    // 오늘 요일에 해당하는 수업(여러 개면 시작 시간이 가장 빠른 것)을 찾아 지각/정시 판정
    const { data: csRows } = await supabase
      .from('class_students').select('class_id').eq('student_id', student_id)
    const classIds = (csRows ?? []).map(r => r.class_id)
    let matchedClassId: number | null = null
    let late = false
    if (classIds.length > 0) {
      const { data: classes } = await supabase
        .from('classes').select('id, days, time').in('id', classIds)
      const todaysClasses = (classes ?? [])
        .filter(c => (c.days ?? '').includes(todayDow) && c.time)
        .map(c => ({ id: c.id, start: (c.time as string).split('~')[0]?.trim() ?? '' }))
        .filter(c => c.start)
        .sort((a, b) => a.start.localeCompare(b.start))
      if (todaysClasses.length > 0) {
        matchedClassId = todaysClasses[0].id
        late = nowTimeStr > todaysClasses[0].start
      }
    }

    // NFC 카드는 접촉 한 번으로 즉시 동작해 실수로 여러 번 태그하기 쉽다. student_checkins에
    // (student_id, date) 유니크 제약이 있어 upsert(ignoreDuplicates)가 원자적으로 중복을 막아준다.
    // 이번 요청이 실제로 새로 넣은 것인지는 반환된 행 유무로 판단한다(select-후-insert 방식은
    // 두 태그가 거의 동시에 들어오면 경쟁 상태로 중복이 생길 수 있어 이 방식으로 바꿨다).
    const { data: inserted } = await supabase
      .from('student_checkins')
      .upsert({ student_id, class_id: matchedClassId, date: dateStr, late }, { onConflict: 'student_id,date', ignoreDuplicates: true })
      .select('late')

    if (!inserted || inserted.length === 0) {
      const { data: existing } = await supabase
        .from('student_checkins').select('late').eq('student_id', student_id).eq('date', dateStr).maybeSingle()
      return new Response(
        JSON.stringify({ success: true, studentName: student.name, late: existing?.late ?? late, notified: false, already: true }),
        { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // 학부모 연락 — 정보가 없으면 등원 기록만 남기고 메시지/알림은 건너뜀
    const { data: ps } = await supabase
      .from('parent_students').select('parent_id').eq('student_id', student_id).maybeSingle()
    let notified = false
    if (ps?.parent_id) {
      const { data: parent } = await supabase
        .from('parents').select('id, phone').eq('id', ps.parent_id).maybeSingle()
      if (parent?.phone) {
        const hour = kstNow.getHours()
        const minute = String(kstNow.getMinutes()).padStart(2, '0')
        const message = `${student.name} 학생이 ${hour}시 ${minute}분에 등원 완료했습니다.`

        await supabase.from('inquiry_messages').insert({
          parent_id: parent.id, sender_type: 'admin', content: message,
        })

        await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
          body: JSON.stringify({
            parent_phone: parent.phone,
            title: '티처스 수학학원',
            body: message,
            link: '/parent/inquiries',
          }),
        }).catch(() => {})
        notified = true
      }
    }

    // 학생 본인 알림 — 학생 계정으로 로그인해 알림을 켜둔 경우, 본인이 태그(등원)됐음을
    // 바로 확인할 수 있도록 별도로 푸시를 보낸다 (학부모 알림과는 무관하게 항상 시도).
    const hour = kstNow.getHours()
    const minute = String(kstNow.getMinutes()).padStart(2, '0')
    await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
      body: JSON.stringify({
        student_id,
        title: '티처스 수학학원',
        body: `${hour}시 ${minute}분에 등원 체크인되었습니다.`,
        link: '/student/records',
      }),
    }).catch(() => {})

    return new Response(
      JSON.stringify({ success: true, studentName: student.name, late, notified }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
