import type { Metadata } from 'next'
import StreakPreviewV2 from '@/components/streak-preview/StreakPreviewV2'

export const metadata: Metadata = {
  title: '숙제 성장 · 쿠폰 디자인 시안 | 티처스 수학학원',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <StreakPreviewV2 />
}
