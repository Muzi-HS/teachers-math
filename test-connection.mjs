import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://qroeybkvaqlssbpbxhyq.supabase.co'
const SUPABASE_KEY = 'sb_publishable_FNCqfNfl41a46yhF7flo3Q_D2Jvmssk'   // anon public key

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function test() {
  console.log('Supabase 연결 테스트 시작...\n')

  const { data: teachers, error: e1 } = await supabase
    .from('teachers')
    .select('name, role')

  if (e1) {
    console.error('❌ teachers 조회 실패:', e1.message)
  } else {
    console.log('✅ teachers 테이블 연결 성공!')
    console.log('   등록된 선생님:', teachers.length > 0 ? teachers : '(아직 없음)')
  }

  const { data: students, error: e2 } = await supabase
    .from('students')
    .select('name, school')

  if (e2) {
    console.error('❌ students 조회 실패:', e2.message)
  } else {
    console.log('\n✅ students 테이블 연결 성공!')
    console.log('   등록된 학생:', students.length > 0 ? students : '(아직 없음)')
  }

  console.log('\n테스트 완료!')
}

test()