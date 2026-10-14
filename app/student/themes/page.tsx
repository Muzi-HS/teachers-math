'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useStudentTheme } from '@/context/StudentThemeContext'
import type { StudentTheme } from '@/lib/student-theme'
import s from './themes.module.css'

const choices: { id: StudentTheme; name: string; description: string }[] = [
  { id: 'green', name: '기본 그린', description: '편안한 그린과 함께 차근차근 쌓는 공부 습관' },
  { id: 'giants-light', name: '자이언츠 라이트', description: '흰색 줄무늬 헤더와 은은한 로고가 있는 밝은 테마' },
  { id: 'giants-uniform', name: '자이언츠 유니폼', description: '네이비 헤더와 화이트 핀스트라이프의 홈 유니폼 테마' },
]
export default function StudentThemes() {
  const { theme, loading, error, save } = useStudentTheme()
  const [selection, setSelection] = useState<StudentTheme | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const selected = selection ?? theme
  async function apply() {
    setSaving(true); setMessage('')
    try { if (await save(selected)) setMessage('내 테마를 저장했어요. 다른 기기에서도 같은 테마로 만나요.') }
    finally { setSaving(false) }
  }
  return <div className={s.page}>
    <Link href="/student/home" className={s.back}>← 학생 홈</Link>
    <h1>내 테마</h1><p className={s.description}>나의 공부 공간을 좋아하는 분위기로 꾸며보세요.</p>
    <div className={s.cards} role="group" aria-label="학생 테마 선택">
      {choices.map(item => <button type="button" key={item.id} className={s.card} data-theme={item.id} aria-pressed={selected === item.id} disabled={saving || loading} onClick={() => { setSelection(item.id); setMessage('') }}>
        <div className={s.mini} aria-hidden="true"><div className={s.miniHeader}><i />티처스 수학학원{item.id !== 'green' && <em>GIANTS</em>}</div><div className={s.miniMain}><span className={s.miniLogo} /><b>이번 숙제</b><div className={s.miniHomework}><small>다음 수업까지</small><span>오늘도 한 문제씩, 차근차근.</span><i /><i /><strong>수업기록 보기 →</strong></div><div className={s.miniGrowth}>✦ 연속 숙제 이행</div></div><div className={s.miniNav}><b>홈</b><span>시험</span><span>학원일정</span><span>공지</span><span>쿠폰함</span></div></div>
        <div className={s.label}><strong>{item.name}</strong><span>{theme === item.id ? '사용 중' : selected === item.id ? '선택됨' : '선택'}</span></div><p>{item.description}</p>
      </button>)}
    </div>
    <button type="button" className={s.apply} disabled={saving || loading} onClick={apply}>{loading ? '저장된 테마 확인 중…' : saving ? '저장 중…' : '이 테마 사용하기'}</button>
    {error && <p className={s.error} role="alert">{error}</p>}
    <p className={s.message} role="status">{message}</p>
    <p className={s.hint}>홈·타이머·쿠폰함에 함께 적용돼요. 언제든 다시 바꿀 수 있어요.</p>
  </div>
}
