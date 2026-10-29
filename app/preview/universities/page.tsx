import type { Metadata } from 'next'
import UniversityPreview from '@/components/student-preview/UniversityPreview'
import '@/app/student/student-theme.css'

export const metadata: Metadata = { title: '대학교 학생 테마 미리보기 | 티처스 수학학원', robots: { index: false, follow: false } }
export default function Page() { return <UniversityPreview /> }
