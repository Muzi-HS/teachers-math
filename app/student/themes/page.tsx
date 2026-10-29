'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useStudentTheme } from '@/context/StudentThemeContext'
import { isGiantsTheme, isUniversityTheme, UNIVERSITY_THEMES, type StudentTheme } from '@/lib/student-theme'
import UniversityBrandPanel from '@/components/UniversityBrandPanel'
import s from './themes.module.css'

const choices: { id: StudentTheme; name: string }[] = [
  { id: 'green', name: '기본 그린' },
  { id: 'giants-light', name: '자이언츠 라이트' },
  { id: 'giants-uniform', name: '자이언츠 유니폼' },
  ...Object.entries(UNIVERSITY_THEMES).map(([id, item]) => ({ id: id as StudentTheme, name: item.name })),
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
    <Link href="/preview/universities" className={s.previewLink}>대학교 테마 · 홈과 타이머 미리보기 ↗</Link>
    <div className={s.cards} role="group" aria-label="학생 테마 선택">
      {choices.map(item => <button type="button" key={item.id} className={s.card} data-theme={item.id} data-student-theme={item.id} aria-pressed={selected === item.id} disabled={saving || loading} onClick={() => { setSelection(item.id); setMessage('') }}>
        <div className={s.swatchHeader} aria-hidden="true"><i /><span>티처스 수학학원</span>{isGiantsTheme(item.id) && <em>GIANTS</em>}{isUniversityTheme(item.id) && <em className={s.universityLabel}>{UNIVERSITY_THEMES[item.id].short}</em>}</div>
        {isUniversityTheme(item.id) && <div className={s.campusPreview} aria-hidden="true"><UniversityBrandPanel theme={item.id} /></div>}
        <div className={s.swatchBody}><strong>{item.name}</strong>{selected === item.id && <span className={s.check} aria-hidden="true">✓</span>}</div>
      </button>)}
    </div>
    <button type="button" className={s.apply} disabled={saving || loading} onClick={apply}>{loading ? '저장된 테마 확인 중…' : saving ? '저장 중…' : '이 테마 사용하기'}</button>
    {error && <p className={s.error} role="alert">{error}</p>}
    <p className={s.message} role="status">{message}</p>
    <p className={s.hint}>홈·타이머·쿠폰함에 함께 적용돼요. 언제든 다시 바꿀 수 있어요.</p>
  </div>
}
