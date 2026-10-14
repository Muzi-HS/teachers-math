'use client'
import { useStudentTheme } from '@/context/StudentThemeContext'
import GiantsCoupon from './student-preview/GiantsCoupon'
import { OriginalCoupon } from './student-preview/OriginalCouponPreview'

export default function StudentCoupon(props: { milestone: number; code: string; used?: boolean }) {
  const { theme } = useStudentTheme()
  return theme === 'green' ? <OriginalCoupon {...props} /> : <GiantsCoupon {...props} preview={false} />
}
