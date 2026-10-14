import type { Metadata } from 'next'
import OriginalCouponPreview from '@/components/student-preview/OriginalCouponPreview'

export const metadata: Metadata = { title: '그린 테마 쿠폰 디자인 시안 | 티처스 수학학원', robots: { index: false, follow: false } }
export default function Page() { return <OriginalCouponPreview /> }
