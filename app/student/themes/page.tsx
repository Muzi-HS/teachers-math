'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useStudentTheme } from '@/context/StudentThemeContext'
import type { StudentTheme } from '@/lib/student-theme'
import s from './themes.module.css'

const choices: { id: StudentTheme; name: string }[] = [
  { id: 'green', name: '기본 그린' },
  { id: 'giants-light', name: '자이언츠 라이트' },
  { id: 'giants-uniform', name: '자이언츠 유니폼' },
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
        <div className={s.swatch} aria-hidden="true"><div className={s.swatchHeader} /><div className={s.swatchBody}><i /></div></div>
        <div className={s.label}><strong>{item.name}</strong><span>{theme === item.id ? '사용 중' : selected === item.id ? '선택됨' : ''}</span></div>
      </button>)}
    </div>
    <button type="button" className={s.apply} disabled={saving || loading} onClick={apply}>{loading ? '저장된 테마 확인 중…' : saving ? '저장 중…' : '이 테마 사용하기'}</button>
    {error && <p className={s.error} role="alert">{error}</p>}
    <p className={s.message} role="status">{message}</p>
    <p className={s.hint}>홈·타이머·쿠폰함에 함께 적용돼요. 언제든 다시 바꿀 수 있어요.</p>
  </div>
}
