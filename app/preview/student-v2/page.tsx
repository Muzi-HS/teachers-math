import type { Metadata } from 'next'
import StudentPreview from '@/components/student-preview/StudentPreview'

export const metadata: Metadata = { title: '학생 화면 시안 | 티처스 수학학원', robots: { index: false, follow: false } }
export default function Page() { return <StudentPreview /> }
