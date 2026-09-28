import type { Metadata } from 'next'
import ParentPreview from '@/components/parent-preview/ParentPreview'

export const metadata: Metadata = {
  title: '학부모 화면 시안 | 티처스 수학학원',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <ParentPreview />
}
