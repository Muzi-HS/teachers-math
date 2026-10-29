'use client'
import { useStudentTheme } from '@/context/StudentThemeContext'
import GiantsCoupon from './student-preview/GiantsCoupon'
import { OriginalCoupon } from './student-preview/OriginalCouponPreview'
import { isGiantsTheme, isUniversityTheme } from '@/lib/student-theme'
import UniversityCoupon from './UniversityCoupon'

export default function StudentCoupon(props: { milestone: number; code: string; used?: boolean }) {
  const { theme } = useStudentTheme()
  if (isUniversityTheme(theme)) return <UniversityCoupon {...props} theme={theme} />
  return isGiantsTheme(theme) ? <GiantsCoupon {...props} preview={false} /> : <OriginalCoupon {...props} />
}
