import type { Metadata } from 'next'
import GiantsPreview from '@/components/student-preview/GiantsPreview'

export const metadata: Metadata = { title: '자이언츠 뽀모도로 예시 | 티처스 수학학원', robots: { index: false, follow: false } }
export default function Page() { return <GiantsPreview initialTab="study" /> }
